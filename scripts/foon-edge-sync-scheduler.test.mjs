import test from "node:test";
import assert from "node:assert/strict";
import {createOptInEdgeSyncScheduler} from "./foon-edge-sync-scheduler.mjs";

function fakeClock(){
  let id=0;
  const timers=new Map();
  const schedule=(fn,ms)=>{
    const handle=++id;
    timers.set(handle,{fn,ms});
    return handle;
  };
  const cancel=handle=>timers.delete(handle);
  const next=async()=>{
    if(!timers.size)throw Error("W13_TEST_MISSING_TIMER");
    const [id,job]=timers.entries().next().value;
    timers.delete(id);
    await job.fn();
    return job.ms;
  };
  return {timers,schedule,cancel,next};
}
const create=(clock,runBatch,rest={})=>createOptInEdgeSyncScheduler({
  schedule:clock.schedule,cancel:clock.cancel,runBatch,
  baseDelayMs:1000,maximumDelayMs:16000,...rest
});
test("W13 import and scheduler construction never starts network or timers",()=>{
  const clock=fakeClock();
  let calls=0;
  const service=create(clock,async()=>{calls++;return {acked:0,retry:0};});
  assert.equal(clock.timers.size,0);
  assert.equal(calls,0);
  assert.equal(service.status().active,false);
  assert.equal(service.wake(),false);
  assert.equal(service.resumeAfterReview(),false);
  assert.equal(service.stop(),false);
});

test("W13 opt-in starts once, processes durable ACK result and stops without new work",async()=>{
  const clock=fakeClock();
  let calls=0;
  const service=create(clock,async()=>{calls++;return {acked:4,retry:0};});
  assert.equal(service.start(),true);
  assert.equal(service.start(),false);
  assert.equal(clock.timers.size,1);
  assert.equal(await clock.next(),0);
  assert.equal(service.status().processed,4);
  assert.equal(service.status().lastStatus,"idle");
  assert.equal(calls,1);
  assert.equal(clock.timers.size,1);
  assert.equal(service.stop(),true);
  assert.equal(clock.timers.size,0);
  assert.equal(service.status().active,false);
});

test("W13 offline retries have capped exponential backoff and clear after success",async()=>{
  const clock=fakeClock();
  let runs=0;
  const service=create(clock,async()=>{
    runs++;
    return runs<5?{acked:0,retry:1}:{acked:2,retry:0};
  },{maximumDelayMs:8000});
  service.start();
  assert.equal(await clock.next(),0);
  for(const delay of [2000,4000,8000,8000]){
    assert.equal(await clock.next(),delay);
  }
  assert.equal(service.status().processed,2);
  assert.equal(service.status().failures,0);
  assert.equal(await clock.next(),1000);
  service.stop();
});

test("W13 server conflict pauses permanently until operator explicitly resumes",async()=>{
  const clock=fakeClock();
  let calls=0;
  const service=create(clock,async()=>{
    calls++;
    return calls===1?{acked:0,retry:0,conflicts:1}:{acked:1,retry:0};
  });
  service.start();
  await clock.next();
  assert.equal(service.status().paused,true);
  assert.equal(service.status().lastStatus,"needs-review");
  assert.equal(clock.timers.size,0);
  assert.equal(service.wake(),false);
  assert.equal(service.resumeAfterReview(),true);
  assert.equal(await clock.next(),0);
  assert.equal(service.status().processed,1);
  assert.equal(service.status().paused,false);
  service.stop();
});

test("W13 does not start concurrent batches; wakes once after in-flight result",async()=>{
  const clock=fakeClock();
  let calls=0;
  let complete;
  const service=create(clock,async()=>{
    calls++;
    if(calls===1)return new Promise(resolve=>{complete=resolve;});
    return {acked:0,retry:0};
  });
  service.start();
  const first=clock.next();
  await Promise.resolve();
  assert.equal(service.status().inFlight,true);
  assert.equal(service.wake(),true);
  assert.equal(clock.timers.size,0);
  complete({acked:1,retry:0});
  assert.equal(await first,0);
  assert.equal(clock.timers.size,1);
  assert.equal(await clock.next(),0);
  assert.equal(calls,2);
  assert.equal(service.status().processed,1);
  service.stop();
});

test("W13 stop/start invalidates stale response without ACK or skipped wake",async()=>{
  const clock=fakeClock();
  let complete,calls=0;
  const service=create(clock,async()=>{
    calls++;
    if(calls===1)return new Promise(resolve=>{complete=resolve;});
    return {acked:3,retry:0};
  });
  service.start();
  const first=clock.next();
  await Promise.resolve();
  assert.equal(service.stop(),true);
  assert.equal(service.start(),true);
  const blocked=clock.next();
  assert.equal(await blocked,0);
  complete({acked:99,retry:0});
  await first;
  assert.equal(service.status().processed,0,"stale result must not count");
  assert.equal(clock.timers.size,1,"fresh attempt must be armed after stale completion");
  await clock.next();
  assert.equal(service.status().processed,3);
  service.stop();
});

test("W13 unexpected result never succeeds or leaks exception body",async()=>{
  const clock=fakeClock();
  const service=create(clock,async()=>({acked:-2,retry:0}));
  service.start();
  await clock.next();
  assert.equal(service.status().failures,1);
  assert.equal(service.status().lastStatus,"retry-wait");
  assert.equal(service.status().processed,0);
  service.stop();
});

// W13 opt-in synchronizer lifecycle for a future trusted native Edge service.
// This module does nothing at import time, never reads environment secrets,
// never accesses local SQLite or a network endpoint by itself, and cannot
// start without an explicit caller. runBatch must be an authorized, verified
// syncLocalOutbox wrapper when device enrollment is completed.
export function createOptInEdgeSyncScheduler({
  runBatch,
  baseDelayMs=30000,
  maximumDelayMs=300000,
  schedule=(callback,delay)=>setTimeout(callback,delay),
  cancel=handle=>clearTimeout(handle)
}={}){
  if(typeof runBatch!=="function"||typeof schedule!=="function"||typeof cancel!=="function"||
    !Number.isSafeInteger(baseDelayMs)||baseDelayMs<1000||baseDelayMs>300000||
    !Number.isSafeInteger(maximumDelayMs)||maximumDelayMs<baseDelayMs||maximumDelayMs>3600000)
    throw Error("W13_INVALID_SCHEDULER_CONFIGURATION");

  let active=false,paused=false,inFlight=false,wakePending=false;
  let epoch=0,timer=null,failures=0,lastStatus="stopped",processed=0;
  let lastAttempt=null;

  const clearTimer=()=>{
    if(timer!==null){cancel(timer);timer=null;}
  };
  const backoff=()=>Math.min(maximumDelayMs,baseDelayMs*2**Math.min(failures,20));
  const arm=(delay)=>{
    if(!active||paused)return;
    clearTimer();
    timer=schedule(()=>{
      timer=null;
      return attempt();
    },delay);
  };

  async function attempt(){
    if(!active||paused)return;
    if(inFlight){wakePending=true;return;}
    inFlight=true;
    const runEpoch=epoch;
    lastStatus="running";
    lastAttempt=new Date().toISOString();
    let delay=baseDelayMs;
    try{
      const result=await runBatch();
      if(!result||!Number.isSafeInteger(result.acked)||result.acked<0||
         !Number.isSafeInteger(result.retry)||result.retry<0||
         result.conflicts!==undefined&&(!Number.isSafeInteger(result.conflicts)||result.conflicts<0)){
        throw Error("W13_INVALID_SYNC_RESULT");
      }
      if(runEpoch!==epoch)return; // stale job after explicit stop/start
      processed+=result.acked;
      if(result.conflicts>0){
        paused=true;failures=0;lastStatus="needs-review";
        return; // conflict must never be automatically retried
      }
      if(result.retry>0){
        failures++;delay=backoff();lastStatus="retry-wait";
      }else{
        failures=0;lastStatus="idle";delay=baseDelayMs;
      }
    }catch{
      if(runEpoch!==epoch)return;
      failures++;delay=backoff();lastStatus="retry-wait";
    }finally{
      inFlight=false;
      if(active&&!paused){
        if(runEpoch!==epoch){
          // A new explicit start occurred while the old request was running.
          // Ignore the stale receipt/counters and schedule ONE fresh attempt.
          wakePending=false;
          arm(0);
        }else if(wakePending){
          wakePending=false;
          arm(0);
        }else{
          arm(delay);
        }
      }
    }
  }

  const start=()=>{
    if(active)return false;
    active=true;paused=false;failures=0;wakePending=false;
    lastStatus="idle";
    epoch++;arm(0);
    return true;
  };
  const stop=()=>{
    const previous=active||paused;
    active=false;paused=false;wakePending=false;
    lastStatus="stopped";epoch++;clearTimer();
    return previous;
  };
  const wake=()=>{
    if(!active||paused)return false;
    if(inFlight){wakePending=true;return true;}
    arm(0);
    return true;
  };
  // Only an explicit operator action should release a persisted conflict.
  const resumeAfterReview=()=>{
    if(!active||!paused)return false;
    paused=false;failures=0;wakePending=false;
    lastStatus="idle";epoch++;arm(0);
    return true;
  };
  // Safe status: never include tokens, URLs, event payloads or order IDs.
  const status=()=>Object.freeze({
    active,paused,inFlight,failures,processed,lastStatus,lastAttempt
  });
  return Object.freeze({start,stop,wake,resumeAfterReview,status});
}

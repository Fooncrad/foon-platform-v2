// Read a feature-gated sync request without buffering an unbounded chunked body.
// The limit is measured in wire bytes, not UTF-16 string characters.
export async function readBoundedSyncRequestText(request,maxBytes=300_000,maxWaitMs=30_000){
 if(!request||!Number.isSafeInteger(maxBytes)||maxBytes<1||!Number.isSafeInteger(maxWaitMs)||maxWaitMs<1)throw Error("SYNC_INVALID_BODY");
 const length=request.headers?.get("content-length");
 if(length!==null&&length!==undefined){
  if(!/^(0|[1-9][0-9]*)$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)>maxBytes)throw Error("SYNC_PAYLOAD_TOO_LARGE");
 }
 if(!request.body)return "";
 const reader=request.body.getReader();
 const decoder=new TextDecoder("utf-8",{fatal:true});
 let bytes=0,text="";
 // A slow or stopped upload must not hold a server worker indefinitely.
 // Use a total-body deadline, not a per-chunk deadline that trickle uploads can reset.
 let timer;
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("SYNC_BODY_TIMEOUT")),maxWaitMs);});
 try{
  for(;;){
   const {done,value}=await Promise.race([reader.read(),deadline]);
   if(done)break;
   if(!(value instanceof Uint8Array))throw Error("SYNC_INVALID_BODY");
   bytes+=value.byteLength;
   if(bytes>maxBytes)throw Error("SYNC_PAYLOAD_TOO_LARGE");
   text+=decoder.decode(value,{stream:true});
  }
  text+=decoder.decode();
  return text;
 }catch(error){
  // Do not wait for an untrusted stream's cancellation hook: it can stall forever.
  // Still initiate cancellation and consume any asynchronous cleanup rejection.
  try{void reader.cancel().catch(()=>{});}catch{/* Preserve the original rejection. */}
  if(error instanceof TypeError)throw Error("SYNC_INVALID_BODY");
  throw error;
 }finally{clearTimeout(timer);reader.releaseLock();}
}

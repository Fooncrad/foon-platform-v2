import {createHash} from 'node:crypto';
import {desktopSyncConfig} from './desktop-sync-config.mjs';
import {eventDigest} from '../../scripts/foon-edge-sync-contract.mjs';
import {verifyEdgeAck} from '../../scripts/foon-edge-sync-worker.mjs';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function readJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw Error('DESKTOP_INVALID_RESPONSE');
  const parts=[]; let bytes=0;
  try {
    while (true) {const {done,value}=await reader.read(); if(done)break; bytes+=value.length; if(bytes>2*1024*1024){await reader.cancel();throw Error('DESKTOP_RESPONSE_TOO_LARGE');} parts.push(value);}
  } finally {reader.releaseLock();}
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
async function refreshDevice(connection, config, fetchImpl) {
  const response = await fetchImpl(new URL('/api/edge/catalog',config.cloudUrl), {headers:{authorization:'Bearer '+config.token},redirect:'error',signal:AbortSignal.timeout(8000)});
  if ([401,403].includes(response.status)) {
    await connection.execute("UPDATE desktop_sync_devices SET state='blocked',last_error='DEVICE_AUTHORIZATION_REQUIRED' WHERE device_id=?",[config.deviceId]);
    throw Error('DEVICE_AUTHORIZATION_REQUIRED');
  }
  if (!response.ok) throw Error('DESKTOP_CLOUD_UNAVAILABLE');
  const catalog = await readJson(response);
  const identity=catalog.identity;
  if (!identity || catalog.mode!=='plain_takeaway' || ['deviceId','tenantId','branchId','actorUserId'].some(key=>identity[key]!==config[key])) throw Error('DESKTOP_CATALOG_SCOPE_MISMATCH');
  if(typeof catalog.permissions?.createOrders!=='boolean'||typeof catalog.permissions?.updateOrders!=='boolean')throw Error('DESKTOP_CATALOG_SCOPE_MISMATCH');
  const lease=Date.parse(catalog.validUntil),saved=Date.parse(catalog.savedAt),now=Date.now();
  if (!Number.isFinite(lease)||!Number.isFinite(saved)||saved>now+60000||saved<now-60000||lease<=now||lease>now+8*60*60*1000+60000) throw Error('DESKTOP_CATALOG_LEASE_INVALID');
  // The cloud grant never creates or promotes a local user or membership.
  const [local] = await connection.execute("SELECT m.role FROM memberships m JOIN users u ON u.id=m.user_id AND u.status='active' JOIN tenants t ON t.id=m.tenant_id AND t.status='active' JOIN branches b ON b.tenant_id=t.id AND b.id=? AND b.enabled=TRUE WHERE m.tenant_id=? AND m.user_id=? AND m.status='active'",[config.branchId,config.tenantId,config.actorUserId]);
  if(local.length!==1||local[0].role!==identity.role||!['owner','manager','cashier','kitchen'].includes(identity.role))throw Error('DESKTOP_LOCAL_IDENTITY_MISMATCH');
  await connection.execute("INSERT INTO desktop_sync_devices(device_id,tenant_id,branch_id,actor_user_id,lease_until) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE device_id=device_id",[config.deviceId,config.tenantId,config.branchId,config.actorUserId,new Date(lease)]);
  const [existing]=await connection.execute('SELECT tenant_id,branch_id,actor_user_id FROM desktop_sync_devices WHERE device_id=?',[config.deviceId]);
  if(existing.length!==1||existing[0].tenant_id!==config.tenantId||existing[0].branch_id!==config.branchId||existing[0].actor_user_id!==config.actorUserId)throw Error('DESKTOP_LOCAL_IDENTITY_MISMATCH');
  await connection.execute("UPDATE desktop_sync_devices SET state='active',lease_until=?,can_create=?,can_update=?,last_error=NULL WHERE device_id=?",[new Date(lease),catalog.permissions.createOrders,catalog.permissions.updateOrders,config.deviceId]);
}
export async function syncDesktopBatch(pool, config=desktopSyncConfig(), {fetchImpl=fetch, batchSize=10}={}) {
  if(!config)return {disabled:true};
  config=desktopSyncConfig(config);
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>25)throw Error('DESKTOP_INVALID_BATCH_SIZE');
  const connection=await pool.getConnection();
  const lock='foon:desktop:'+createHash('sha256').update(config.deviceId).digest('hex').slice(0,40);
  let acquired=false;
  const result={synced:0,retrying:0,conflicts:0};
  try {
    const [[claim]]=await connection.execute('SELECT GET_LOCK(?,0) AS acquired',[lock]);
    if(Number(claim.acquired)!==1)return {busy:true};
    acquired=true;
    try{await refreshDevice(connection,config,fetchImpl);}catch(error){
      if(['DESKTOP_CATALOG_SCOPE_MISMATCH','DESKTOP_CATALOG_LEASE_INVALID','DESKTOP_LOCAL_IDENTITY_MISMATCH'].includes(error.message))await connection.execute("UPDATE desktop_sync_devices SET state='blocked',last_error='DEVICE_AUTHORIZATION_REQUIRED' WHERE device_id=?",[config.deviceId]);
      throw error;
    }
    const [events]=await connection.execute("SELECT * FROM desktop_sync_outbox WHERE device_id=? AND state<>'synced' ORDER BY id LIMIT "+batchSize,[config.deviceId]);
    for(const row of events){
      if(row.tenant_id!==config.tenantId||row.branch_id!==config.branchId)throw Error('DESKTOP_OUTBOX_SCOPE_MISMATCH');
      if(row.state==='conflict'){result.conflicts++;break;}
      if(row.next_attempt_at && new Date(row.next_attempt_at).getTime()>Date.now())break;
      let event;
      try{
        event={seq:Number(row.id),order_id:row.order_id,kind:row.kind,payload:JSON.parse(row.payload)};
        if(eventDigest(event)!==row.digest)throw Error('DESKTOP_OUTBOX_DIGEST_MISMATCH');
      }catch{
        await connection.execute("UPDATE desktop_sync_outbox SET state='conflict',last_error='DESKTOP_OUTBOX_INTEGRITY_REVIEW' WHERE id=? AND device_id=?",[row.id,config.deviceId]);
        result.conflicts++;break;
      }
      let error='DESKTOP_CLOUD_UNAVAILABLE', conflict=false;
      try {
        const response=await fetchImpl(config.cloudUrl,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{authorization:'Bearer '+config.token,'content-type':'application/json'},body:JSON.stringify({tenantId:config.tenantId,branchId:config.branchId,deviceId:config.deviceId,eventSeq:event.seq,orderId:event.order_id,kind:event.kind,payload:event.payload,digest:row.digest})});
        const body=await readJson(response);
        if([200,201].includes(response.status)&&verifyEdgeAck(event,body.receipt,config.deviceId,config.receiptKey)){
          // Crash before this commit leaves a replayable event with exactly the same key/payload.
          await connection.beginTransaction();
          try{
            const [ack]=await connection.execute("UPDATE desktop_sync_outbox SET state='synced',receipt=?,synced_at=UTC_TIMESTAMP(3),last_error=NULL,next_attempt_at=NULL,attempts=attempts+1 WHERE id=? AND device_id=? AND digest=? AND state IN ('pending','retrying')",[JSON.stringify(body.receipt),row.id,config.deviceId,row.digest]);
            if(ack.affectedRows!==1)throw Error('DESKTOP_ACK_CONFLICT');
            await connection.commit();
          }catch(cause){await connection.rollback();throw cause;}
          result.synced++;continue;
        }
        if([401,403].includes(response.status)){
          await connection.execute("UPDATE desktop_sync_devices SET state='blocked',last_error='DEVICE_AUTHORIZATION_REQUIRED' WHERE device_id=?",[config.deviceId]);
          error='DEVICE_AUTHORIZATION_REQUIRED';
        }else if([400,409,413,422].includes(response.status)){
          conflict=true;
          error=new Set(['EDGE_CATALOG_PRICE_CHANGED','EDGE_CHECKOUT_TOTAL_CHANGED','EDGE_CONCURRENT_ORDER_UPDATE','EDGE_REQUIRED_OPTIONS_NOT_SUPPORTED','EDGE_ORDER_ID_CONFLICT','EDGE_IDEMPOTENCY_CONFLICT','EDGE_ORDER_NOT_FOUND','EDGE_INVALID_STATUS_TRANSITION','EDGE_REFUND_REQUIRED']).has(body.error)?body.error:'DESKTOP_ORDER_REVIEW_REQUIRED';
        }else if(response.ok)error='UNVERIFIED_CLOUD_RECEIPT';
      }catch{/* Keep bounded non-sensitive errors. A lost ACK is a retry, never a second event. */}
      const attempt=Number(row.attempts)+1;
      const delay=Math.min(300000,1000*2**Math.min(attempt,8))+Math.floor(Math.random()*500);
      await connection.execute("UPDATE desktop_sync_outbox SET state=?,attempts=attempts+1,last_error=?,next_attempt_at=? WHERE id=? AND device_id=? AND digest=? AND state<>'synced'",[conflict?'conflict':'retrying',error,conflict?null:new Date(Date.now()+delay),row.id,config.deviceId,row.digest]);
      if(conflict)result.conflicts++;else result.retrying++;
      break; // Never send a later status while an earlier event is unresolved.
    }
    return result;
  }finally{
    try{if(acquired)await connection.execute('SELECT RELEASE_LOCK(?)',[lock]);}finally{connection.release();}
  }
}
export function startDesktopSync(pool, config=desktopSyncConfig()) {
  if(!config)return ()=>{};
  let stopping=false;
  const run=async()=>{
    while(!stopping){
      try{await syncDesktopBatch(pool,config);}catch{/* Durable events remain pending; never log credentials or payloads. */}
      if(!stopping)await sleep(5000);
    }
  };
  void run();
  return ()=>{stopping=true;};
}

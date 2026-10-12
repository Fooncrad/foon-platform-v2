// MySQL adapter for acceptEdgeEvent. Requires migration 0073.
// Caller must authenticate identity and authorize each business mutation.
// Never treat the inbox insert alone as an applied order.
import {randomUUID} from "node:crypto";

export function mysqlEdgeInboxAdapter(pool,applyBusinessMutation,authorizeTransaction=async()=>{}){
 if(!pool||typeof pool.getConnection!=="function"||typeof applyBusinessMutation!=="function")throw new Error("EDGE_MYSQL_ADAPTER_INVALID");
 return {async transaction(fn){
  const connection=await pool.getConnection();
  try{
   await connection.beginTransaction();
   await authorizeTransaction(connection);
   const tx={
    async insertInbox(event){
     const receiptId=randomUUID();
     try{
      await connection.execute("INSERT INTO edge_sync_inbox (tenant_id,branch_id,device_id,event_seq,event_kind,order_id,payload_sha256,receipt_id) VALUES (?,?,?,?,?,?,?,?)",[event.tenantId,event.branchId,event.deviceId,event.eventSeq,event.kind,event.orderId,event.digest,receiptId]);
      return {type:"inserted",receipt:{receiptId,deviceId:event.deviceId,eventSeq:event.eventSeq,orderId:event.orderId,digest:event.digest}};
     }catch(error){
      if(error?.code!=="ER_DUP_ENTRY")throw error;
      const [rows]=await connection.execute("SELECT tenant_id,branch_id,device_id,event_seq,event_kind,order_id,payload_sha256,receipt_id FROM edge_sync_inbox WHERE device_id=? AND event_seq=?",[event.deviceId,event.eventSeq]);
      const prior=rows[0];
      if(!prior)throw error; // e.g. receipt-id collision, not event replay
      if(prior.tenant_id!==event.tenantId||prior.branch_id!==event.branchId||prior.event_kind!==event.kind||prior.order_id!==event.orderId)return {type:"duplicate",digest:null,receipt:null};
      return {type:"duplicate",digest:prior.payload_sha256,receipt:{receiptId:prior.receipt_id,deviceId:prior.device_id,eventSeq:Number(prior.event_seq),orderId:prior.order_id,digest:prior.payload_sha256}};
     }
    },
    async applyMutation(event){await applyBusinessMutation(connection,event);}
   };
   const result=await fn(tx);
   await connection.commit();
   return result;
  }catch(error){try{await connection.rollback();}catch{}throw error;}
  finally{connection.release();}
 }};
}

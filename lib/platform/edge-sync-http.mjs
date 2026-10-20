import {authenticateEdgeDevice,deviceReceiptKey,requireEdgePermission} from "./edge-device-auth.mjs";
import {mysqlEdgeInboxAdapter} from "./edge-sync-mysql-adapter.mjs";
import {acceptAndSignEdgeEvent} from "./edge-sync-service.mjs";
import {insertPricedEdgeOrder} from "./edge-sync-create-order.mjs";
import {applyEdgeOrderMutation} from "./edge-sync-order-mutation.mjs";

const headers={"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"};
const response=(status,body)=>new Response(JSON.stringify(body),{status,headers});
async function readInput(request){
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))throw Error("INVALID_EDGE_EVENT");
 const reader=request.body?.getReader();if(!reader)throw Error("INVALID_EDGE_EVENT");
 const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>131072){await reader.cancel();throw Error("BODY_TOO_LARGE");}chunks.push(value);}}
 finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw Error("INVALID_EDGE_EVENT");}
}
async function requireFeature(connection,tenantId,feature){
 const [rows]=await connection.execute("SELECT p.code,COALESCE(af.enabled,pf.enabled) AS enabled FROM tenant_subscriptions s JOIN package_plans p ON p.id=s.plan_id AND p.enabled=TRUE JOIN package_features f ON f.feature_key=? LEFT JOIN package_plan_features pf ON pf.plan_id=p.id AND pf.feature_key=f.feature_key LEFT JOIN tenant_business_profiles bp ON bp.tenant_id=s.tenant_id LEFT JOIN package_plan_activity_features af ON af.plan_id=p.id AND af.feature_key=f.feature_key AND af.activity_code=bp.activity_code WHERE s.tenant_id=? AND s.status='active' AND (s.starts_at IS NULL OR s.starts_at<=NOW()) AND (s.ends_at IS NULL OR s.ends_at>NOW()) LIMIT 1",[feature,tenantId]);
 if(!rows.length||!(rows[0].enabled===null?rows[0].code==="enterprise":Boolean(rows[0].enabled)))throw Error("PLAN_FEATURE_REQUIRED");
}
export async function receiveEdgeRequest(request,{pool,masterKey,plainTakeawayEnabled=false}){
 try{
  if(!plainTakeawayEnabled)throw Error("EDGE_NOT_CONFIGURED");
  // Check configuration before receiving data; never send a receipt without a key.
  deviceReceiptKey(masterKey,"configuration-check");
  const authorization=request.headers.get("authorization");
  const identity=await authenticateEdgeDevice(pool,authorization);
  const event=await readInput(request);
  let authenticated;
  const adapter=mysqlEdgeInboxAdapter(pool,async(connection,e)=>{
   await requireFeature(connection,identity.tenantId,e.kind==="created"?"pos":authenticated.role==="kitchen"?"kds":"orders");
   if(e.kind==="created"){
    if(!["owner","manager","cashier"].includes(authenticated.role))throw Error("EDGE_FORBIDDEN");
    // Plain carts cannot bypass required catalog choices.
    const [groups]=await connection.execute("SELECT id FROM restaurant_menu_option_groups WHERE tenant_id=? AND enabled=TRUE AND (required=TRUE OR min_select>0) AND item_id IN ("+e.payload.items.map(()=>"?").join(",")+") FOR UPDATE",[identity.tenantId,...e.payload.items.map(item=>item.id)]);
    if(groups.length)throw Error("EDGE_REQUIRED_OPTIONS_NOT_SUPPORTED");
    await insertPricedEdgeOrder(connection,e,{actorUserId:authenticated.actorUserId,source:"trusted_server_policy",taxPolicyResolved:true,discountPolicyResolved:true,optionsPolicyResolved:true,taxCents:0,discountCents:0,channel:"takeaway",requirePriceConfirmation:true});
   }else{
    if(authenticated.role==="kitchen"&&!["preparing","ready"].includes(e.payload.status))throw Error("EDGE_FORBIDDEN");
    const [orders]=await connection.execute("SELECT payment_status FROM restaurant_orders WHERE id=? AND tenant_id=? AND branch_id=? FOR UPDATE",[e.orderId,e.tenantId,e.branchId]);
    if(e.payload.status==="cancelled"&&orders[0]?.payment_status==="paid")throw Error("EDGE_REFUND_REQUIRED");
    await applyEdgeOrderMutation(connection,e);
   }
   await connection.execute("INSERT INTO restaurant_audit_events(tenant_id,actor_user_id,action,resource_id,metadata) VALUES (?,?,?, ?,?)",[identity.tenantId,authenticated.actorUserId,"edge."+e.kind,e.orderId,JSON.stringify({deviceId:identity.deviceId,eventSeq:e.eventSeq})]);
  },async connection=>{
   authenticated=await authenticateEdgeDevice(connection,authorization,true);
   await requireEdgePermission(connection,authenticated,event.kind==="created"?"pos":authenticated.role==="kitchen"?"kitchen":"orders",event.kind==="created"?"create":"edit",true);
   if(["deviceId","tenantId","branchId","actorUserId"].some(key=>authenticated[key]!==identity[key]))throw Error("DEVICE_UNAUTHORIZED");
  });
  const result=await acceptAndSignEdgeEvent(event,identity,adapter,deviceReceiptKey(masterKey,identity.deviceId));
  return response(result.status,result.receipt?{receipt:result.receipt,duplicate:result.duplicate??false}:{error:result.error});
 }catch(error){
  const code=error?.message;
  if(error?.code==="ER_DUP_ENTRY")return response(409,{error:"EDGE_ORDER_ID_CONFLICT"});
  if(code==="DEVICE_UNAUTHORIZED")return response(401,{error:code});
  if(["PLAN_FEATURE_REQUIRED","EDGE_FORBIDDEN"].includes(code))return response(403,{error:code});
  if(code==="BODY_TOO_LARGE")return response(413,{error:code});
  if(code==="INVALID_EDGE_EVENT")return response(400,{error:code});
  if(code==="EDGE_NOT_CONFIGURED")return response(503,{error:code});
  const conflicts=new Set(["EDGE_INVALID_CHECKOUT_SETTINGS","EDGE_REQUIRED_OPTIONS_NOT_SUPPORTED","EDGE_ACTOR_NOT_AUTHORIZED","EDGE_BRANCH_UNAVAILABLE","EDGE_CATALOG_ITEM_UNAVAILABLE","EDGE_MIXED_CURRENCY","EDGE_ORDER_NOT_FOUND","EDGE_INVALID_STATUS_TRANSITION","EDGE_CONCURRENT_ORDER_UPDATE","EDGE_REFUND_REQUIRED","EDGE_UNSUPPORTED_ORDER_FIELDS","EDGE_UNSUPPORTED_ITEM_FIELDS","EDGE_INVALID_LOCAL_ORDER_METADATA","EDGE_PRICE_CONFIRMATION_REQUIRED","EDGE_CATALOG_PRICE_CHANGED"]);
  if(conflicts.has(code))return response(409,{error:code});
  return response(503,{error:"EDGE_SYNC_UNAVAILABLE"});
 }
}

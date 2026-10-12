import {authenticateEdgeDevice} from "./edge-device-auth.mjs";
export async function readEdgeCatalog(request,{pool,enabled=false}){
 const headers={"cache-control":"no-store","x-content-type-options":"nosniff"};
 const reply=(status,body)=>Response.json(body,{status,headers});
 if(!enabled)return reply(503,{error:"EDGE_NOT_CONFIGURED"});
 try{
  const identity=await authenticateEdgeDevice(pool,request.headers.get("authorization"));
  const [features]=await pool.execute("SELECT p.code,pf.enabled FROM tenant_subscriptions s JOIN package_plans p ON p.id=s.plan_id AND p.enabled=TRUE JOIN package_features f ON f.feature_key=? LEFT JOIN package_plan_features pf ON pf.plan_id=p.id AND pf.feature_key=f.feature_key WHERE s.tenant_id=? AND s.status='active' AND (s.starts_at IS NULL OR s.starts_at<=NOW()) AND (s.ends_at IS NULL OR s.ends_at>NOW()) LIMIT 1",[identity.role==="kitchen"?"kds":"pos",identity.tenantId]);
  if(!features.length||!(features[0].enabled===null?features[0].code==="enterprise":Boolean(features[0].enabled)))return reply(403,{error:"PLAN_FEATURE_REQUIRED"});
  const [items]=await pool.execute("SELECT mi.id,mi.name,CAST(mi.price AS CHAR) AS price,mi.currency,mc.name AS category FROM restaurant_menu_items mi JOIN restaurant_menu_categories mc ON mc.id=mi.category_id AND mc.tenant_id=mi.tenant_id AND mc.enabled=TRUE JOIN restaurant_resources rr ON rr.id=mi.id AND rr.tenant_id=mi.tenant_id AND rr.kind='menu_item' AND rr.archived=FALSE WHERE mi.tenant_id=? AND mi.enabled=TRUE AND (rr.branch_id IS NULL OR rr.branch_id=?) AND NOT EXISTS (SELECT 1 FROM restaurant_menu_option_groups g WHERE g.tenant_id=mi.tenant_id AND g.item_id=mi.id AND g.enabled=TRUE AND (g.required=TRUE OR g.min_select>0)) ORDER BY mc.sort_order,mi.sort_order,mi.id LIMIT 500",[identity.tenantId,identity.branchId]);
  const now=Date.now();
  const [orders]=await pool.execute("SELECT id,branch_id,status,version,created_at,updated_at FROM restaurant_orders WHERE tenant_id=? AND branch_id=? AND (status IN ('new','preparing','ready') OR updated_at>=DATE_SUB(NOW(),INTERVAL 1 DAY)) ORDER BY created_at DESC LIMIT 500",[identity.tenantId,identity.branchId]);
  if(orders.length){
   const [lines]=await pool.execute("SELECT order_id,menu_item_id AS id,item_name AS name,quantity FROM restaurant_order_items WHERE tenant_id=? AND order_id IN ("+orders.map(()=>"?").join(",")+") ORDER BY id",[identity.tenantId,...orders.map(order=>order.id)]);
   for(const order of orders)order.items=lines.filter(line=>line.order_id===order.id).map(({id,name,quantity})=>({id,name,quantity}));
  }
  return reply(200,{identity:{deviceId:identity.deviceId,tenantId:identity.tenantId,branchId:identity.branchId,actorUserId:identity.actorUserId,role:identity.role},savedAt:new Date(now).toISOString(),validUntil:new Date(now+8*60*60*1000).toISOString(),mode:"plain_takeaway",items,orders});
 }catch(error){return reply(error?.message==="DEVICE_UNAUTHORIZED"?401:503,{error:error?.message==="DEVICE_UNAUTHORIZED"?"DEVICE_UNAUTHORIZED":"EDGE_CATALOG_UNAVAILABLE"});}
}

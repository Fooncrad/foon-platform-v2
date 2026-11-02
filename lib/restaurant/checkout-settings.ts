import type {PoolConnection,RowDataPacket} from "mysql2/promise";
import {checkoutPolicy} from "./checkout-pricing";
export async function checkoutSettings(db:PoolConnection,tenantId:string){
 const [rows]=await db.execute<RowDataPacket[]>("SELECT t.name,r.data FROM tenants t LEFT JOIN restaurant_resources r ON r.tenant_id=t.id AND r.kind='storefront_config' AND r.status='active' AND r.archived=FALSE WHERE t.id=? ORDER BY r.created_at DESC LIMIT 1",[tenantId]);
 const data=rows[0]?.data?(typeof rows[0].data==="string"?JSON.parse(rows[0].data):rows[0].data):{};
 return {policy:checkoutPolicy(data),seller:{name:String(data.legalName||data.brandName||rows[0]?.name||""),taxNumber:String(data.taxNumber||""),address:String(data.address||""),phone:String(data.phone||"")}};
}

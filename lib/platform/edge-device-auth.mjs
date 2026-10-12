import {createHash,createHmac} from "node:crypto";

export function deviceTokenHash(token){
 if(typeof token!=="string"||!/^[a-f0-9]{96}$/.test(token))throw Error("DEVICE_UNAUTHORIZED");
 return createHash("sha256").update(token).digest("hex");
}
export function deviceReceiptKey(masterKey,deviceId){
 if(typeof masterKey!=="string"||Buffer.byteLength(masterKey)<48)throw Error("EDGE_NOT_CONFIGURED");
 return createHmac("sha256",masterKey).update("foon-edge-receipt:v1:"+deviceId).digest("hex");
}
export async function authenticateEdgeDevice(connection,authorization,lock=false){
 const match=typeof authorization==="string"?authorization.match(/^Bearer ([a-f0-9]{96})$/):null;
 if(!match)throw Error("DEVICE_UNAUTHORIZED");
 const tokenHash=deviceTokenHash(match[1]);
 const [rows]=await connection.execute(
  "SELECT d.id AS deviceId,d.tenant_id AS tenantId,d.branch_id AS branchId,d.actor_user_id AS actorUserId,m.role FROM edge_devices d JOIN tenants t ON t.id=d.tenant_id AND t.status='active' JOIN branches b ON b.id=d.branch_id AND b.tenant_id=d.tenant_id AND b.enabled=TRUE JOIN users u ON u.id=d.actor_user_id AND u.status='active' JOIN memberships m ON m.tenant_id=d.tenant_id AND m.user_id=d.actor_user_id AND m.status='active' WHERE d.token_hash=? AND d.enabled=TRUE"+(lock?" FOR UPDATE":""),[tokenHash]);
 if(rows.length!==1||!["owner","manager","cashier","kitchen"].includes(rows[0].role))throw Error("DEVICE_UNAUTHORIZED");
 return rows[0];
}

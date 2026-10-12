// Run by an authorized administrator on the trusted cloud server, never in a browser.
import mysql from "mysql2/promise";
import {randomUUID,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import {deviceTokenHash,deviceReceiptKey} from "../lib/platform/edge-device-auth.mjs";
const args=process.argv.slice(2),value=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const tenantId=value("--tenant"),branchId=value("--branch"),actorUserId=value("--actor"),name=value("--name"),output=value("--output");
if(![tenantId,branchId,actorUserId].every(v=>typeof v==="string"&&/^[a-f0-9-]{36}$/i.test(v))||!name||name.length>180||!output)throw Error("Usage: --tenant UUID --branch UUID --actor UUID --name NAME --output PRIVATE_ENV_FILE");
const deviceId=randomUUID(),cloudToken=randomBytes(48).toString("hex"),receiptKey=deviceReceiptKey(process.env.FOON_EDGE_MASTER_RECEIPT_KEY,deviceId);
const db=await mysql.createConnection(process.env.DATABASE_URL);
try{
 await db.beginTransaction();
 const [rows]=await db.execute("SELECT m.user_id FROM memberships m JOIN users u ON u.id=m.user_id AND u.status='active' JOIN tenants t ON t.id=m.tenant_id AND t.status='active' JOIN branches b ON b.tenant_id=t.id AND b.id=? AND b.enabled=TRUE WHERE m.tenant_id=? AND m.user_id=? AND m.status='active' AND m.role IN ('owner','manager','cashier','kitchen') FOR UPDATE",[branchId,tenantId,actorUserId]);
 if(rows.length!==1)throw Error("DEVICE_SCOPE_NOT_AUTHORIZED");
 await db.execute("INSERT INTO edge_devices(id,tenant_id,branch_id,actor_user_id,name,token_hash) VALUES (?,?,?,?,?,?)",[deviceId,tenantId,branchId,actorUserId,name,deviceTokenHash(cloudToken)]);
 const contents=`FOON_EDGE_DEVICE_ID=${deviceId}\nFOON_EDGE_TENANT_ID=${tenantId}\nFOON_EDGE_BRANCH_ID=${branchId}\nFOON_EDGE_CLOUD_DEVICE_TOKEN=${cloudToken}\nFOON_EDGE_RECEIPT_SIGNING_KEY=${receiptKey}\n`;
 // Exclusive creation prevents overwriting an existing device configuration.
 await writeFile(output,contents,{flag:"wx",mode:0o600});
 await db.commit();
 process.stdout.write("Registered device "+deviceId+". Private configuration saved; restrict its Windows file permissions and transfer only to the trusted edge host.\n");
}catch(error){await db.rollback();throw error;}finally{await db.end();}

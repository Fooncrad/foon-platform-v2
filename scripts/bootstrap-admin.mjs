import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

const url=process.env.DATABASE_URL;
const email=(process.env.BOOTSTRAP_ADMIN_EMAIL||"").trim().toLowerCase();
const password=process.env.BOOTSTRAP_ADMIN_PASSWORD||"";
if(!url) throw new Error("DATABASE_URL_MISSING");
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("BOOTSTRAP_ADMIN_EMAIL_INVALID");
if(password.length<12||password.length>128) throw new Error("BOOTSTRAP_ADMIN_PASSWORD_INVALID");
const db=await mysql.createConnection(url);
try{
 await db.beginTransaction();
 const [rows]=await db.execute("SELECT id FROM users WHERE email=? LIMIT 1",[email]);
 let userId=rows[0]?.id;
 if(!userId){
  userId=randomUUID();
  const hash=await bcrypt.hash(password,12);
  await db.execute("INSERT INTO users(id,email,password_hash,display_name,email_verified_at,status) VALUES (?,?,?,?,NOW(),'active')",[userId,email,hash,"Platform Admin"]);
 }
 await db.execute("INSERT INTO platform_admins(user_id,role,enabled) VALUES (?,'super_admin',TRUE) ON DUPLICATE KEY UPDATE role='super_admin',enabled=TRUE",[userId]);
 await db.commit();
 console.log("Bootstrap admin ready:",email);
}catch(error){await db.rollback();throw error;}finally{await db.end();}

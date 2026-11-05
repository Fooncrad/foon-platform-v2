import test from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
const url=process.env.DATABASE_URL;
if(!url)throw new Error("DATABASE_URL_MISSING");
const db=await mysql.createConnection(url);
try{
 test("display screens and slides exist with tenant-safe schema",async()=>{
  const [screens]=await db.query("SHOW COLUMNS FROM display_screens");
  const [slides]=await db.query("SHOW COLUMNS FROM display_slides");
  const screenNames=new Set(screens.map(x=>x.Field));
  const slideNames=new Set(slides.map(x=>x.Field));
  for(const name of ["id","tenant_id","branch_id","name","token_hash","refresh_seconds","enabled","paused","qr_enabled","qr_position","qr_size","qr_foreground","qr_background","display_layout","created_by"])assert.ok(screenNames.has(name),"missing display_screens."+name);
  for(const name of ["id","screen_id","tenant_id","media_url","external_video_url","video_loop","transition_effect","badge_text","title_ar","title_en","title_fr","duration_seconds","starts_at","ends_at","enabled"])assert.ok(slideNames.has(name),"missing display_slides."+name);
  const [indexes]=await db.query("SHOW INDEX FROM display_screens");
  assert.ok(indexes.some(x=>x.Key_name==="display_screens_token_hash_uq"&&Number(x.Non_unique)===0));
 });
}finally{await db.end();}

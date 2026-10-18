// W08 read-only gate. Requires a newly allocated, EMPTY localhost database.
// Never runs migrations, test fixtures, DROP, DDL, writes, or a cloud request.
import mysql from "mysql2/promise";

function configuration() {
  const raw=process.env.EDGE_TEST_DATABASE_URL;
  if(!raw)throw Error("W08_TEST_URL_REQUIRED");
  let u;
  try{u=new URL(raw);}catch{throw Error("W08_INVALID_TEST_URL");}
  if(u.protocol!=="mysql:"||u.hostname!=="127.0.0.1"||
      (u.port&&u.port!=="3306")||u.pathname!=="/foon_edge_test"||
      !u.username||!u.password||u.hash||u.search||u.username.toLowerCase()==="root")
    throw Error("W08_REJECT_NONLOCAL_OR_NONTEST_DATABASE");
  return u.href;
}

function checkGrants(grants) {
  let scopedAll=false;
  for(const row of grants){
    const value=String(Object.values(row)[0]??"");
    const match=/\bON\s+(.+?)\s+TO\s+/i.exec(value);
    if(!match)throw Error("W08_UNRECOGNIZED_DB_GRANT");
    const object=match[1].replaceAll("`","").trim().toLowerCase();
    if(object==="*.*"){
      if(!/^GRANT\s+USAGE\s+ON\s+/i.test(value))
        throw Error("W08_ACCOUNT_HAS_GLOBAL_PRIVILEGES");
      continue;
    }
    if(object!=="foon_edge_test.*")
      throw Error("W08_ACCOUNT_HAS_OTHER_DATABASE_PRIVILEGES");
    if(/^GRANT\s+ALL\s+PRIVILEGES\s+ON\s+/i.test(value))scopedAll=true;
  }
  if(!scopedAll)throw Error("W08_DATABASE_SCOPED_PRIVILEGES_REQUIRED");
}

async function main(){
  const address=configuration();
  let db;
  try{
    db=await mysql.createConnection({uri:address,connectTimeout:5000,multipleStatements:false});
    const [[identity]]=await db.query("SELECT DATABASE() AS dbname, @@port AS server_port, @@version AS version, CURRENT_USER() AS account");
    if(identity.dbname!=="foon_edge_test"||Number(identity.server_port)!==3306)
      throw Error("W08_CONNECTED_TO_UNEXPECTED_DATABASE");
    const [grants]=await db.query("SHOW GRANTS");
    checkGrants(grants);
    const [tables]=await db.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? LIMIT 1",["foon_edge_test"]);
    if(tables.length)throw Error("W08_TEST_DATABASE_NOT_EMPTY");
    console.log("W08 MYSQL READ-ONLY PREFLIGHT PASSED");
    console.log("DATABASE: foon_edge_test (localhost:3306, empty)");
    console.log("USER: dedicated database-scoped account");
    console.log("SERVER: "+String(identity.version).slice(0,64));
    console.log("NO MIGRATIONS OR DATABASE WRITES PERFORMED");
    console.log("REAL MYSQL MUTATING INTEGRATION REQUIRES SEPARATE APPROVAL");
  }finally{
    if(db)await db.end();
  }
}
main().catch(error=>{
  // Never print mysql2 connection error messages; these may contain credentials/host details.
  const known=new Set([
    "W08_TEST_URL_REQUIRED","W08_INVALID_TEST_URL","W08_REJECT_NONLOCAL_OR_NONTEST_DATABASE",
    "W08_CONNECTED_TO_UNEXPECTED_DATABASE","W08_UNRECOGNIZED_DB_GRANT",
    "W08_ACCOUNT_HAS_GLOBAL_PRIVILEGES","W08_ACCOUNT_HAS_OTHER_DATABASE_PRIVILEGES",
    "W08_DATABASE_SCOPED_PRIVILEGES_REQUIRED","W08_TEST_DATABASE_NOT_EMPTY"
  ]);
  const code=known.has(error?.message)?error.message:"W08_LOCAL_DATABASE_UNAVAILABLE";
  console.error(code);
  process.exitCode=1;
});

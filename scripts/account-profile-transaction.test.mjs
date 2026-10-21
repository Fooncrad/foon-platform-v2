import test from "node:test";
import assert from "node:assert/strict";
import {saveAccountProfile,InactiveAccountError} from "../lib/account/profile-update.ts";

function fixture({active=true,failPhone=false}={}){
 const calls=[];
 const db={
  async beginTransaction(){calls.push("begin");},
  async execute(sql,params){
   calls.push([sql,params]);
   if(sql.startsWith("SELECT id FROM users"))return [active?[{id:"test-user"}]:[]];
   if(failPhone&&sql.startsWith("INSERT INTO user_profiles"))throw new Error("SIMULATED_PROFILE_INSERT_FAILURE");
   return [{affectedRows:1}];
  },
  async commit(){calls.push("commit");},
  async rollback(){calls.push("rollback");}
 };
 return {db,calls};
}
test("account profile saves name and phone in one committed transaction",async()=>{
 const {db,calls}=fixture();
 await saveAccountProfile(db,"test-user","سالم","+966500000000");
 assert.deepEqual(calls.filter(x=>typeof x==="string"),["begin","commit"]);
 assert(calls.some(x=>Array.isArray(x)&&x[0].startsWith("UPDATE users")&&x[1][0]==="سالم"));
 assert(calls.some(x=>Array.isArray(x)&&x[0].startsWith("INSERT INTO user_profiles")&&x[1][1]==="+966500000000"));
});
test("failed phone save rolls back account name too",async()=>{
 const {db,calls}=fixture({failPhone:true});
 await assert.rejects(saveAccountProfile(db,"test-user","سالم",null),/SIMULATED_PROFILE_INSERT_FAILURE/);
 assert.deepEqual(calls.filter(x=>typeof x==="string"),["begin","rollback"]);
});
test("suspended user cannot update profile and transaction rolls back",async()=>{
 const {db,calls}=fixture({active:false});
 await assert.rejects(saveAccountProfile(db,"test-user","سالم",null),InactiveAccountError);
 assert.deepEqual(calls.filter(x=>typeof x==="string"),["begin","rollback"]);
 assert.equal(calls.some(x=>Array.isArray(x)&&x[0].startsWith("UPDATE users")),false);
});

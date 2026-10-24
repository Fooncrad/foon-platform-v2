// Opt-in strict adapter helpers for typed SQL business mutations.
// Affected rows are checked so a journal event cannot claim a write that matched nothing.
// The caller still owns the SQL allowlist, scope predicates and authorization.
export async function requireAffectedBusinessWrite(db,sql,args,{exactlyOne=true}={}){
 if(typeof sql!=="string"||!/^(UPDATE|INSERT|DELETE)\s/i.test(sql)||sql.includes(";")||!Array.isArray(args)||!db||typeof db.execute!=="function")throw Error("SYNC_INVALID_BUSINESS_WRITE");
 const [result]=await db.execute(sql,args);
 if(!result||!Number.isSafeInteger(result.affectedRows)||result.affectedRows<1)throw Error("SYNC_BUSINESS_WRITE_NOT_APPLIED");
 if(exactlyOne&&result.affectedRows!==1)throw Error("SYNC_BUSINESS_WRITE_ROW_COUNT");
 return true;
}

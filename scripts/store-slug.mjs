const reserved=new Set(["admin","api","login","register","account","customer","dashboard","restaurant","menu","auth","settings","creator","creators","help","about","contact","terms","privacy","p","favicon.ico"]);
export function validStoreSlug(value){return typeof value==="string"&&/^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$/.test(value)&&!reserved.has(value);}

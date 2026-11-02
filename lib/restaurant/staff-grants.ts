export type StaffGrant={permission_key:string;branch_id:string|null;allowed:number|boolean};

/** An explicit denial wins over both a view/action grant and manage. */
export function staffCan(grants:readonly StaffGrant[],branch:string|null,module:string,action="view"){
 if(!branch)return false;
 const scoped=grants.filter(g=>g.branch_id===null||g.branch_id===branch);
 const exact=scoped.filter(g=>g.permission_key===module+"."+action);
 if(exact.some(g=>Number(g.allowed)===0))return false;
 return exact.some(g=>Number(g.allowed)===1)||(!exact.length&&scoped.some(g=>g.permission_key===module+".manage"&&Number(g.allowed)===1));
}

export function staffBranchPermissions(grants:readonly StaffGrant[],branch:string|null){
 const keys=new Set(grants.map(g=>g.permission_key.split(".")[0]));
 return [...keys].flatMap(module=>["view","create","edit","accept","reject","cancel","delete"].filter(action=>staffCan(grants,branch,module,action)).map(action=>module+"."+action));
}


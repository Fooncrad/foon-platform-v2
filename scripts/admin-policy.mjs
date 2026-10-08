export function canResetAccountPassword(actorId,targetId,targetRole,password) {
 return typeof actorId==="string"&&typeof targetId==="string"&&actorId!==targetId&&targetRole!=="super_admin"&&
 typeof password==="string"&&password.length>=12&&Buffer.byteLength(password,"utf8")<=72;
}
export function canAccessAllTenants(role,activeActor) {return role==="super_admin"&&activeActor;}

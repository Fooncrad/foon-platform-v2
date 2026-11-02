export function canResetAccountPassword(actorId,targetId,targetRole,password) {
 return typeof actorId==="string"&&typeof targetId==="string"&&actorId!==targetId&&targetRole!=="super_admin"&&
 typeof password==="string"&&password.length>=12&&Buffer.byteLength(password,"utf8")<=72;
}
/** No platform role is an operational tenant membership. */
export function canAccessAllTenants() {return false;}

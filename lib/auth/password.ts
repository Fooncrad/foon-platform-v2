import bcrypt from "bcryptjs";

const COST=12;
export async function hashPassword(password:string){
  if(password.length<9 || password.length>128) throw new Error("INVALID_PASSWORD");
  return bcrypt.hash(password,COST);
}
export async function verifyPassword(password:string,hash:string){
  return bcrypt.compare(password,hash);
}

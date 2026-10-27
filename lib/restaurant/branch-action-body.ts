import {readLimitedJson} from "@/lib/security/limited-json";

// Branch names, slugs, PINs and delivery coordinates fit comfortably in 4 KiB.
// Enforce the actual streamed byte count, including requests without Content-Length.
export const MAX_BRANCH_ACTION_BODY_BYTES=4096;
export type BranchActionBodyResult=
 | {body:Record<string,unknown>;error:null}
 | {body:null;error:"BODY_TOO_LARGE"|"INVALID_INPUT"};

export async function readBranchActionBody(request:Request):Promise<BranchActionBodyResult>{
 try{
  const parsed=await readLimitedJson(request,MAX_BRANCH_ACTION_BODY_BYTES);
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return {body:null,error:"INVALID_INPUT"};
  return {body:parsed as Record<string,unknown>,error:null};
 }catch(error){
  return {body:null,error:error instanceof Error&&error.message==="BATCH_TOO_LARGE"?"BODY_TOO_LARGE":"INVALID_INPUT"};
 }
}

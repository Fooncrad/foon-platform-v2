import {readLimitedJson} from "../security/limited-json.ts";

export type CreatorBodyError={code:"BODY_TOO_LARGE"|"INVALID_INPUT";status:413|400};

/** Read creator mutation JSON with a byte cap, including streamed requests. */
export async function readCreatorMutationJson(
 request:Request,maxBytes:number
):Promise<{body:unknown;error:null}|{body:null;error:CreatorBodyError}>{
 try{return {body:await readLimitedJson(request,maxBytes),error:null};}
 catch(error){
  const tooLarge=error instanceof Error&&error.message==="BATCH_TOO_LARGE";
  return {body:null,error:tooLarge?{code:"BODY_TOO_LARGE",status:413}:{code:"INVALID_INPUT",status:400}};
 }
}

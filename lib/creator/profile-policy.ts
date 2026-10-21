/** Customer creators are personal accounts, not merchant plan roles. */
export type CreatorVisibility="private"|"public";
export type CreatorDraft={handle:string;displayName:string;bio:string;visibility:CreatorVisibility};
export const CREATOR_PORTFOLIO_LIMIT=24;
export function validCreatorHandle(value:unknown):value is string{
 return typeof value==="string"&&/^[a-z0-9][a-z0-9_-]{2,38}[a-z0-9]$/.test(value);
}
export function parseCreatorDraft(input:unknown):CreatorDraft|null{
 if(!input||typeof input!=="object"||Array.isArray(input))return null;
 const data=input as Record<string,unknown>;
 if(typeof data.handle!=="string"||typeof data.displayName!=="string"||typeof data.bio!=="string")return null;
 const handle=data.handle.trim().toLowerCase(),displayName=data.displayName.trim(),bio=data.bio.trim();
 if(!validCreatorHandle(handle)||displayName.length<2||displayName.length>180||bio.length>1500)return null;
 if(data.visibility!=="public"&&data.visibility!=="private")return null;
 return {handle,displayName,bio,visibility:data.visibility};
}
export function parsePortfolioDraft(input:unknown):{mediaId:string;caption:string}|null{
 if(!input||typeof input!=="object"||Array.isArray(input))return null;
 const data=input as Record<string,unknown>;
 if(typeof data.mediaId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.mediaId))return null;
 if(typeof data.caption!=="string"||data.caption.trim().length>240)return null;
 return {mediaId:data.mediaId,caption:data.caption.trim()};
}
export function creatorCanBeSeen(visibility:unknown,active:boolean,customerOnly:boolean):boolean{
 return visibility==="public"&&active&&customerOnly;
}

export const TRANSFER_EVIDENCE_MAX_BYTES=2097152;
export type TransferMime="application/pdf"|"image/jpeg"|"image/png";
/** The filename and browser-reported MIME are untrusted: validate magic bytes only. */
export function identifyTransferEvidence(bytes:Uint8Array):TransferMime|null{
 if(bytes.length===0||bytes.length>TRANSFER_EVIDENCE_MAX_BYTES)return null;
 const isPdf=bytes.length>=8&&bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46&&bytes[4]===0x2d;
 if(isPdf)return "application/pdf";
 const isPng=bytes.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
 if(isPng)return "image/png";
 const isJpeg=bytes.length>=6&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff&&bytes[bytes.length-2]===0xff&&bytes[bytes.length-1]===0xd9;
 if(isJpeg)return "image/jpeg";
 return null;
}

import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {isIP} from 'node:net';
export function publicImageAddress(ip:string){
 if(isIP(ip)!==4)return false;const [a,b]=ip.split('.').map(Number);
 return !(a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0||a>=224);
}
export async function remoteImage(input:string):Promise<Buffer>{
 const u=new URL(input);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||u.href.length>1024)throw Error('HTTPS_IMAGE_REQUIRED');
 const addresses=await lookup(u.hostname,{all:true,family:4});if(!addresses.length||addresses.some(a=>!publicImageAddress(a.address)))throw Error('IMAGE_HOST_NOT_PUBLIC');
 return new Promise((resolve,reject)=>{const req=request(u,{lookup:(_hostname,_options,callback)=>callback(null,addresses[0].address,4)},res=>{
  if(res.statusCode!==200){res.resume();reject(Error('IMAGE_DOWNLOAD_FAILED'));return;}
  const chunks:Buffer[]=[];let size=0;res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>10*1048576){res.destroy(Error('IMAGE_TOO_LARGE'));return;}chunks.push(chunk);});res.on('end',()=>resolve(Buffer.concat(chunks)));res.on('error',reject);
 });const timer=setTimeout(()=>req.destroy(Error('IMAGE_TIMEOUT')),12000);req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end();});
}

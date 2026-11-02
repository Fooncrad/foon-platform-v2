/** Allow-listed creator links. Never render raw user-supplied URL schemes or HTML. */
export const CREATOR_SOCIAL_PLATFORMS=[
 {key:"instagram",label:"Instagram",placeholder:"https://www.instagram.com/yourname"},
 {key:"tiktok",label:"TikTok",placeholder:"https://www.tiktok.com/@yourname"},
 {key:"snapchat",label:"Snapchat",placeholder:"https://www.snapchat.com/add/yourname"},
 {key:"youtube",label:"YouTube",placeholder:"https://www.youtube.com/@yourchannel"},
 {key:"x",label:"X",placeholder:"https://x.com/yourname"},
 {key:"facebook",label:"Facebook",placeholder:"https://www.facebook.com/yourpage"},
 {key:"whatsapp",label:"WhatsApp",placeholder:"https://wa.me/966500000000"},
 {key:"telegram",label:"Telegram",placeholder:"https://t.me/yourname"},
 {key:"threads",label:"Threads",placeholder:"https://www.threads.net/@yourname"},
 {key:"linkedin",label:"LinkedIn",placeholder:"https://www.linkedin.com/in/yourname"},
 {key:"pinterest",label:"Pinterest",placeholder:"https://www.pinterest.com/yourname"},
 {key:"website",label:"Website",placeholder:"https://your-portfolio.example"}
] as const;
export type CreatorSocialPlatform=(typeof CREATOR_SOCIAL_PLATFORMS)[number]["key"];
export type CreatorSocialLink={platform:CreatorSocialPlatform;url:string};
const keys=new Set<string>(CREATOR_SOCIAL_PLATFORMS.map(p=>p.key));
const hosts:Record<Exclude<CreatorSocialPlatform,"website">,readonly string[]>={
 instagram:["instagram.com","www.instagram.com"],
 tiktok:["tiktok.com","www.tiktok.com"],
 snapchat:["snapchat.com","www.snapchat.com"],
 youtube:["youtube.com","www.youtube.com","m.youtube.com","youtu.be"],
 x:["x.com","www.x.com","twitter.com","www.twitter.com"],
 facebook:["facebook.com","www.facebook.com","m.facebook.com","fb.com"],
 whatsapp:["wa.me","api.whatsapp.com"],
 telegram:["t.me","telegram.me"],
 threads:["threads.net","www.threads.net","threads.com","www.threads.com"],
 linkedin:["linkedin.com","www.linkedin.com"],
 pinterest:["pinterest.com","www.pinterest.com"]
};
function publicWebsite(hostname:string):boolean{
 const host=hostname.toLowerCase();
 if(!host.includes(".")||host.endsWith(".local")||host.endsWith(".internal")||host==="localhost"||host.endsWith(".localhost"))return false;
 if(host.includes("..")||host.startsWith(".")||host.endsWith("."))return false;
 if(/^(?:\d+\.){3}\d+$/.test(host)||host.includes(":"))return false;
 return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host);
}
export function normalizeCreatorSocialLink(platform:unknown,input:unknown):CreatorSocialLink|null{
 if(typeof platform!=="string"||!keys.has(platform)||typeof input!=="string")return null;
 const raw=input.trim();
 if(!raw||raw.length>512||/[\u0000-\u001f\u007f]/.test(raw))return null;
 let url:URL;
 try{url=new URL(raw);}catch{return null;}
 if(url.protocol!=="https:"||url.username||url.password||url.port||url.hash||!publicWebsite(url.hostname))return null;
 const key=platform as CreatorSocialPlatform;
 if(key!=="website"&&!hosts[key].includes(url.hostname.toLowerCase()))return null;
 const path=decodeURIComponentSafe(url.pathname);
 if(path===null)return null;
 if(key!=="website"){
  // Only personal pages, channel paths, public profiles or contact links.
  // Empty social-domain homepages and URLs with encoded separators are not accounts.
  if(path==="/"||path.includes("//")||/[%\\]/.test(path))return null;
  if(key==="whatsapp"){
   if(url.hostname==="wa.me"&&!/^\/[1-9][0-9]{6,14}\/?$/.test(path))return null;
   if(url.hostname==="api.whatsapp.com"&&!(path==="/send"&&/^\+?[0-9]{7,15}$/.test(url.searchParams.get("phone")??"")))return null;
  }else if(key==="youtube"){
   if(!/^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+|[^/]+)(?:\/)?$/.test(path)&&url.hostname!=="youtu.be")return null;
  }else if(key==="linkedin"&&!/^\/(?:in|company)\/[^/]+\/?$/.test(path))return null;
  else if(key==="snapchat"&&!/^\/add\/[^/]+\/?$/.test(path))return null;
  else if(key==="telegram"&&!/^\/[a-zA-Z0-9_]{4,40}\/?$/.test(path))return null;
  else if(key==="instagram"&&!/^\/[a-zA-Z0-9._]{1,30}\/?$/.test(path))return null;
  else if(key==="tiktok"&&!/^\/@[a-zA-Z0-9._]{2,30}\/?$/.test(path))return null;
  else if(key==="x"&&!/^\/[a-zA-Z0-9_]{1,15}\/?$/.test(path))return null;
  else if(key==="threads"&&!/^\/@[a-zA-Z0-9._]{1,30}\/?$/.test(path))return null;
  else if(key==="facebook"&&!/^\/[a-zA-Z0-9._-]{2,80}\/?$/.test(path))return null;
  else if(key==="pinterest"&&!/^\/[a-zA-Z0-9_]{3,60}\/?$/.test(path))return null;
 }
 // Preserve only WhatsApp phone parameters; strip tracking queries everywhere else.
 if(key!=="whatsapp")url.search="";
 else if(url.hostname==="api.whatsapp.com"){
  const phone=url.searchParams.get("phone")??"";
  url.search="";url.searchParams.set("phone",phone);
 }else url.search="";
 return {platform:key,url:url.toString()};
}
function decodeURIComponentSafe(value:string):string|null{
 try{return decodeURIComponent(value);}catch{return null;}
}
export function parseCreatorSocialLinks(input:unknown):CreatorSocialLink[]|null{
 if(!Array.isArray(input)||input.length>CREATOR_SOCIAL_PLATFORMS.length)return null;
 const seen=new Set<string>(),links:CreatorSocialLink[]=[];
 for(const item of input){
  if(!item||typeof item!=="object"||Array.isArray(item))return null;
  const {platform,url} = item as Record<string,unknown>;
  const parsed=normalizeCreatorSocialLink(platform,url);
  if(!parsed||seen.has(parsed.platform))return null;
  seen.add(parsed.platform);links.push(parsed);
 }
 return links;
}

import {emptyLandingSettings,validateLanding,type LandingSettings} from "./landing-fields";
export async function readLandingSettings():Promise<LandingSettings>{
 try{const [rows]=await database().execute<RowDataPacket[]>("SELECT payload FROM platform_landing_content WHERE id=1 AND status='published' LIMIT 1");const raw=rows[0]?.payload;const parsed=typeof raw==="string"?JSON.parse(raw):raw;return validateLanding(parsed)?parsed:emptyLandingSettings();}catch{return emptyLandingSettings();}
}

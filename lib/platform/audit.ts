import { database } from "@/lib/db/mysql";
export async function platformAudit(actorUserId:string,action:string,targetType?:string,targetId?:string,metadata?:Record<string,unknown>){
 await database().execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id,metadata_json) VALUES (?,?,?,?,?)",[actorUserId,action,targetType??null,targetId??null,metadata?JSON.stringify(metadata):null]);
}

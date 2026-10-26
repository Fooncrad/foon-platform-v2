const terminalStatuses=new Set(["completed","cancelled","no_show"]);
const knownStatuses=new Set(["pending","confirmed","seated",...terminalStatuses]);

export function reservationTransitionAllowed(previous:string|null,next:string){
 if(!knownStatuses.has(next))return false;
 if(previous===null)return !terminalStatuses.has(next);
 if(!knownStatuses.has(previous))return false;
 if(next==="no_show")return previous==="confirmed";
 if(previous==="no_show")return false;
 if(terminalStatuses.has(previous??""))return next===previous;
 return true;
}

export function reservationNoShowDue(scheduledAt:unknown,durationMinutes:unknown,now=Date.now()){
 const start=typeof scheduledAt==="string"?Date.parse(scheduledAt):NaN;
 const grace=durationMinutes==null||durationMinutes===""?30:Number(durationMinutes);
 return Number.isFinite(start)&&Number.isInteger(grace)&&grace>=0&&grace<=1440&&Number.isFinite(now)&&now>=start+grace*60000;
}

const terminalStatuses=new Set(["completed","cancelled","no_show"]);

export function reservationTransitionAllowed(previous:string|null,next:string){
 if(next==="no_show")return previous==="confirmed";
 if(previous==="no_show")return false;
 if(terminalStatuses.has(previous??""))return next===previous;
 return true;
}

export function reservationNoShowDue(scheduledAt:unknown,durationMinutes:unknown,now=Date.now()){
 const start=typeof scheduledAt==="string"?Date.parse(scheduledAt):NaN;
 const duration=durationMinutes==null||durationMinutes===""?90:Number(durationMinutes);
 return Number.isFinite(start)&&Number.isInteger(duration)&&duration>=30&&duration<=240&&Number.isFinite(now)&&now>=start+duration*60000;
}
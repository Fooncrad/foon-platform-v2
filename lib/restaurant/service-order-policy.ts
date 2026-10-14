const transitions:Readonly<Record<string,readonly string[]>>={
 new:["new","scheduled","in_progress","cancelled"],
 scheduled:["scheduled","in_progress","cancelled"],
 in_progress:["in_progress","completed","cancelled"],
 completed:["completed"],
 cancelled:["cancelled"],
};

export function serviceOrderTransitionAllowed(previous:string|null,next:string){
 // Creation must not bypass the normal execution lifecycle.
 if(previous===null)return next==="new"||next==="scheduled";
 return Object.hasOwn(transitions,previous)&&transitions[previous].includes(next);
}

export function serviceOrderArchiveAllowed(status:string){
 // Once execution is scheduled or started, preserve the record and cancel it instead.
 return status==="new";
}

export type AssignedTableState={id:string;name:string;status:string};
export type ServiceSnapshot={tables:AssignedTableState[];calls:{id:string}[]};
export type ServiceAlert={id:string;kind:"table"|"call";name:string;status:string};
export function assignedServiceAlerts(previous:ServiceSnapshot|null,next:ServiceSnapshot):ServiceAlert[]{
 if(!previous)return [];
 const tables=new Map(previous.tables.map(t=>[t.id,t.status]));
 const calls=new Set(previous.calls.map(c=>c.id));
 return [...next.tables.filter(t=>tables.has(t.id)&&tables.get(t.id)!==t.status).map(t=>({id:t.id,kind:"table" as const,name:t.name,status:t.status})),...next.calls.filter(c=>!calls.has(c.id)).map(c=>({id:c.id,kind:"call" as const,name:"",status:"pending"}))];
}

export type FloorTable={id:string;number:string;seats:number;x:number;y:number;zone:string};
export type FloorPlan={width:number;height:number;tables:FloorTable[]};
export const defaultFloorPlan:FloorPlan={width:24,height:18,tables:[]};
export function validFloorPlan(x:unknown):x is FloorPlan{
 if(!x||typeof x!=="object")return false;const p=x as Record<string,unknown>;
 if(typeof p.width!=="number"||!Number.isFinite(p.width)||p.width<2||p.width>200||typeof p.height!=="number"||!Number.isFinite(p.height)||p.height<2||p.height>200||!Array.isArray(p.tables)||p.tables.length>500)return false;
 const width=p.width,height=p.height;
 const ids=new Set<string>(),names=new Set<string>();
 return p.tables.every((raw:unknown)=>{if(!raw||typeof raw!=="object")return false;const t=raw as Record<string,unknown>;
 if(typeof t.id!=="string"||!/^[a-z0-9-]{1,60}$/i.test(t.id)||ids.has(t.id)||typeof t.number!=="string"||!t.number.trim()||t.number.length>20||names.has(t.number.trim())||typeof t.zone!=="string"||!t.zone.trim()||t.zone.length>60||!Number.isInteger(t.seats)||Number(t.seats)<1||Number(t.seats)>30||typeof t.x!=="number"||!Number.isFinite(t.x)||typeof t.y!=="number"||!Number.isFinite(t.y)||t.x<0||t.y<0||t.x>=width||t.y>=height)return false;ids.add(t.id);names.add(t.number.trim());return true});
}

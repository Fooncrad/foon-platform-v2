export type FloorTable={id:string;number:string;seats:number;x:number;y:number;zone:string};
export type FloorPlan={width:number;height:number;tables:FloorTable[]};
export const defaultFloorPlan:FloorPlan={width:24,height:18,tables:[]};
export function nextFloorTableNumber(tables:readonly FloorTable[]):string{
 // Treat numeric labels such as 01 and 1 as the same occupied table number.
 // Non-numeric labels remain valid but do not reserve an auto-generated integer.
 const used=new Set(tables.map(table=>table.number.trim()).filter(number=>/^\d+$/.test(number)).map(number=>number.replace(/^0+(?=\d)/,"")));
 let candidate=1;
 while(used.has(String(candidate)))candidate++;
 return String(candidate);
}

// Place new tables into separate grid cells instead of stacking them at the same coordinates.
export function nextFloorTablePosition(plan:FloorPlan):{x:number;y:number}{
 const cols=Math.max(1,Math.floor(plan.width/2.5));
 const rows=Math.max(1,Math.floor(plan.height/2.5));
 const occupied=new Set(plan.tables.map(t=>Math.floor(t.x/2.5)+":"+Math.floor(t.y/2.5)));
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
  if(!occupied.has(col+":"+row))return {x:Math.min(plan.width-0.5,col*2.5+1.25),y:Math.min(plan.height-0.5,row*2.5+1.25)};
 }
 // A packed grid can still contain available space; offset additional tables deterministically.
 const n=plan.tables.length;
 return {x:Math.min(plan.width-0.1,0.5+(n%cols)*(plan.width/cols)),y:Math.min(plan.height-0.1,0.5+(Math.floor(n/cols)%rows)*(plan.height/rows))};
}
export function validFloorPlan(x:unknown):x is FloorPlan{
 if(!x||typeof x!=="object")return false;const p=x as Record<string,unknown>;
 if(typeof p.width!=="number"||!Number.isFinite(p.width)||p.width<2||p.width>200||typeof p.height!=="number"||!Number.isFinite(p.height)||p.height<2||p.height>200||!Array.isArray(p.tables)||p.tables.length>500)return false;
 const width=p.width,height=p.height;
 const ids=new Set<string>(),names=new Set<string>();
 return p.tables.every((raw:unknown)=>{if(!raw||typeof raw!=="object")return false;const t=raw as Record<string,unknown>;
 if(typeof t.id!=="string"||!/^[a-z0-9-]{1,60}$/i.test(t.id)||ids.has(t.id)||typeof t.number!=="string"||!t.number.trim()||t.number.length>20||names.has(t.number.trim())||typeof t.zone!=="string"||!t.zone.trim()||t.zone.length>60||!Number.isInteger(t.seats)||Number(t.seats)<1||Number(t.seats)>30||typeof t.x!=="number"||!Number.isFinite(t.x)||typeof t.y!=="number"||!Number.isFinite(t.y)||t.x<0||t.y<0||t.x>=width||t.y>=height)return false;ids.add(t.id);names.add(t.number.trim());return true});
}

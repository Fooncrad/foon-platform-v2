/** Coordinates are approximate; never infer a street-level position from a city label. */
export function distanceKm(a,b){
 if(!validLocation(a)||!validLocation(b))return null;
 const rad=Math.PI/180,dy=(b.latitude-a.latitude)*rad,dx=(b.longitude-a.longitude)*rad;
 const q=Math.sin(dy/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dx/2)**2;
 return 6371.0088*2*Math.atan2(Math.sqrt(Math.min(1,q)),Math.sqrt(Math.max(0,1-q)));
}
export function validLocation(value){
 return !!value&&typeof value.latitude==="number"&&Number.isFinite(value.latitude)&&value.latitude>=-90&&value.latitude<=90
 &&typeof value.longitude==="number"&&Number.isFinite(value.longitude)&&value.longitude>=-180&&value.longitude<=180;
}
export function nearestDeliveryBranch(branches,customer,eligibleIds){
 const available=branches.filter(b=>eligibleIds.includes(b.id));
 if(!available.length)return null;
 if(!validLocation(customer))return {branch:available[0],distanceKm:null,approximate:true};
 const scored=available.map(b=>({branch:b,distanceKm:distanceKm(customer,b)})).filter(x=>x.distanceKm!==null);
 if(!scored.length)return {branch:available[0],distanceKm:null,approximate:true};
 scored.sort((a,b)=>a.distanceKm-b.distanceKm||a.branch.id.localeCompare(b.branch.id));
 return {...scored[0],approximate:false};
}

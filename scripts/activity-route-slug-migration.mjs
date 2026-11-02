/** Stop a rollout if a legacy public store occupies a reserved activity URL. */
export async function assertAvailableActivityRouteSlugs(db){
 const [conflicts]=await db.execute(
  "SELECT t.id,t.slug FROM tenants t INNER JOIN activity_route_slugs a ON a.route_slug=t.slug ORDER BY t.slug LIMIT 20"
 );
 if(!Array.isArray(conflicts))throw new Error("ACTIVITY_ROUTE_CONFLICT_CHECK_INVALID");
 if(conflicts.length){
  const slugs=conflicts.map(row=>String(row.slug)).join(",");
  throw new Error("ACTIVITY_ROUTE_SLUG_CONFLICT:"+slugs);
 }
 return true;
}

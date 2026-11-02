import type {PoolConnection,RowDataPacket} from "mysql2/promise";

const assetPrefix="/api/restaurant/assets/";
const uuid=/^[a-f0-9-]{36}$/i;

// Imports stage image assets before row-level duplicate checks. Remove staged assets
// that ended up unused (for example when a duplicate category/item/variant is skipped)
// so repeated idempotent-looking imports cannot consume tenant media quota forever.
export async function cleanupUnusedImportAssets(db:PoolConnection,tenant:string,urls:Map<string,string>):Promise<number>{
 let removed=0;
 for(const url of new Set(urls.values())){
  if(typeof url!=="string"||!url.startsWith(assetPrefix))continue;
  const id=url.slice(assetPrefix.length);
  if(!uuid.test(id))continue;
  const [rows]=await db.execute<RowDataPacket[]>(`SELECT
   (SELECT COUNT(*) FROM restaurant_resources WHERE tenant_id=? AND archived=FALSE AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.imageUrl'))=?) +
   (SELECT COUNT(*) FROM restaurant_menu_items WHERE tenant_id=? AND image_url=?) +
   (SELECT COUNT(*) FROM restaurant_menu_item_images WHERE tenant_id=? AND image_url=?) +
   (SELECT COUNT(*) FROM catalog_categories WHERE tenant_id=? AND image_url=?) +
   (SELECT COUNT(*) FROM catalog_images WHERE tenant_id=? AND image_url=?) +
   (SELECT COUNT(*) FROM catalog_option_values WHERE tenant_id=? AND image_url=?) +
   (SELECT COUNT(*) FROM catalog_variant_images WHERE tenant_id=? AND image_url=?) AS reference_count`,
   [tenant,url,tenant,url,tenant,url,tenant,url,tenant,url,tenant,url,tenant,url]);
  if(Number(rows[0]?.reference_count??0)!==0)continue;
  await db.execute("DELETE FROM restaurant_assets WHERE tenant_id=? AND id=?",[tenant,id]);
  removed++;
 }
 return removed;
}

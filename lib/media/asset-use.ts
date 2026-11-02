import type {PoolConnection,RowDataPacket} from 'mysql2/promise';
export async function assetInUse(db:PoolConnection,tenant:string,id:string){
 const url='/api/restaurant/assets/'+id;
 const checks=[['catalog_categories','image_url'],['catalog_images','image_url'],['catalog_variant_images','image_url'],['catalog_option_values','image_url'],['restaurant_menu_items','image_url'],['restaurant_menu_item_images','image_url']];
 for(const [table,column] of checks){const [rows]=await db.execute<RowDataPacket[]>('SELECT id FROM '+table+' WHERE tenant_id=? AND '+column+'=? LIMIT 1',[tenant,url]);if(rows.length)return true;}
 const [resources]=await db.execute<RowDataPacket[]>('SELECT id FROM restaurant_resources WHERE tenant_id=? AND archived=FALSE AND CAST(data AS CHAR) LIKE ? LIMIT 1',[tenant,'%'+url+'%']);return resources.length>0;
}

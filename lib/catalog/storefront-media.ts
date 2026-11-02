// Shape public image galleries once per catalog page, not once per product.
// Product and variant IDs here must originate from the tenant-filtered SQL.
export type GalleryProduct={id:string;image_url?:string|null};
export type GalleryImage={product_id:string;image_url:string};
export type GalleryVariantImage={product_id:string;variant_id:string;sku?:string|null;image_url:string};
export type GalleryVariant={id:string;sku:string|null;images:string[]};
export type GalleryResult={images:string[];variants:GalleryVariant[]};
export function buildStorefrontGalleries(
 products:GalleryProduct[],photos:GalleryImage[],variantPhotos:GalleryVariantImage[]
):Record<string,GalleryResult>{
 const result:Record<string,GalleryResult>=Object.create(null);
 for(const product of products)result[product.id]={images:[],variants:[]};
 for(const photo of photos){
  const target=result[photo.product_id];
  if(target&&typeof photo.image_url==="string"&&photo.image_url.trim()&&target.images.length<4)target.images.push(photo.image_url);
 }
 for(const product of products){
  const target=result[product.id];
  if(target&&!target.images.length&&product.image_url)target.images.push(product.image_url);
 }
 const mapped=new Map<string,Map<string,GalleryVariant>>();
 for(const photo of variantPhotos){
  const target=result[photo.product_id];
  if(!target||!photo.variant_id||!photo.image_url?.trim())continue;
  let perProduct=mapped.get(photo.product_id);
  if(!perProduct){perProduct=new Map();mapped.set(photo.product_id,perProduct);}
  let variant=perProduct.get(photo.variant_id);
  if(!variant){
   if(perProduct.size>=4)continue;
   variant={id:photo.variant_id,sku:photo.sku||null,images:[]};
   perProduct.set(photo.variant_id,variant);
   target.variants.push(variant);
  }
  if(variant.images.length<4)variant.images.push(photo.image_url);
 }
 return result;
}

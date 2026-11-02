/** Public creator image responses may only use raster MIME types.
 * Avoid falsely labelling legacy PNG/WebP media as JPEG or serving active SVG.
 */
export type CreatorImageMime="image/jpeg"|"image/png"|"image/webp";
export function publicCreatorImageMime(value:unknown):CreatorImageMime|null{
 return value==="image/jpeg"||value==="image/png"||value==="image/webp"?value:null;
}

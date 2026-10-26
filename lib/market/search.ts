import {registrationActivities} from "../tenant/registration-activities.ts";
import {supportedCountries} from "../tenant/country-catalog.ts";

export const MARKET_PAGE_SIZE=24;
export type MarketFilters={country:string;activity:string;kind:""|"store"|"restaurant";q:string;page:number};
export function parseMarketFilters(input:{country?:unknown;activity?:unknown;kind?:unknown;q?:unknown;page?:unknown}):MarketFilters{
 const validCountries=new Set<string>(supportedCountries.map(c=>c.code));
 const country=typeof input.country==="string"?input.country.toUpperCase():"";
 const activity=typeof input.activity==="string"?input.activity:"";
 const kind=input.kind==="store"||input.kind==="restaurant"?input.kind:"";
 const q=typeof input.q==="string"?input.q.trim().slice(0,80):"";
 const n=typeof input.page==="string"&&/^[0-9]{1,5}$/.test(input.page)?Number(input.page):1;
 return {country:validCountries.has(country)?country:"",activity:registrationActivities.some(a=>a.id===activity)?activity:"",kind,q,page:Math.max(1,Math.min(n,10000))};
}
export function escapeMarketLike(q:string){return q.replace(/[!%_]/g,char=>"!"+char);}
export function buildMarketWhere(filters:MarketFilters){
 const clauses=["bp.country_code=?","t.status='active'","t.market_enabled=TRUE","(t.market_visible_from IS NULL OR t.market_visible_from<=UTC_TIMESTAMP())","(t.market_visible_until IS NULL OR t.market_visible_until>UTC_TIMESTAMP())"];
 const args:string[]=[filters.country];
 if(filters.kind){clauses.push("t.kind=?");args.push(filters.kind);}
 if(filters.activity){clauses.push("bp.activity_code=?");args.push(filters.activity);}
 if(filters.q){const search="%"+escapeMarketLike(filters.q)+"%";clauses.push("(t.name LIKE ? ESCAPE '!' OR t.slug LIKE ? ESCAPE '!' OR EXISTS (SELECT 1 FROM catalog_products cp WHERE cp.tenant_id=t.id AND cp.enabled=TRUE AND (cp.name_ar LIKE ? ESCAPE '!' OR cp.name_en LIKE ? ESCAPE '!' OR cp.name_fr LIKE ? ESCAPE '!')))");args.push(search,search,search,search,search);}
 return {where:clauses.join(" AND "),args};
}
export function marketListingOrderSql(){
 return "t.market_sort_order ASC,bp.activity_code ASC,t.name ASC,t.id ASC";
}
export function marketPageCount(total:number):number{
 return Math.max(1,Math.ceil(Math.max(0,total)/MARKET_PAGE_SIZE));
}
export function marketPageUrl(filters:MarketFilters,page:number){
 const query=new URLSearchParams();
 if(filters.country)query.set("country",filters.country);
 if(filters.q)query.set("q",filters.q);
 if(filters.kind)query.set("kind",filters.kind);
 if(filters.activity)query.set("activity",filters.activity);
 if(page>1)query.set("page",String(page));
 return "/market"+(query.size?"?"+query:"");
}

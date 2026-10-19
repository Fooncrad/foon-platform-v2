import test from "node:test";
import assert from "node:assert/strict";
import {supportedCountries,currencyForCountry} from "../lib/tenant/country-catalog.ts";
import {registrationActivities} from "../lib/tenant/registration-activities.ts";
import {MARKET_PAGE_SIZE,buildMarketWhere,escapeMarketLike,marketListingOrderSql,marketPageCount,marketPageUrl,parseMarketFilters} from "../lib/market/search.ts";

const africanCodes="DZ AO BJ BW BF BI CV CM CF TD KM CD CG CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW".split(" ");

test("the country catalog includes all 54 UN African countries without duplicate ISO codes",()=>{
 const codes=new Set(supportedCountries.map(c=>c.code));
 assert.equal(africanCodes.length,54);
 assert.equal(new Set(africanCodes).size,54);
 assert.equal(supportedCountries.length,codes.size,"country codes cannot be repeated");
 for(const code of africanCodes)assert.ok(codes.has(code),"missing "+code);
});

test("Mali, Burkina Faso and Niger all use the correct CFA franc and trilingual labels",()=>{
 for(const [code,ar] of [["ML","مالي"],["BF","بوركينا فاسو"],["NE","النيجر"]]){
  const country=supportedCountries.find(c=>c.code===code);
  assert.equal(country?.ar,ar);assert.ok(country.en);assert.ok(country.fr);
  assert.equal(currencyForCountry(code),"XOF");
 }
 assert.equal(currencyForCountry("ZW"),"ZWG","Zimbabwe Gold has ISO 4217 code ZWG");
});

test("every country has a three-letter currency and three nonempty display names",()=>{
 for(const c of supportedCountries){
  assert.match(c.code,/^[A-Z]{2}$/);assert.match(c.currency,/^[A-Z]{3}$/);
  for(const lang of ["ar","en","fr"])assert.ok(c[lang]?.trim(),c.code+":"+lang);
  assert.equal(currencyForCountry(c.code),c.currency);
 }
});

test("market filters reject unknown countries and unregistered activities",()=>{
 assert.equal(parseMarketFilters({country:"ML",activity:"automotive",kind:"store",page:"3"}).country,"ML");
 assert.equal(parseMarketFilters({country:"bf",activity:"carwash",kind:"restaurant"}).country,"BF");
 assert.equal(parseMarketFilters({country:"XX",activity:"not-real",page:"foo"}).country,"");
 assert.equal(parseMarketFilters({country:"NE",activity:"not-real",page:"foo"}).activity,"");
 assert.equal(parseMarketFilters({page:"-2"}).page,1);
 assert.equal(parseMarketFilters({page:"99999"}).page,10000);
 assert.equal(registrationActivities.length,15);
 for(const a of registrationActivities)assert.equal(parseMarketFilters({activity:a.id}).activity,a.id);
});

test("market queries isolate countries, permit activity+kind, and treat search text literally",()=>{
 const filters=parseMarketFilters({country:"ML",activity:"automotive",kind:"store",q:"100%_! Café",page:"2"});
 const result=buildMarketWhere(filters);
 assert.match(result.where,/bp.country_code=\?/);
 assert.match(result.where,/bp.activity_code=\?/);
 assert.match(result.where,/t.status='active'/);
 assert.match(result.where,/t.market_enabled=TRUE/);
 assert.match(result.where,/market_visible_from IS NULL/);
 assert.match(result.where,/market_visible_until IS NULL/);
 assert.equal(marketListingOrderSql(),"t.market_sort_order ASC,bp.activity_code ASC,t.name ASC,t.id ASC");
 assert.deepEqual(result.args,["ML","store","automotive","%100!%!_!! Café%","%100!%!_!! Café%"]);
 assert.equal(escapeMarketLike("a%b_c!"),"a!%b!_c!!");
});

test("market pagination keeps filters, preserves an empty first-page query and clamps page size",()=>{
 assert.equal(MARKET_PAGE_SIZE,24);
 assert.equal(marketPageCount(0),1);
 assert.equal(marketPageCount(25),2);
 assert.equal(marketPageCount(240),10);
 const filters=parseMarketFilters({country:"NE",activity:"salon",kind:"store",q:"A&B"});
 const url=marketPageUrl(filters,2);
 assert.match(url,/page=2/);
 assert.match(url,/country=NE/);
 assert.match(url,/activity=salon/);
 assert.match(url,/q=A%26B/);
 assert.equal(marketPageUrl(parseMarketFilters({}),1),"/market");
});

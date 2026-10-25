import test from "node:test";
import assert from "node:assert/strict";
import {parseMarketFilters,buildMarketWhere,escapeMarketLike} from "../lib/market/search.ts";
test("market product search stays inside the selected country and published merchant visibility",()=>{
 const filters=parseMarketFilters({country:"SA",q:"قهوة",kind:"store"});
 const {where,args}=buildMarketWhere(filters);
 assert.match(where,/bp\.country_code=\?/);
 assert.match(where,/t\.market_enabled=TRUE/);
 assert.match(where,/t\.status='active'/);
 assert.match(where,/cp\.tenant_id=t\.id/);
 assert.match(where,/cp\.enabled=TRUE/);
 assert.match(where,/cp\.name_ar LIKE/);
 assert.match(where,/cp\.name_en LIKE/);
 assert.match(where,/cp\.name_fr LIKE/);
 assert.equal(args[0],"SA");
 assert.equal(args[1],"store");
 assert.deepEqual(args.slice(2),Array(5).fill("%قهوة%"));
});
test("SQL wildcards from market input are escaped and invalid country rejected",()=>{
 const filters=parseMarketFilters({country:"INVALID",q:"%_!"});
 assert.equal(filters.country,"");
 assert.equal(escapeMarketLike(filters.q),"!%!_!!");
 const {where,args}=buildMarketWhere(filters);
 assert.equal(args.length,6);
 assert.match(where,/ESCAPE '!'/);
});

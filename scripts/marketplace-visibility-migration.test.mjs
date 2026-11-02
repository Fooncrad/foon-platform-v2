import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureMarketplaceVisibility} from './marketplace-visibility-migration.mjs';

test('marketplace migration adds all columns on MySQL and MariaDB without dialect extensions',async()=>{
 const statements=[];
 const connection={execute:async()=>[[],[]],query:async(sql)=>statements.push(sql)};
 await ensureMarketplaceVisibility(connection);
 assert.deepEqual(statements,["ALTER TABLE tenants ADD COLUMN market_enabled BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN market_visible_from DATETIME NULL, ADD COLUMN market_visible_until DATETIME NULL, ADD COLUMN market_sort_order INT NOT NULL DEFAULT 0"]);
});

test('marketplace migration resumes safely after a partial DDL run',async()=>{
 const statements=[];
 const connection={execute:async()=>[[{COLUMN_NAME:'market_enabled'},{COLUMN_NAME:'market_visible_from'}],[]],query:async(sql)=>statements.push(sql)};
 await ensureMarketplaceVisibility(connection);
 assert.deepEqual(statements,["ALTER TABLE tenants ADD COLUMN market_visible_until DATETIME NULL, ADD COLUMN market_sort_order INT NOT NULL DEFAULT 0"]);
});

test('marketplace migration leaves a complete schema untouched',async()=>{
 const statements=[];
 const connection={execute:async()=>[[{COLUMN_NAME:'market_enabled'},{COLUMN_NAME:'market_visible_from'},{COLUMN_NAME:'market_visible_until'},{COLUMN_NAME:'market_sort_order'}],[]],query:async(sql)=>statements.push(sql)};
 await ensureMarketplaceVisibility(connection);
 assert.deepEqual(statements,[]);
});

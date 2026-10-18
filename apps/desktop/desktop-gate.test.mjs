import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDesktopEnvironment, validateOperatorFile, isLocalWindowsDataPath} from './desktop-gate.mjs';
const good = {
  FOON_LAN_TOKEN:'a'.repeat(96), FOON_EDGE_ACK_SECRET:'b'.repeat(96),
  FOON_EDGE_USERS_FILE:'C:\\Users\\Operator\\AppData\\Local\\FOON\\operators.json',
  FOON_LAN_DB:'C:\\Users\\Operator\\AppData\\Local\\FOON\\orders.sqlite',
  FOON_EDGE_CATALOG_CACHE:'C:\\Users\\Operator\\AppData\\Local\\FOON\\catalog.json',
  FOON_EDGE_CLOUD_SYNC_URL:'https://nfoodz.com/api/edge/sync',
  FOON_LAN_HOST:'127.0.0.1', FOON_LAN_PORT:'8787', FOON_EDGE_CONSOLE_PORT:'8788'
};
const runtime={platform:'win32',node:'24.6.0'};
const user={username:'cashier', passwordHash:'scrypt:'+'a'.repeat(32)+':'+'b'.repeat(128),role:'cashier',deviceId:'11111111-1111-4111-8111-111111111111',tenantId:'22222222-2222-4222-8222-222222222222',branchId:'33333333-3333-4333-8333-333333333333',cloudToken:'c'.repeat(96),signingSecret:'d'.repeat(96)};
test('accepts correct Windows Node24 private configuration',()=>assert.deepEqual(validateDesktopEnvironment(good,runtime),{ok:true,errors:[]}));
test('rejects non Windows and incompatible Node',()=>{const v=validateDesktopEnvironment(good,{platform:'linux',node:'22.0.0'});assert.deepEqual(v.errors,['WINDOWS_REQUIRED','NODE_24_REQUIRED']);});
test('rejects wildcard service, duplicate port and TLS bypass',()=>{const v=validateDesktopEnvironment({...good,FOON_LAN_HOST:'0.0.0.0',FOON_LAN_PORT:'8788',NODE_TLS_REJECT_UNAUTHORIZED:'0'},runtime);assert(v.errors.includes('GATEWAY_LOOPBACK_REQUIRED'));assert(v.errors.includes('INVALID_LOCAL_PORTS'));assert(v.errors.includes('TLS_BYPASS_FORBIDDEN'));});
test('rejects insecure cloud scheme, injected credentials, public-IP endpoints',()=>{for(const u of ['http://nfoodz.com/api/edge/sync','https://user:pass@nfoodz.com/api/edge/sync','https://127.0.0.1/api/edge/sync','https://nfoodz.com/api/edge/sync?secret=bad'])assert.equal(validateDesktopEnvironment({...good,FOON_EDGE_CLOUD_SYNC_URL:u},runtime).ok,false,u);});
test('rejects UNC/network device paths and relative files',()=>{for(const p of ['data\\orders.sqlite','\\\\server\\share\\orders.sqlite','C:\\folder\\..\\orders.sqlite'])assert.equal(isLocalWindowsDataPath(p),false,p)});
test('blocks LAN console without pinned TLS files',()=>{const v=validateDesktopEnvironment({...good,FOON_EDGE_CONSOLE_HOST:'192.168.1.10',FOON_EDGE_CONSOLE_ORIGIN:'http://192.168.1.10:8788'},runtime);assert(v.errors.includes('CONSOLE_TLS_REQUIRED_FOR_LAN'));assert(v.errors.includes('INVALID_CONSOLE_ORIGIN'));});
test('accepts TLS-protected private LAN console',()=>{const v=validateDesktopEnvironment({...good,FOON_EDGE_CONSOLE_HOST:'192.168.1.10',FOON_EDGE_CONSOLE_ORIGIN:'https://192.168.1.10:8788',FOON_EDGE_CONSOLE_CERT_FILE:'C:\\Users\\Operator\\AppData\\Local\\FOON\\cert.pem',FOON_EDGE_CONSOLE_KEY_FILE:'C:\\Users\\Operator\\AppData\\Local\\FOON\\key.pem'},runtime);assert.equal(v.ok,true,JSON.stringify(v.errors));});
test('requires all provisioning secrets, returning codes rather than values',()=>{const v=validateDesktopEnvironment({...good,FOON_LAN_TOKEN:'secret'},runtime);assert(v.errors.includes('FOON_LAN_TOKEN_MISSING'));assert(!JSON.stringify(v).includes('secret'));});
test('validates scoped station operator',()=>assert.deepEqual(validateOperatorFile([user]),{ok:true,errors:[]}));
test('prevents duplicate devices and multiple tenants on a station',()=>{const a={...user,username:'manager'};assert(validateOperatorFile([user,a]).errors.includes('INVALID_EDGE_OPERATOR'));const b={...a,deviceId:'44444444-4444-4444-8444-444444444444',tenantId:'55555555-5555-4555-8555-555555555555'};assert(validateOperatorFile([user,b]).errors.includes('CROSS_TENANT_OR_BRANCH_OPERATORS'));});
test('rejects plaintext operator passwords',()=>assert(validateOperatorFile([{...user,passwordHash:'password123'}]).errors.includes('INVALID_EDGE_OPERATOR')));

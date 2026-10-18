/** Read-only inspection: no gateway launch, no writes, no credential disclosure. */
import {readFile} from 'node:fs/promises';
import {validateDesktopEnvironment, validateOperatorFile} from './desktop-gate.mjs';

const config=validateDesktopEnvironment(process.env);
let operatorStatus={ok:false,errors:['EDGE_USERS_NOT_READ']};
if(config.ok){
  try {operatorStatus=validateOperatorFile(JSON.parse(await readFile(process.env.FOON_EDGE_USERS_FILE,'utf8')))}
  catch {operatorStatus={ok:false,errors:['EDGE_USERS_FILE_UNREADABLE']}}
}
const errors=[...config.errors,...operatorStatus.errors.filter(code=>code!=='EDGE_USERS_NOT_READ')];
if(config.ok&&operatorStatus.ok){console.log(JSON.stringify({ok:true,code:'DESKTOP_PREFLIGHT_OK'}));}
else{console.error(JSON.stringify({ok:false,errors}));process.exitCode=1;}

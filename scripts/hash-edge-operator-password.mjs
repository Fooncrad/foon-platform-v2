// Pipe a private password into stdin on the trusted local host. Never pass it as an argument.
import {hashOperatorPassword} from "./foon-edge-console-server.mjs";
let password="";for await(const chunk of process.stdin){password+=chunk;if(password.length>132)throw Error("INVALID_OPERATOR_PASSWORD");}
process.stdout.write(await hashOperatorPassword(password.replace(/\r?\n$/,""))+"\n");

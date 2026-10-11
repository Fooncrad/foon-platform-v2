import {randomBytes} from "node:crypto";

const names=["FOON_LAN_TOKEN","FOON_EDGE_ACK_SECRET"];
for(const name of names){
 process.stdout.write(name+"="+randomBytes(48).toString("hex")+"\n");
}
process.stderr.write("Store these values only in the local edge server environment. Never commit them or expose them to browsers.\n");

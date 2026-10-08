import {createMailProvider} from "./mail-provider.mjs";
const provider=await createMailProvider();
try{await provider.verify();console.log("SMTP_CONNECTION_VERIFIED");}
catch(error){console.error(error.code||"SMTP_CONNECTION_FAILED");process.exitCode=1;}
finally{provider.close();}

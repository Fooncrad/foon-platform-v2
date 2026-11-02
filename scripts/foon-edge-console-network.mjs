import {isIP} from "node:net";

export function consoleNetwork({host="127.0.0.1",port,origin,certFile,keyFile}){
 const loopback=host==="127.0.0.1"||host==="::1";
 const octets=host.split(".").map(Number);
 const privateV4=isIP(host)===4&&(octets[0]===10||octets[0]===192&&octets[1]===168||octets[0]===172&&octets[1]>=16&&octets[1]<=31);
 if(!loopback&&!privateV4)throw Error("INVALID_CONSOLE_BIND_ADDRESS");
 if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error("INVALID_LOCAL_PORTS");
 if(Boolean(certFile)!==Boolean(keyFile))throw Error("CONSOLE_TLS_FILES_REQUIRED");
 const tls=Boolean(certFile&&keyFile),url=new URL(origin);
 if(url.username||url.password||url.search||url.hash||url.pathname!=="/"||!["http:","https:"].includes(url.protocol))throw Error("INVALID_CONSOLE_ORIGIN");
 if(!loopback&&!tls)throw Error("CONSOLE_TLS_REQUIRED_FOR_LAN");
 if(tls){
  if(url.protocol!=="https:")throw Error("CONSOLE_TLS_ORIGIN_REQUIRED");
  const expectedHost=host==="::1"?"[::1]":host;
  if(url.hostname!==expectedHost&&!(loopback&&url.hostname==="localhost"))throw Error("CONSOLE_TLS_HOST_MISMATCH");
  if(Number(url.port||443)!==port)throw Error("CONSOLE_TLS_PORT_MISMATCH");
 }
 return {host,port,tls};
}

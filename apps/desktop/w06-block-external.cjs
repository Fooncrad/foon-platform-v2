// Test fixture only: veto outbound TCP connects from the child Node SQLite gateway.
// Never included in the released W06 runtime bundle.
'use strict';
const net=require('node:net');
const {writeFileSync}=require('node:fs');
const orig=net.Socket.prototype.connect;
const loopback=new Set(['localhost','127.0.0.1','::1','::ffff:127.0.0.1']);
net.Socket.prototype.connect=function(...args){
  let host;
  if(typeof args[0]==='object'&&args[0]!==null) {
    host=args[0].host??args[0].hostname??'localhost';
    if(args[0].path!==undefined)host='__PIPE__';
  }else if(typeof args[0]==='number'){
    host=typeof args[1]==='string'?args[1]:'localhost';
  }else{host='__UNKNOWN__';}
  if(!loopback.has(host)){
    if(process.env.FOON_W06_EXTERNAL_ATTEMPT_MARKER){
      writeFileSync(process.env.FOON_W06_EXTERNAL_ATTEMPT_MARKER,String(host));
    }
    throw Error('W06_EXTERNAL_NETWORK_DISABLED');
  }
  return orig.apply(this,args);
};

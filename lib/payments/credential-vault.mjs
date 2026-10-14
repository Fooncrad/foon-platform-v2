import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

function keyFromEnvironment(value=process.env.FOON_PAYMENT_VAULT_KEY){
 if(typeof value!=='string'||!/^([A-Za-z0-9+/]{43}=)$/.test(value))throw new Error('PAYMENT_VAULT_NOT_CONFIGURED');
 const key=Buffer.from(value,'base64');
 if(key.length!==32||key.toString('base64')!==value)throw new Error('PAYMENT_VAULT_NOT_CONFIGURED');
 return key;
}
export function paymentVaultReady(){try{keyFromEnvironment();return true;}catch{return false;}}
function contextBytes(context){
 const {tenantId,scope,provider,mode}=context;
 if(!tenantId||!scope||!provider||!['test','live'].includes(mode))throw new Error('INVALID_VAULT_CONTEXT');
 return Buffer.from(JSON.stringify(['foon-payment-v1',tenantId,scope,provider,mode]));
}
export function encryptPaymentCredentials(credentials,context,keyValue){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyFromEnvironment(keyValue),iv);
 cipher.setAAD(contextBytes(context));
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(credentials),'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64'),cipher.getAuthTag().toString('base64'),ciphertext.toString('base64')].join('.');
}
export function decryptPaymentCredentials(envelope,context,keyValue){
 const parts=String(envelope).split('.');
 if(parts.length!==4||parts[0]!=='v1')throw new Error('INVALID_VAULT_ENVELOPE');
 const iv=Buffer.from(parts[1],'base64'),tag=Buffer.from(parts[2],'base64');
 if(iv.length!==12||tag.length!==16)throw new Error('INVALID_VAULT_ENVELOPE');
 const decipher=createDecipheriv('aes-256-gcm',keyFromEnvironment(keyValue),iv);
 decipher.setAAD(contextBytes(context));decipher.setAuthTag(tag);
 return JSON.parse(Buffer.concat([decipher.update(Buffer.from(parts[3],'base64')),decipher.final()]).toString('utf8'));
}

export function mailConfiguration(env=process.env) {
 const user=env.SMTP_USER||"info@nfoodz.com";
 const from=env.SMTP_FROM||user;
 if(!/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(user)||from!==user) throw Error("MAIL_IDENTITY_INVALID");
 return {user,from,name:env.SMTP_FROM_NAME||"FOON",configured:Boolean(env.SMTP_PASSWORD),
  options:{host:env.SMTP_HOST||"smtp.hostinger.com",port:465,secure:true,
   auth:{user,pass:env.SMTP_PASSWORD||""},tls:{minVersion:"TLSv1.2"},
   connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,
   disableFileAccess:true,disableUrlAccess:true}};
}
export async function createMailProvider(env=process.env) {
 const config=mailConfiguration(env);
 if(!config.configured) throw Error("MAIL_PROVIDER_NOT_CONFIGURED");
 const {default:nodemailer}=await import("nodemailer");
 const transport=nodemailer.createTransport(config.options);
 return {configuration:{from:config.from,name:config.name},verify:()=>transport.verify(),
  async send({id,to,subject,text,html}) {
   if(!/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(to)) throw Error("RECIPIENT_INVALID");
   const result=await transport.sendMail({from:{name:config.name,address:config.from},to,
    subject,text,html,messageId:"<foon-"+id+"@"+config.from.split("@")[1]+">"});
   if(!result.accepted?.length||result.rejected?.length) throw Error("MAIL_RECIPIENT_NOT_ACCEPTED");
   return {accepted:true};
  },close:()=>transport.close()};
}

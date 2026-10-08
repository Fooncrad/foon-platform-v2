import test from "node:test";
import assert from "node:assert/strict";
import {mailConfiguration} from "./mail-provider.mjs";
import {defaultEmailTemplates,renderEmailTemplate,validateEmailTemplate,renderQueuedEmail} from "./email-templates.mjs";
test("shared identity requires encrypted SMTP and has no tenant credentials",()=>{
 const c=mailConfiguration({SMTP_PASSWORD:"test-only"});
 assert.equal(c.from,"info@nfoodz.com");assert.equal(c.options.port,465);
 assert.equal(c.options.secure,true);assert.equal(c.options.disableUrlAccess,true);
 assert.equal(mailConfiguration({}).configured,false);
 assert.throws(()=>mailConfiguration({SMTP_USER:"x@y.com",SMTP_FROM:"spoof@y.com"}));
});
test("all four templates render escaped HTML and readable plain text",()=>{
 for(const t of defaultEmailTemplates){
  assert.ok(validateEmailTemplate(t));
  const out=renderEmailTemplate(t,{subject:"طلب <script>",message:"مرجع & <img src=x>",tenant_name:"متجر <b>مثال"});
  assert.ok(out.html.includes("&lt;"));assert.ok(!out.html.includes("<script>"));assert.ok(!out.html.includes("<img src=x>"));
  assert.ok(out.text.includes("مرجع & <img src=x>"));
 }
});
test("unknown variables and header injection are rejected",()=>{
 const template={...defaultEmailTemplates[0],body_template:"{{password}}"};
 assert.equal(validateEmailTemplate(template),false);
 assert.equal(validateEmailTemplate({...defaultEmailTemplates[0],subject_template:"hello\r\nBcc:bad"}),false);
});
test("per-store messages never share their contents",()=>{
 const a=renderQueuedEmail({event_key:"subscription_renewal",subject:"تجديد",body_text:"مرجع A",tenant_name:"متجر A"});
 const b=renderQueuedEmail({event_key:"subscription_renewal",subject:"تجديد",body_text:"مرجع B",tenant_name:"متجر B"});
 assert.ok(a.text.includes("متجر A"));assert.ok(!a.text.includes("متجر B"));
 assert.ok(b.text.includes("مرجع B"));assert.ok(!b.text.includes("مرجع A"));
});

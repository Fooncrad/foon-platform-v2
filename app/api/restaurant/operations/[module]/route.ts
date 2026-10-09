import {NextResponse} from "next/server";
import type {PoolConnection,RowDataPacket} from "mysql2/promise";
import {currentUserId,currentSessionId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import type {TenantRole} from "@/lib/auth/roles";
import {tenantEntitlement} from "@/lib/plans/entitlements";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
import {resourceModules,ResourceError} from "@/scripts/restaurant-resource-schema.mjs";
import {resourceRows,saveResource,branchExists,ordersRows,createOrder,updateOrder} from "@/lib/restaurant/operations";
import {menuOptions,canonicalMenuModules} from "@/lib/restaurant/menu";

export const runtime="nodejs";
const managers:TenantRole[]=["owner","manager"];
const orderRoles:TenantRole[]=["owner","manager","cashier","waiter","kitchen","driver","accountant"];
const allRoles:TenantRole[]=[...orderRoles];
async function authorize(request:Request,module:string,write:boolean){
 if(write)try{assertSameOrigin(request);}catch{throw new ResourceError("FORBIDDEN");}
 const user=await currentUserId();if(!user)throw new ResourceError("UNAUTHENTICATED");
 const config=Object.hasOwn(resourceModules,module)?resourceModules[module]:null;
 const special=["overview","orders","pos","kds","customers","security","health","reports"];
 if(!config&&!special.includes(module))throw new ResourceError("MODULE_NOT_FOUND");
 const allowed=config?config.roles as TenantRole[]:module==="reports"?["owner","manager","accountant"] as TenantRole[]:module==="customers"||module==="health"?managers:module==="pos"?["owner","manager","cashier"] as TenantRole[]:module==="kds"?["owner","manager","kitchen"] as TenantRole[]:allRoles;
 const access=await requireTenantMembership(user,request.headers.get("x-foon-tenant")??"",allowed,write).catch(()=>{throw new ResourceError("FORBIDDEN");});
 const feature=config?.feature??({orders:"orders",pos:"pos",kds:"kds",customers:"customers",reports:"analytics"} as Record<string,string>)[module];
 if(feature&&!(await tenantEntitlement(access.tenantId,feature)).enabled)throw new ResourceError("PLAN_FEATURE_REQUIRED");
 return {user,tenantId:access.tenantId,role:access.role};
}
function failure(error:unknown){
 const code=error instanceof ResourceError?error.code:(error as {code?:string})?.code==="ER_DUP_ENTRY"?"DUPLICATE_RESOURCE":(error as {code?:string})?.code==="ER_LOCK_DEADLOCK"?"CONFLICT":"OPERATIONS_UNAVAILABLE";
 const status=code==="UNAUTHENTICATED"?401:code==="FORBIDDEN"||code==="PLAN_FEATURE_REQUIRED"?403:code.endsWith("_NOT_FOUND")?404:code==="CONFLICT"||code==="DUPLICATE_RESOURCE"?409:code==="OPERATIONS_UNAVAILABLE"?503:400;
 return NextResponse.json({ok:false,code},{status});
}
async function connection(){const db=await database().getConnection();try{await db.query("SET time_zone='+00:00'");return db;}catch(error){db.release();throw error;}}
async function overview(db:PoolConnection,tenantId:string,role:string,branch:string|null){
 const filter=branch?" AND branch_id=?":"",params=branch?[tenantId,branch]:[tenantId];
 const [[summary]]=await db.execute<RowDataPacket[]>("SELECT COUNT(*) AS orders,COALESCE(SUM(CASE WHEN payment_status='paid' AND status<>'cancelled' THEN total ELSE 0 END),0) AS sales,COALESCE(AVG(CASE WHEN payment_status='paid' AND status<>'cancelled' THEN total END),0) AS average,SUM(status='new') AS newOrders,SUM(status='preparing') AS preparing,SUM(status='ready') AS ready FROM restaurant_orders WHERE tenant_id=?"+filter+" AND created_at>=TIMESTAMP(DATE(UTC_TIMESTAMP()+INTERVAL 3 HOUR))-INTERVAL 3 HOUR",params);
 const [[tables]]=await db.execute<RowDataPacket[]>("SELECT COUNT(DISTINCT table_id) AS occupied FROM restaurant_orders WHERE tenant_id=?"+filter+" AND status IN ('new','preparing','ready')",params);
 const [series]=await db.execute<RowDataPacket[]>("SELECT DATE(created_at+INTERVAL 3 HOUR) AS day,SUM(total) AS total FROM restaurant_orders WHERE tenant_id=?"+filter+" AND payment_status='paid' AND status<>'cancelled' AND created_at>=UTC_TIMESTAMP()-INTERVAL 7 DAY GROUP BY day ORDER BY day",params);
 const financial=["owner","manager","cashier","accountant"].includes(role);
 return {summary:{sales:financial?Number(summary.sales):null,orders:Number(summary.orders),average:financial?Number(summary.average):null,newOrders:Number(summary.newOrders??0),preparing:Number(summary.preparing??0),ready:Number(summary.ready??0),tables:Number(tables.occupied)},series:financial?series.map(s=>({day:s.day instanceof Date?s.day.toISOString().slice(0,10):String(s.day).slice(0,10),total:Number(s.total)})):[],orders:await ordersRows(db,tenantId,role,branch)};
}
export async function GET(request:Request,{params}:{params:Promise<{module:string}>}){
 let db:PoolConnection|undefined;
 try{
  const {module}=await params,ctx=await authorize(request,module,false);db=await connection();
  const branch=new URL(request.url).searchParams.get("branch");await branchExists(db,ctx.tenantId,branch,module==="pos");
  if(Object.hasOwn(resourceModules,module)){
   const refs:Record<string,unknown[]>={};
   for(const field of resourceModules[module].fields.filter(f=>f.ref)){
    const config=resourceModules[field.ref!];
    if(config.roles.includes(ctx.role)&&(!config.feature||(await tenantEntitlement(ctx.tenantId,config.feature)).enabled))refs[field.ref!]=await resourceRows(db,ctx.tenantId,field.ref!,branch);
   }
   const resources=await resourceRows(db,ctx.tenantId,module,branch);
   if(module==="storefront"&&resources.length){const [appearance]=await db.execute<RowDataPacket[]>("SELECT template_key FROM restaurant_menu_appearance WHERE tenant_id=? LIMIT 1",[ctx.tenantId]);resources[0].data.menuTheme=String(appearance[0]?.template_key??resources[0].data.menuTheme??"sufra");}
   return NextResponse.json({ok:true,resources,references:refs});
  }
  if(["orders","pos","kds"].includes(module)){const menu=module==="pos"?await resourceRows(db,ctx.tenantId,"menu",branch):[];return NextResponse.json({ok:true,orders:await ordersRows(db,ctx.tenantId,ctx.role,branch),menu,options:module==="pos"?await menuOptions(db,ctx.tenantId,menu.map(i=>i.id)):{},tables:module==="pos"&&(await tenantEntitlement(ctx.tenantId,"tables")).enabled?await resourceRows(db,ctx.tenantId,"tables",branch):[]});}
  if(module==="overview")return NextResponse.json({ok:true,...await overview(db,ctx.tenantId,ctx.role,branch)});
  if(module==="reports"){
   const url=new URL(request.url),from=url.searchParams.get("from"),to=url.searchParams.get("to");
   if(!from||!to||!/^\d{4}-\d\d-\d\d$/.test(from)||!/^\d{4}-\d\d-\d\d$/.test(to))throw new ResourceError("INVALID_DATE_RANGE");
   const start=new Date(from+"T00:00:00+03:00"),end=new Date(to+"T00:00:00+03:00");end.setUTCDate(end.getUTCDate()+1);
   if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end.getTime()-start.getTime()>366*86400000)throw new ResourceError("INVALID_DATE_RANGE");
   const filter=branch?" AND o.branch_id=?":"",values=branch?[ctx.tenantId,start,end,branch]:[ctx.tenantId,start,end];
   const [daily]=await db.execute<RowDataPacket[]>("SELECT DATE(o.created_at+INTERVAL 3 HOUR) AS day,COUNT(*) AS orders,SUM(CASE WHEN o.payment_status='paid' AND o.status<>'cancelled' THEN o.total ELSE 0 END) AS sales FROM restaurant_orders o WHERE o.tenant_id=? AND o.created_at>=? AND o.created_at<?"+filter+" GROUP BY day ORDER BY day",values);
   const [branches]=await db.execute<RowDataPacket[]>("SELECT b.name,COUNT(*) AS orders,SUM(CASE WHEN o.payment_status='paid' AND o.status<>'cancelled' THEN o.total ELSE 0 END) AS sales FROM restaurant_orders o JOIN branches b ON b.id=o.branch_id WHERE o.tenant_id=? AND o.created_at>=? AND o.created_at<?"+filter+" GROUP BY b.id,b.name ORDER BY sales DESC",values);
   const [products]=await db.execute<RowDataPacket[]>("SELECT i.item_name,SUM(i.quantity) AS quantity,SUM(i.line_total) AS amount FROM restaurant_order_items i JOIN restaurant_orders o ON o.id=i.order_id AND o.tenant_id=i.tenant_id WHERE o.tenant_id=? AND o.created_at>=? AND o.created_at<? AND o.payment_status='paid' AND o.status<>'cancelled'"+filter+" GROUP BY i.menu_item_id,i.item_name ORDER BY quantity DESC LIMIT 20",values);
   return NextResponse.json({ok:true,daily:daily.map(row=>({...row,day:row.day instanceof Date?row.day.toISOString().slice(0,10):String(row.day),sales:Number(row.sales)})),branches:branches.map(row=>({...row,sales:Number(row.sales)})),products:products.map(row=>({...row,quantity:Number(row.quantity),amount:Number(row.amount)}))});
  }
  if(module==="customers"){const [rows]=await db.execute<RowDataPacket[]>("SELECT u.id,u.display_name,u.email,u.email_verified_at,c.created_at FROM tenant_customers c JOIN users u ON u.id=c.user_id WHERE c.tenant_id=? ORDER BY c.created_at DESC LIMIT 200",[ctx.tenantId]);return NextResponse.json({ok:true,customers:rows});}
  if(module==="security"){const current=await currentSessionId(),[rows]=await db.execute<RowDataPacket[]>("SELECT id,created_at,last_seen_at,expires_at FROM auth_sessions WHERE user_id=? AND expires_at>NOW() ORDER BY last_seen_at DESC LIMIT 100",[ctx.user]);return NextResponse.json({ok:true,sessions:rows.map(s=>({...s,current:s.id===current}))});}
  if(module==="health"){const [[history]]=await db.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM schema_migrations");return NextResponse.json({ok:true,database:"connected",migrations:Number(history.count),mailConfigured:Boolean(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASSWORD),checkedAt:new Date().toISOString()});}
  throw new ResourceError("MODULE_NOT_FOUND");
 }catch(error){return failure(error);}finally{db?.release();}
}
async function mutate(request:Request,module:string,method:string){
 let db:PoolConnection|undefined;
 try{
  const ctx=await authorize(request,module,true),body=await request.json().catch(()=>null);
  if(!body||typeof body!=="object"||Array.isArray(body))throw new ResourceError("INVALID_INPUT");
  db=await connection();await db.beginTransaction();
  let result;
  if(Object.hasOwn(resourceModules,module)){
   if(method==="POST"&&body.id!==undefined||method!=="POST"&&typeof body.id!=="string")throw new ResourceError("INVALID_INPUT");
   if(module==="storefront"&&method!=="DELETE"){
    for(const [key,feature] of [["logoUrl","branding.logo"],["menuTheme","branding.menu_theme"],["fontPreset","branding.custom_font"],["platformBranding","branding.white_label"]]){
     if(body.data?.[key]&&!(key==="menuTheme"&&body.data[key]==="classic"||key==="fontPreset"&&body.data[key]==="arial"||key==="platformBranding"&&body.data[key]==="visible")&&!(await tenantEntitlement(ctx.tenantId,feature)).enabled)throw new ResourceError("PLAN_FEATURE_REQUIRED");
    }
    if(body.data?.menuTheme==="dark"&&!(await tenantEntitlement(ctx.tenantId,"branding.dark_mode")).enabled)throw new ResourceError("PLAN_FEATURE_REQUIRED");
   }
   if(method==="POST"&&resourceModules[module].feature){const grant=await tenantEntitlement(ctx.tenantId,resourceModules[module].feature!);if(grant.limit!==null){await db.execute("SELECT tenant_id FROM tenant_subscriptions WHERE tenant_id=? FOR UPDATE",[ctx.tenantId]);const [[used]]=await db.execute<RowDataPacket[]>("SELECT COUNT(*) AS n FROM restaurant_resources WHERE tenant_id=? AND kind=? AND archived=FALSE",[ctx.tenantId,resourceModules[module].kind]);if((canonicalMenuModules.includes(module)?(await resourceRows(db,ctx.tenantId,module)).length:Number(used.n))>=grant.limit)throw new ResourceError("PLAN_LIMIT_REACHED");}}
   if(module==="purchases"&&!(await tenantEntitlement(ctx.tenantId,"inventory")).enabled)throw new ResourceError("PLAN_FEATURE_REQUIRED");
   result=await saveResource(db,ctx.tenantId,ctx.user,ctx.role,module,body,method==="DELETE");
  }else if(["orders","pos","kds"].includes(module)){
   if(method==="POST"){if(!["owner","manager","cashier","waiter"].includes(ctx.role)||module==="kds")throw new ResourceError("FORBIDDEN");if(body.couponCode&&!(await tenantEntitlement(ctx.tenantId,"coupons")).enabled)throw new ResourceError("PLAN_FEATURE_REQUIRED");if(body.tableId&&!(await tenantEntitlement(ctx.tenantId,"tables")).enabled)throw new ResourceError("PLAN_FEATURE_REQUIRED");result=await createOrder(db,ctx.tenantId,ctx.user,body);}
   else if(method==="PATCH")result=await updateOrder(db,ctx.tenantId,ctx.user,ctx.role,body);
   else throw new ResourceError("METHOD_NOT_ALLOWED");
  }else if(module==="security"&&method==="DELETE"){
   if(typeof body.id!=="string"||body.id===await currentSessionId())throw new ResourceError("CURRENT_SESSION_PROTECTED");
   const [found]=await db.execute<RowDataPacket[]>("SELECT id FROM auth_sessions WHERE id=? AND user_id=? FOR UPDATE",[body.id,ctx.user]);if(!found.length)throw new ResourceError("RESOURCE_NOT_FOUND");
   await db.execute("DELETE FROM auth_sessions WHERE id=? AND user_id=?",[body.id,ctx.user]);result={id:body.id};
  }else throw new ResourceError("METHOD_NOT_ALLOWED");
  await db.commit();return NextResponse.json({ok:true,...result},{status:method==="POST"?201:200});
 }catch(error){if(db)await db.rollback();return failure(error);}finally{db?.release();}
}
export async function POST(request:Request,{params}:{params:Promise<{module:string}>}){return mutate(request,(await params).module,"POST");}
export async function PATCH(request:Request,{params}:{params:Promise<{module:string}>}){return mutate(request,(await params).module,"PATCH");}
export async function DELETE(request:Request,{params}:{params:Promise<{module:string}>}){return mutate(request,(await params).module,"DELETE");}

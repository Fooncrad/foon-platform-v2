"use client";
import {useMemo,useState} from "react";
type Tenant={id:string;name:string;branches:{id:string;name:string}[]};
export default function DisplayPairClient({code,tenants}:{code:string;tenants:Tenant[]}){
 const [tenantId,setTenantId]=useState(tenants[0]?.id??""),[branchId,setBranchId]=useState(""),[pairCode,setPairCode]=useState(code),[name,setName]=useState("شاشة المجلس"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[done,setDone]=useState(false);
 const selected=tenants.find(item=>item.id===tenantId);
 const branches=useMemo(()=>selected?.branches??[],[selected]);
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError("");
  try{
   const response=await fetch("/api/restaurant/displays",{method:"POST",headers:{"content-type":"application/json","x-foon-tenant":tenantId},body:JSON.stringify({action:"pairClaim",code:pairCode.trim(),name:name.trim(),branchId:branchId||null})});
   const data=await response.json();
   if(!response.ok)throw new Error(String(data.code||"PAIRING_FAILED"));
   setDone(true);
  }catch(reason){setError(reason instanceof Error?reason.message:"تعذر ربط الشاشة");}
  finally{setBusy(false);}
 }
 return <main dir="rtl" style={{minHeight:"100vh",background:"#f3f6fb",padding:24,fontFamily:"Arial,sans-serif",display:"grid",placeItems:"center"}}>
  <form onSubmit={submit} style={{width:"min(520px,100%)",background:"#fff",border:"1px solid #dce5ef",borderRadius:20,padding:28,display:"grid",gap:16,boxShadow:"0 12px 40px #17365d12"}}>
   <div style={{fontSize:14,color:"#3272ad",fontWeight:700}}>FOON DISPLAY</div>
   <h1 style={{fontSize:28,margin:0}}>ربط شاشة جديدة</h1>
   {done?<><p style={{fontSize:18,color:"#166534"}}>تم ربط الشاشة بنجاح. ستبدأ الشاشة تشغيل الإعلانات تلقائياً.</p><a href="/restaurant" style={{color:"#1769aa"}}>العودة إلى لوحة النشاط</a></>:<>
    <p style={{color:"#536579",margin:0}}>اختر النشاط والفرع، وسمّ الشاشة. الرمز صالح لمدة قصيرة ويستخدم مرة واحدة.</p>
    <label style={{display:"grid",gap:7}}>النشاط<select value={tenantId} onChange={event=>{setTenantId(event.target.value);setBranchId("");}} style={{padding:12,border:"1px solid #cbd5e1",borderRadius:10}}>{tenants.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label style={{display:"grid",gap:7}}>الفرع<select value={branchId} onChange={event=>setBranchId(event.target.value)} style={{padding:12,border:"1px solid #cbd5e1",borderRadius:10}}><option value="">كل الفروع / بدون فرع محدد</option>{branches.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label style={{display:"grid",gap:7}}>اسم الشاشة<input value={name} onChange={event=>setName(event.target.value)} maxLength={120} required style={{padding:12,border:"1px solid #cbd5e1",borderRadius:10}}/></label>
    <label style={{display:"grid",gap:7}}>رمز الربط من شاشة التلفزيون<input value={pairCode} onChange={event=>setPairCode(event.target.value.replace(/\\D/g,"").slice(0,8))} inputMode="numeric" autoComplete="one-time-code" maxLength={8} required placeholder="00000000" style={{padding:14,border:"1px solid #cbd5e1",borderRadius:10,textAlign:"center",fontSize:24,letterSpacing:8}}/></label>
    {error?<p role="alert" style={{color:"#b42318",margin:0}}>{error}</p>:null}
    <button type="submit" disabled={busy||!tenantId||!name.trim()||pairCode.trim().length!==8} style={{padding:14,border:0,borderRadius:12,background:"#1769aa",color:"#fff",fontWeight:700,fontSize:16,cursor:"pointer"}}>{busy?"جارٍ ربط الشاشة...":"تأكيد وربط الشاشة"}</button>
   </>}
  </form>
 </main>;
}

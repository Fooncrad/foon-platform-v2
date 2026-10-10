"use client";
import {useMemo,useState} from "react";

const months=["January","February","March","April","May","June","July","August","September","October","November","December"];
const weekdays=["Su","Mo","Tu","We","Th","Fr","Sa"];
const pad=(n:number)=>String(n).padStart(2,"0");
const dateKey=(year:number,month:number,day:number)=>year+"-"+pad(month+1)+"-"+pad(day);
export default function BookingCalendar({min,max,language="ar"}:{min:string;max:string;language?:"ar"|"en"|"fr"}){
 const initial=min.slice(0,10);
 const [selected,setSelected]=useState(initial);
 const [view,setView]=useState(initial.slice(0,7));
 const [hour,setHour]=useState(min.slice(11,13)||"18");
 const [minute,setMinute]=useState(min.slice(14,16)||"00");
 const [y,m]=view.split("-").map(Number);
 const first=new Date(y,m-1,1).getDay();
 const days=new Date(y,m,0).getDate();
 const cells=useMemo(()=>Array.from({length:Math.ceil((first+days)/7)*7},(_,i)=>i-first+1),[first,days]);
 const value=selected+"T"+hour+":"+minute;
 const valid=value>=min&&value<=max;
 const title=language==="ar"?"اختر تاريخ الحجز (ميلادي)":language==="fr"?"Choisissez la date (grégorien)":"Choose booking date (Gregorian)";
 function move(delta:number){const d=new Date(y,m-1+delta,1);setView(d.getFullYear()+"-"+pad(d.getMonth()+1));}
 const prev=new Date(y,m-2,1);const next=new Date(y,m,1);
 const canPrev=dateKey(prev.getFullYear(),prev.getMonth(),new Date(prev.getFullYear(),prev.getMonth()+1,0).getDate())>=min.slice(0,10);
 const canNext=dateKey(next.getFullYear(),next.getMonth(),1)<=max.slice(0,10);
 return <div className="foonBookingCalendar" dir="ltr" lang="en-US" style={{maxWidth:360,width:"100%",fontVariantNumeric:"tabular-nums"}}>
  <label style={{display:"block",marginBottom:8}}>{title}</label>
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:10}}>
   <button type="button" onClick={()=>move(-1)} disabled={!canPrev} aria-label="Previous month">‹</button>
   <strong>{months[m-1]} {y}</strong>
   <button type="button" onClick={()=>move(1)} disabled={!canNext} aria-label="Next month">›</button>
  </div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:3,textAlign:"center"}}>
   {weekdays.map(day=><span key={day} style={{fontSize:12,opacity:.75}}>{day}</span>)}
   {cells.map((day,i)=>{const key=dateKey(y,m-1,day);const active=day>=1&&day<=days&&key>=min.slice(0,10)&&key<=max.slice(0,10);
    return day>=1&&day<=days?<button key={i} type="button" disabled={!active} aria-pressed={selected===key} onClick={()=>setSelected(key)} style={{padding:"8px 0",minWidth:0,borderRadius:7,background:selected===key?"#e2a93b":undefined,color:selected===key?"#171613":undefined,opacity:active?1:.35}}>{day}</button>:<span key={i}/>;
   })}
  </div>
  <div style={{display:"flex",alignItems:"center",gap:8,marginTop:12}}>
   <label style={{flex:1}}>Hour<select value={hour} onChange={e=>setHour(e.target.value)}>{Array.from({length:24},(_,i)=><option key={i} value={pad(i)}>{pad(i)}</option>)}</select></label>
   <label style={{flex:1}}>Minute<select value={minute} onChange={e=>setMinute(e.target.value)}>{Array.from({length:60},(_,i)=><option key={i} value={pad(i)}>{pad(i)}</option>)}</select></label>
  </div>
  <input type="hidden" name="scheduledAt" value={valid?value:""}/>
  <p aria-live="polite" style={{fontSize:12,marginTop:8}}>{valid?value.replace("T"," · "):language==="ar"?"اختر وقتًا ضمن الفترة المتاحة":language==="fr"?"Choisissez une heure disponible":"Choose a time within the available range"}</p>
 </div>;
}

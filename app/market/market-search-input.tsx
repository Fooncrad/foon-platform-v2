"use client";
import {useEffect,useState} from "react";
export default function MarketSearchInput({country,initial,label}:{country:string;initial:string;label:string}){
 const [value,setValue]=useState(initial),[items,setItems]=useState<string[]>([]);
 useEffect(()=>{if(value.trim().length<2||!country){setItems([]);return;}const controller=new AbortController();const timer=setTimeout(()=>{fetch("/api/public/market-suggestions?country="+encodeURIComponent(country)+"&q="+encodeURIComponent(value.trim()),{signal:controller.signal,cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>{if(d?.ok)setItems(d.suggestions??[])}).catch(()=>{});},250);return()=>{clearTimeout(timer);controller.abort()}},[country,value]);
 return <><input name="q" type="search" list="foon-market-search-hints" maxLength={80} value={value} onChange={e=>setValue(e.target.value)} placeholder={label} autoComplete="off"/><datalist id="foon-market-search-hints">{items.map(name=><option key={name} value={name}/>)}</datalist></>;
}

'use client';
import {useEffect,useRef,useSyncExternalStore} from 'react';
const subscribe=(notify:()=>void)=>{window.addEventListener('hashchange',notify);return()=>window.removeEventListener('hashchange',notify);};
export default function StorefrontReceipt({slug,language}:{slug:string;language:string}){
 const dialog=useRef<HTMLDialogElement>(null),hash=useSyncExternalStore(subscribe,()=>window.location.hash,()=>'');
 const query=new URLSearchParams(hash.slice(1)),id=query.get('receipt'),key=query.get('key');
 let source='';
 if(id&&/^[a-f0-9-]{36}$/i.test(id)&&(!key||/^[a-f0-9]{64}$/.test(key))){const params=new URLSearchParams({store:slug});if(key)params.set('key',key);source='/receipts/'+id+'?'+params.toString();}
 useEffect(()=>{if(source)dialog.current?.showModal();else dialog.current?.close();},[source]);
 const close=()=>{dialog.current?.close();const url=new URL(window.location.href);url.hash='';window.history.replaceState(null,'',url.pathname+url.search);window.dispatchEvent(new HashChangeEvent('hashchange'));};
 const label=language==='en'?'Close receipt and browse store':language==='fr'?'Fermer le reçu et parcourir la boutique':'إغلاق الإيصال وتصفح المتجر';
 return <dialog ref={dialog} aria-label={language==='en'?'Payment receipt':language==='fr'?'Reçu de paiement':'إيصال الدفع'} onCancel={event=>{event.preventDefault();close();}} style={{padding:0,border:0,borderRadius:16,width:'min(720px,calc(100% - 24px))',maxWidth:'calc(100% - 24px)',height:'min(850px,90dvh)',maxHeight:'90dvh'}}><div style={{display:'flex',flexDirection:'column',height:'100%'}}><button type='button' onClick={close} autoFocus style={{padding:14,cursor:'pointer',flexShrink:0}}>{label} ×</button>{source&&<iframe title={language==='en'?'Payment receipt':language==='fr'?'Reçu de paiement':'إيصال الدفع'} src={source} referrerPolicy='no-referrer' style={{border:0,width:'100%',flex:1,minHeight:0}}/>}</div></dialog>;
}

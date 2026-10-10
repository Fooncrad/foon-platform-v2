"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Full-document navigation is required for service-worker offline fallbacks. */
import {useMemo,useState,useSyncExternalStore} from 'react';

import PosTerminal from '../restaurant/pos-terminal';
import {savedCatalogs,subscribePosStorage,type PosSnapshot} from '../restaurant/pos-storage';
import '../restaurant/merchant-dashboard.css';
import '../restaurant/merchant-operations.css';
import '../restaurant/merchant-experience.css';
export default function OfflinePage(){const encoded=useSyncExternalStore(subscribePosStorage,savedCatalogs,()=>'[]'),catalogs=useMemo(()=>JSON.parse(encoded) as PosSnapshot[],[encoded]),[selected,setSelected]=useState(0),ready=useSyncExternalStore(()=>()=>{},()=>true,()=>false);const catalog=catalogs[selected];return <main className="restaurantApp offlineWorkspace" dir="rtl"><header><a href="/restaurant">FOON</a><div><h1>نقطة البيع دون اتصال</h1><p>الكتالوج والسلة محفوظان محليًا. مراجعة الطلب وإرساله تتم من لوحة المطعم عند الاتصال.</p></div><a className="restaurantOutline" href="/restaurant">العودة للوحة المطعم</a></header>{catalogs.length>1&&<label className="offlineCatalogPicker">الكتالوج المحفوظ<select aria-label="الكتالوج المحفوظ" value={selected} onChange={e=>setSelected(Number(e.target.value))}>{catalogs.map((c,i)=><option value={i} key={i}>{c.name} · {c.branches.find(b=>b.id===c.branch)?.name||'الفرع'}</option>)}</select></label>}{catalog?<PosTerminal key={catalog.actorId+catalog.tenantId+catalog.branch} tenantId={catalog.tenantId} actorId={catalog.actorId} name={catalog.name} branch={catalog.branch} branches={catalog.branches.filter(b=>b.id===catalog.branch)} offlineSnapshot={catalog} onCreated={()=>{}}/>:<section className="restaurantEmpty"><h2>{ready?'لم يُحفظ كتالوج بعد':'جارٍ فتح الكتالوج…'}</h2><p>افتح نقطة البيع أثناء الاتصال مرة واحدة لتجهيزها للاستخدام دون اتصال.</p><a className="restaurantPrimary" href="/restaurant">فتح لوحة المطعم</a></section>}</main>}

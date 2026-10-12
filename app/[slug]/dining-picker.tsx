"use client";
import {useState} from 'react';
import type {DiningTable,DiningSection} from './menu-services';
export default function DiningPicker({branch,tables,sections=[],booking=false,party=false,language='ar'}:{branch:string;tables:DiningTable[];sections?:DiningSection[];booking?:boolean;party?:boolean;language?:'ar'|'en'|'fr'}){
 const [section,setSection]=useState(''),[table,setTable]=useState('');
 const ar=language==='ar',fr=language==='fr';
 const available=sections.filter(s=>!s.branchId||s.branchId===branch);
 const rows=tables.filter(t=>!t.branchId||t.branchId===branch);
 const selected=rows.find(t=>t.id===table);
 if(booking)return <div className="publicDiningFields"><label>{ar?'قسم الصالة':fr?'Espace':'Dining section'}<select name="sectionId" required value={section} onChange={e=>setSection(e.target.value)}><option value="">{ar?'اختر القسم':fr?'Choisir un espace':'Choose a section'}</option>{available.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{party&&<label>{ar?'عدد الأشخاص':fr?'Convives':'Party size'}<input name="partySize" type="number" required min={1} max={100} defaultValue={2}/></label>}</div>;
 return <div className="publicDiningFields"><label>{ar?'رقم الطاولة':fr?'Numéro de table':'Table number'}<select name="tableId" aria-label={ar?'رقم الطاولة':'Table number'} required value={table} onChange={e=>setTable(e.target.value)}><option value="">{ar?'اختر الطاولة':fr?'Choisir une table':'Choose a table'}</option>{rows.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>{!rows.length&&<small>{ar?'لا توجد طاولات متاحة حالياً.':fr?'Aucune table disponible.':'No available tables.'}</small>}</label>{party&&<label>{ar?'عدد الأشخاص':fr?'Convives':'Party size'}<input name="partySize" type="number" required min={1} max={selected?.capacity??100} defaultValue={1}/>{selected?.capacity&&<small>{ar?'السعة القصوى: ':'Maximum capacity: '}{selected.capacity}</small>}</label>}</div>;
}

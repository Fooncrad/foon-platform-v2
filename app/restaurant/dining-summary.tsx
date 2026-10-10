import type {StoredResource} from '@/lib/restaurant/operations';
import {MerchantIcon} from './merchant-icon';
export default function DiningSummary({row,references,section=false}:{row:StoredResource;references:Record<string,StoredResource[]>;section?:boolean}){
 const floor=section?row:references.sections?.find(s=>s.id===row.data.sectionId);
 const staffName=(id:unknown)=>references.staffLabels?.find(s=>s.id===id)?.name||'لم يُعيّن';
 return <div className="restaurantDiningSummary"><div className="restaurantDiningIdentity"><span><MerchantIcon name={section?'store':'table'}/></span><div><small>{section?'قسم الصالة':floor?.name||'الصالة الرئيسية'}</small><strong>{section?row.name:'طاولة '+String(row.data.number||row.name)}</strong></div>{!section&&<b className="restaurantTableCapacity">{String(row.data.capacity||'—')}<small>مقاعد</small></b>}</div><dl><div><dt>النادل المسؤول</dt><dd>{staffName(floor?.data.waiterId)}</dd></div><div><dt>مشرف القسم</dt><dd>{staffName(floor?.data.supervisorId)}</dd></div></dl>{row.data.notes&&<p>{String(row.data.notes)}</p>}</div>;
}

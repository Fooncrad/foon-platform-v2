import type {StoredResource} from '@/lib/restaurant/operations';
import {MerchantIcon} from './merchant-icon';

export default function ReservationSummary({row,references}:{row:StoredResource;references:Record<string,StoredResource[]>}){
 const scheduledAt=String(row.data.scheduledAt||''),date=new Date(scheduledAt),valid=Number.isFinite(date.getTime());
 const dateText=valid?date.toLocaleDateString('ar-SA',{timeZone:'Asia/Riyadh',calendar:'gregory',weekday:'long',day:'numeric',month:'long'}):'موعد غير محدد';
 const timeText=valid?date.toLocaleTimeString('ar-SA',{timeZone:'Asia/Riyadh',hour:'2-digit',minute:'2-digit'}):'—';
 const section=references.sections?.find(s=>s.id===row.data.sectionId)?.name||'الصالة الرئيسية',table=references.tables?.find(t=>t.id===row.data.tableId)?.name||'تعيين الطاولة لاحقًا';
 return <div className="restaurantReservationSummary"><div className="restaurantReservationDate"><span><MerchantIcon name="calendar"/></span><div><small>{dateText}</small><time dateTime={valid?scheduledAt:undefined}>{timeText}</time></div></div><div className="restaurantReservationChips"><span>{String(row.data.partySize||'—')} ضيوف</span><span>{String(row.data.durationMinutes||90)} دقيقة</span></div><dl><div><dt>القسم والطاولة</dt><dd>{section} · {table}</dd></div><div><dt>هاتف الضيف</dt><dd dir="ltr">{String(row.data.phone||'لم يُضف')}</dd></div><div className="restaurantReservationEmail"><dt>بريد العميل</dt><dd dir="ltr">{row.data.email?<a href={"mailto:"+String(row.data.email)}>{String(row.data.email)}</a>:"لم يُضف"}</dd></div></dl>{row.data.notes&&<p className="restaurantReservationNotes">{String(row.data.notes)}</p>}</div>;
}

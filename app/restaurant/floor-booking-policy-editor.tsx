"use client";
import {useEffect, useState} from "react";
import {defaultFloorBookingPolicy, type FloorBookingPolicy} from "@/lib/restaurant/floor-booking-policy";

type Language = "ar" | "en" | "fr";
type Props = {tenantId: string; branch: string; language: Language; currency: string};

export default function FloorBookingPolicyEditor({tenantId, branch, language, currency}: Props) {
  const [policy, setPolicy] = useState<FloorBookingPolicy>(defaultFloorBookingPolicy);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const url = "/api/restaurant/floor-booking-policy?branch=" + encodeURIComponent(branch);
  const tr = (ar: string, en: string, fr: string) => language === "en" ? en : language === "fr" ? fr : ar;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage("");
    setPolicy(defaultFloorBookingPolicy);
    fetch(url, {headers: {"x-foon-tenant": tenantId}, cache: "no-store"})
      .then(async response => {
        if (!response.ok) throw new Error("LOAD_FAILED");
        const data: {settings?: FloorBookingPolicy} = await response.json();
        if (!data.settings) throw new Error("INVALID_RESPONSE");
        if (active) setPolicy(data.settings);
      })
      .catch(() => {
        if (active) setMessage(tr("تعذر تحميل سياسة الحجز؛ لن تُحفظ إعدادات غير محمّلة.", "Could not load the booking policy; saving is disabled.", "Impossible de charger la politique de réservation ; l'enregistrement est désactivé."));
      })
      .finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  // language is only used to translate a failure; do not refetch on language changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tenantId]);

  async function save() {
    if (loading || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: {"content-type": "application/json", "x-foon-tenant": tenantId},
        body: JSON.stringify({settings: policy}),
      });
      const data: {code?: string} = await response.json();
      if (!response.ok) throw new Error(data.code || "SAVE_FAILED");
      setMessage(tr("تم حفظ سياسة هذا الفرع.", "Branch policy saved.", "Politique de la succursale enregistrée."));
    } catch (error) {
      setMessage(error instanceof Error && error.message === "PAYMENT_SETTLEMENT_INTEGRATION_REQUIRED"
        ? tr("لا يمكن تشغيل الحجز المدفوع حتى اكتمال تكامل الدفع ومنع الحجز المزدوج.", "Paid floor booking cannot be enabled until payment settlement and double-booking protection are complete.", "La réservation payante ne peut pas être activée avant la finalisation du paiement et la prévention des doubles réservations.")
        : tr("تعذر حفظ إعدادات الحجز.", "Could not save the booking policy.", "Impossible d'enregistrer la politique de réservation."));
    } finally {
      setSaving(false);
    }
  }

  return <section className="restaurantPanel" style={{padding: 18, marginBlock: 12}}>
    <h3>{tr("سياسة الحجز من المخطط", "Floor-plan booking policy", "Politique de réservation sur plan")}</h3>
    <p>{tr("الحجوزات العادية لا تتغير. اختيار طاولة من المخطط غير متاح للعملاء قبل تكامل الدفع وربط الطاولات.", "Classic reservations are unchanged. Floor-plan seat selection remains unavailable until payment and real-table mapping are integrated.", "Les réservations classiques restent inchangées. Le choix de table sur plan est indisponible avant l'intégration du paiement et la liaison des tables.")}</p>
    <p role="note">{tr("الحجز المدفوع من المخطط غير مفعّل.", "Paid floor-plan booking is not enabled.", "La réservation payante sur plan n'est pas activée.")}</p>
    <div style={{display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end"}}>
      <label>{tr("رسوم الجلسة", "Session fee", "Frais de séance")} ({currency})
        <input type="number" min={0} max={100000} step={0.01} value={policy.bookingFee} disabled={loading || saving} onChange={event => setPolicy(value => ({...value, bookingFee: Number(event.target.value)}))}/>
      </label>
      <label>{tr("مدة الجلسة (دقائق)", "Session duration (minutes)", "Durée de la séance (minutes)")}
        <select value={policy.sessionMinutes} disabled={loading || saving} onChange={event => setPolicy(value => ({...value, sessionMinutes: Number(event.target.value)}))}>
          {[60, 90, 120, 180, 240].map(minutes => <option value={minutes} key={minutes}>{minutes}</option>)}
        </select>
      </label>
      <label>{tr("الطلب المسبق", "Advance order", "Commande anticipée")}
        <select value={policy.orderPolicy} disabled={loading || saving} onChange={event => setPolicy(value => ({...value, orderPolicy: event.target.value as FloorBookingPolicy["orderPolicy"]}))}>
          <option value="optional">{tr("اختياري", "Optional", "Facultative")}</option>
          <option value="required">{tr("إلزامي", "Required", "Obligatoire")}</option>
          <option value="disabled">{tr("جلسة فقط", "Session only", "Séance uniquement")}</option>
        </select>
      </label>
      <label>{tr("سياسة الاسترداد", "Refund policy", "Politique de remboursement")}
        <select value={policy.refundPolicy} disabled={loading || saving} onChange={event => setPolicy(value => ({...value, refundPolicy: event.target.value as FloorBookingPolicy["refundPolicy"]}))}>
          <option value="restaurant">{tr("حسب سياسة المطعم", "Restaurant policy", "Politique du restaurant")}</option>
          <option value="nonrefundable">{tr("غير مستردة", "Non-refundable", "Non remboursable")}</option>
        </select>
      </label>
    </div>
    <button type="button" disabled={loading || saving || Boolean(message && message.includes("تحميل"))} onClick={save}>
      {loading ? tr("جارٍ التحميل", "Loading", "Chargement") : saving ? tr("جارٍ الحفظ", "Saving", "Enregistrement") : tr("حفظ سياسة الفرع", "Save branch policy", "Enregistrer la politique")}
    </button>
    {message && <p role="status">{message}</p>}
  </section>;
}

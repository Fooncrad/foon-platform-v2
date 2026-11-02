"use client";
import {useEffect, useState} from "react";
import {defaultFloorBookingPolicy, type FloorBookingPolicy} from "@/lib/restaurant/floor-booking-policy";

type Language = "ar" | "en" | "fr";
function latinFee(value: string): string {
  return value.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x6f0))
    .replace(/٫/g, ".").replace(/[٬،\s]/g, "");
}
function parseFee(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= 100000 ? amount : null;
}
type Props = {tenantId: string; branch: string; language: Language; currency: string};

export default function FloorBookingPolicyEditor({tenantId, branch, language, currency}: Props) {
  const [policy, setPolicy] = useState<FloorBookingPolicy>(defaultFloorBookingPolicy);
  const [feeText, setFeeText] = useState("0");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const url = "/api/restaurant/floor-booking-policy?branch=" + encodeURIComponent(branch);
  const tr = (ar: string, en: string, fr: string) => language === "en" ? en : language === "fr" ? fr : ar;

  useEffect(() => {
    let active = true;
    // Reset asynchronously so React does not synchronously cascade renders
    // from the effect. Ignore stale responses after a branch change.
    void Promise.resolve().then(() => {
      if (!active) return;
      setLoading(true);
      setLoaded(false);
      setMessage("");
      setPolicy(defaultFloorBookingPolicy);
      setFeeText("0");
      return fetch(url, {headers: {"x-foon-tenant": tenantId}, cache: "no-store"})
        .then(async response => {
          if (!response.ok) throw new Error("LOAD_FAILED");
          const data: {settings?: FloorBookingPolicy} = await response.json();
          if (!data.settings) throw new Error("INVALID_RESPONSE");
          if (active) {setPolicy(data.settings); setFeeText(String(data.settings.bookingFee)); setLoaded(true);}
        })
        .catch(() => {
          if (active) setMessage(tr("تعذر تحميل سياسة الحجز؛ لن تُحفظ إعدادات غير محمّلة.", "Could not load the booking policy; saving is disabled.", "Impossible de charger la politique de réservation ; l'enregistrement est désactivé."));
        })
        .finally(() => {if (active) setLoading(false);});
    });
    return () => {active = false;};
  // language is only used to translate a failure; do not refetch on language changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tenantId]);

  async function save() {
    if (loading || !loaded || saving) return;
    const fee = parseFee(feeText);
    if (fee === null) {setMessage(tr("أدخل الرسوم بالأرقام الإنجليزية وبحد أقصى منزلتين عشريتين.", "Enter the fee in English digits with at most two decimals.", "Saisissez les frais en chiffres latins, avec deux décimales maximum.")); return;}
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: {"content-type": "application/json", "x-foon-tenant": tenantId},
        body: JSON.stringify({settings: {...policy, bookingFee: fee}}),
      });
      const data: {code?: string} = await response.json();
      if (!response.ok) throw new Error(data.code || "SAVE_FAILED");
      setPolicy(previous => ({...previous, bookingFee: fee}));
      setFeeText(String(fee));
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
    <p role="note">{tr("الخطوات: حجز مؤقت للجلسة ← الدفع ← تأكيد الحجز بعد نجاح الدفع. إذا لم ينجح الدفع تُحرر الجلسة. الحجز المدفوع من المخطط غير مفعّل بعد.", "Flow: hold a seat first, then pay; confirm only after successful payment. Release the hold on failed or expired payment. Paid floor booking is not enabled yet.", "Parcours : bloquer temporairement la table, puis payer ; confirmation uniquement après paiement réussi. Libérer la table en cas d’échec ou d’expiration. Réservation payante non activée.")}</p><p role="note">{tr("الحجز المدفوع من المخطط غير مفعّل.", "Paid floor-plan booking is not enabled.", "La réservation payante sur plan n'est pas activée.")}</p>
    <div style={{display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end"}}>
      <label>{tr("رسوم الجلسة", "Session fee", "Frais de séance")} ({currency})
        <input type="text" dir="ltr" lang="en" inputMode="decimal" autoComplete="off" pattern="[0-9]+([.][0-9]{1,2})?" style={{direction:"ltr",textAlign:"left",fontVariantNumeric:"tabular-nums"}} value={feeText} disabled={loading || saving} onChange={event => setFeeText(latinFee(event.target.value))}/>
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
    <button type="button" disabled={loading || !loaded || saving} onClick={save}>
      {loading ? tr("جارٍ التحميل", "Loading", "Chargement") : saving ? tr("جارٍ الحفظ", "Saving", "Enregistrement") : tr("حفظ سياسة الفرع", "Save branch policy", "Enregistrer la politique")}
    </button>
    {message && <p role="status">{message}</p>}
  </section>;
}

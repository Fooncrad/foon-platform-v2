import Link from "next/link";

type Language="ar"|"en"|"fr";

/** Explicit opt-in for platform terms and privacy; never prechecked. */
export default function RequiredLegalConsent({language="ar",name="legalConsent",checked,onChange}:{language?:Language;name?:string;checked?:boolean;onChange?:(value:boolean)=>void}){
 const text={
  ar:{before:"أوافق على",terms:"الشروط والأحكام",and:"و",privacy:"سياسة الخصوصية",required:"يلزم قبول الشروط وسياسة الخصوصية للمتابعة."},
  en:{before:"I agree to the",terms:"Terms and Conditions",and:"and",privacy:"Privacy Policy",required:"Accept the terms and privacy policy to continue."},
  fr:{before:"J'accepte les",terms:"Conditions générales",and:"et la",privacy:"Politique de confidentialité",required:"L'acceptation des conditions et de la confidentialité est obligatoire."}
 }[language];
 return <div className="foonLegalConsent" style={{display:"grid",gap:6,margin:"12px 0",fontSize:14,lineHeight:1.8}}>
  <label style={{display:"flex",gap:10,alignItems:"flex-start",cursor:"pointer"}}>
   <input type="checkbox" name={name} required checked={checked} onChange={onChange?event=>onChange(event.target.checked):undefined} style={{width:18,height:18,flexShrink:0,marginTop:5}} aria-describedby={name+"-hint"}/>
   <span>{text.before} <Link href="/p/terms" target="_blank" rel="noopener noreferrer" style={{textDecoration:"underline"}}>{text.terms}</Link> {text.and} <Link href="/p/privacy" target="_blank" rel="noopener noreferrer" style={{textDecoration:"underline"}}>{text.privacy}</Link>.</span>
  </label>
  <small id={name+"-hint"} style={{opacity:.7}}>{text.required}</small>
 </div>;
}

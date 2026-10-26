export const landingFields=["badge","title","lead","start","market","features","featuresText","stepsTitle","footer","card1Title","card1Body","card2Title","card2Body","card3Title","card3Body","step1Title","step1Body","step2Title","step2Body","step3Title","step3Body"] as const;
export type LandingLanguage="ar"|"en"|"fr";
export type LandingContent=Partial<Record<typeof landingFields[number],string>>;
export type LandingSettings={text:Record<LandingLanguage,LandingContent>;heroImage:string;showFeatures:boolean;showPlans:boolean;showSteps:boolean};
export const emptyLandingSettings=():LandingSettings=>({text:{ar:{},en:{},fr:{}},heroImage:"",showFeatures:true,showPlans:true,showSteps:true});
export function validateLanding(value:unknown):value is LandingSettings {
 if(!value||typeof value!=="object")return false;
 const v=value as LandingSettings;
 if(typeof v.heroImage!=="string"||v.heroImage.length>2048||Boolean(v.heroImage)&&(!/^https:\/\//i.test(v.heroImage)||/[<>"'\s]/.test(v.heroImage)))return false;
 if(["showFeatures","showPlans","showSteps"].some(k=>typeof v[k as keyof LandingSettings]!=="boolean"))return false;
 if(!v.text||typeof v.text!=="object")return false;
 return (["ar","en","fr"] as const).every(lang=>v.text[lang]&&typeof v.text[lang]==="object"&&Object.entries(v.text[lang]).every(([k,s])=>landingFields.includes(k as typeof landingFields[number])&&typeof s==="string"&&s.length<=3000));
}

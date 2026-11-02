export const menuTemplates=[
 {id:"classic",name:"المعرض",description:"صور واسعة وبطاقات مريحة للمطاعم المتنوعة",layout:"grid",accent:"#c84f20",reference:1},
 {id:"minimal",name:"القائمة",description:"صور دائرية وصفوف هادئة للمقاهي والقوائم الطويلة",layout:"list",accent:"#187565",reference:2},
 {id:"modern",name:"السريع",description:"صفوف مدمجة وصور مربعة للوصول السريع للأصناف",layout:"compact",accent:"#4b57c7",reference:3},
 {id:"sufra",name:"السفرة",description:"واجهة غنية بتصنيفات واضحة وشريط تنقل للجوال",layout:"tiles",accent:"#bf8f48",reference:4}
] as const;
export type MenuTemplate=typeof menuTemplates[number]["id"];
export const colorModes=["template","light","dark","system"] as const;
export type MenuColorMode=typeof colorModes[number];
export function isMenuTemplate(value:unknown):value is MenuTemplate{return menuTemplates.some(t=>t.id===value);}
export function isMenuColorMode(value:unknown):value is MenuColorMode{return colorModes.some(t=>t===value);}

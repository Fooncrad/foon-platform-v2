// Shared customer wayfinding. Section IDs map to real portal sections only.
export type CustomerNavLanguage="ar"|"en"|"fr";
export const customerSectionIds=["customer-top","customer-orders","customer-reservations","customer-addresses","account-settings"] as const;
export type CustomerSectionId=typeof customerSectionIds[number];
const labels:Record<CustomerNavLanguage,readonly string[]>={
 ar:["الرئيسية","طلباتي","حجوزاتي","العناوين","حسابي"],
 en:["Home","Orders","Bookings","Addresses","Account"],
 fr:["Accueil","Commandes","Réservations","Adresses","Compte"]
};
export const customerSectionIcons=["⌂","▤","◷","⌖","◯"] as const;
export function customerNavigation(language:CustomerNavLanguage){
 return customerSectionIds.map((id,index)=>({id,href:"#"+id,label:labels[language][index],icon:customerSectionIcons[index]}));
}
export function currentCustomerSection(hash:string):CustomerSectionId{
 const id=hash.replace(/^#/,"");
 return (customerSectionIds as readonly string[]).includes(id)?id as CustomerSectionId:"customer-top";
}

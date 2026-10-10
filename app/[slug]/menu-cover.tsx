"use client";
import {useState} from 'react';
import Image from 'next/image';
export default function MenuCover({url,language}:{url:string|null;language:'ar'|'en'|'fr'}){
 const [framed,setFramed]=useState(false);
 return <section className="publicMenuHero" data-cover-shape={!url?'empty':framed?'portrait':'landscape'} aria-label={language==='ar'?'صورة غلاف المطعم':language==='fr'?'Couverture du restaurant':'Restaurant cover'}>{url&&<><Image className="publicMenuHeroBackdrop" src={url} fill unoptimized alt="" aria-hidden="true" sizes="(max-width:700px) 100vw,1240px"/><Image className="publicMenuHeroImage" src={url} fill unoptimized alt="" sizes="(max-width:700px) 100vw,1240px" onLoad={event=>{const image=event.currentTarget;setFramed(image.naturalWidth<image.naturalHeight*1.4)}}/></>}</section>;
}

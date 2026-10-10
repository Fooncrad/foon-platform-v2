"use client";
import Image from 'next/image';
export default function MenuCover({url,language}:{url:string|null;language:'ar'|'en'|'fr'}){
 return <section className="publicMenuHero" data-cover-shape={url?'filled':'empty'} aria-label={language==='ar'?'صورة غلاف المطعم':language==='fr'?'Couverture du restaurant':'Restaurant cover'}>{url&&<Image className="publicMenuHeroImage" src={url} fill unoptimized alt="" sizes="(max-width:700px) 100vw,1240px"/>}</section>;
}

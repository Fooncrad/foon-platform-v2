// ESC/POS paper width is a physical setting; 32/48 are conservative, common
// text-column limits for default-font 58/80 mm devices (actual devices vary).
export function receiptColumns(paperWidth){
 return Number(paperWidth)===58?32:48;
}
const segmenter=typeof Intl.Segmenter==="function"?new Intl.Segmenter(undefined,{granularity:"grapheme"}):null;
function graphemes(value){
 return segmenter?Array.from(segmenter.segment(value),part=>part.segment):Array.from(value);
}
export function wrappedReceiptLines(value,paperWidth=80){
 const columns=receiptColumns(paperWidth);
 // Never let a customer-supplied ESC/POS control sequence reach a printer.
 const clean=String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/gu," ").trim();
 if(!clean)return [""];
 const lines=[];
 let current="",size=0;
 function flush(){if(current){lines.push(current);current="";size=0;}}
 for(const word of clean.split(" ")){
  let chars=graphemes(word);
  if(current&&size+1+chars.length>columns&&chars.length<=columns)flush();
  if(chars.length<=columns){
   if(current){current+=" ";size++;}
   current+=word;size+=chars.length;
   continue;
  }
  // A long SKU can share the end of a line with its quantity prefix.
  // Keep the separating space and fill available columns first.
  if(current){
   const available=Math.max(0,columns-size-1);
   if(available){
    current+=" "+chars.slice(0,available).join("");
    chars=chars.slice(available);
   }
   flush();
  }
  // Break the remainder without discarding any characters.
  for(let start=0;start<chars.length;start+=columns){
   const chunk=chars.slice(start,start+columns).join("");
   if(start+columns<chars.length)lines.push(chunk);
   else{current=chunk;size=chars.length-start;}
  }
 }
 flush();
 return lines;
}

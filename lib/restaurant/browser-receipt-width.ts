export type ReceiptPaperWidth=58|80;
export function normalizeReceiptPaperWidth(value:unknown):ReceiptPaperWidth{
 return String(value)==="58"?58:80;
}
// Browsers do not all honor auto-length thermal page media. Constrain the
// printable content regardless and let the browser print dialog select roll.
export function receiptPaperCss(value:unknown):string{
 const width=normalizeReceiptPaperWidth(value);
 const printable=width-6;
 const font=width===58?10:12;
 return `@page{size:${width}mm auto;margin:3mm}
body{width:${printable}mm;max-width:100%;font-size:${font}px}
.line{min-width:0;overflow-wrap:anywhere}
.line span:first-child{min-width:0;overflow-wrap:anywhere}
.line strong{white-space:normal;overflow-wrap:anywhere;text-align:end}
h1,h2,.hero,.note{overflow-wrap:anywhere}`;
}

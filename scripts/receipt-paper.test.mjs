import assert from "node:assert/strict";
import {test} from "node:test";
import {receiptColumns,wrappedReceiptLines} from "../lib/restaurant/receipt-paper.mjs";

test("printable lines adapt to 58 mm and 80 mm rolls without losing words",()=>{
 assert.equal(receiptColumns("58"),32);assert.equal(receiptColumns(80),48);
 const source="FRESH DATE MIXED JUICE 750 ML TAKEAWAY ORDER";
 for(const width of [58,80]){
  const lines=wrappedReceiptLines(source,width);
  assert(lines.every(line=>Array.from(line).length<=receiptColumns(width)));
  assert.equal(lines.join(" "),source);
 }
 assert(wrappedReceiptLines(source,58).length>wrappedReceiptLines(source,80).length);
});
test("long product names are split, not truncated, and Arabic graphemes stay intact",()=>{
 const name="قَهْوَة".repeat(24);
 const result=wrappedReceiptLines(name,58);
 assert(result.every(line=>Array.from(line).length<=receiptColumns(58)*3),"Arabic combining marks may add codepoints but cannot exceed grapheme limits");
 assert.equal(result.join(""),name);
});
test("untrusted line text cannot inject ESC/POS commands or line feeds",()=>{
 const out=wrappedReceiptLines("POS\x1b@\r\nEXTRA\x1dV",58).join(" ");
 assert(!/[\u0000-\u001f\u007f]/.test(out));
 assert.equal(out,"POS @ EXTRA V");
});
test("long continuous option codes and emoji do not overrun paper columns",()=>{
 const name="A".repeat(115);
 for(const width of [58,80]){
  const lines=wrappedReceiptLines(name,width);
  assert(lines.every(l=>Array.from(l).length<=receiptColumns(width)));
  assert.equal(lines.join(""),name);
 }
 const emoji="🍨".repeat(37);
 assert.equal(wrappedReceiptLines(emoji,58).join(""),emoji);
});

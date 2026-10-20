import assert from "node:assert/strict";
import {test} from "node:test";
import {normalizeReceiptPaperWidth,receiptPaperCss} from "../lib/restaurant/browser-receipt-width.ts";

test("58 mm browser receipts use 52 mm printable body",()=>{
 const css=receiptPaperCss("58");
 assert.match(css,/@page\{size:58mm auto;margin:3mm\}/);
 assert.match(css,/body\{width:52mm;max-width:100%;font-size:10px\}/);
});
test("80 mm browser receipts use 74 mm printable body",()=>{
 const css=receiptPaperCss("80");
 assert.match(css,/@page\{size:80mm auto;margin:3mm\}/);
 assert.match(css,/body\{width:74mm;max-width:100%;font-size:12px\}/);
});
test("unknown widths are normalized to 80 mm and cannot inject CSS",()=>{
 assert.equal(normalizeReceiptPaperWidth("80mm;body{color:red}"),80);
 assert.equal(normalizeReceiptPaperWidth("57"),80);
 assert.equal(normalizeReceiptPaperWidth(58),58);
 const css=receiptPaperCss("58;@page{size:A4}");
 assert.match(css,/size:80mm auto/);
 assert.doesNotMatch(css,/@page\{size:A4/);
});
test("long descriptions and totals wrap in both paper widths",()=>{
 for(const width of [58,80]){
  const css=receiptPaperCss(width);
  assert.match(css,/overflow-wrap:anywhere/);
  assert.match(css,/white-space:normal/);
 }
});

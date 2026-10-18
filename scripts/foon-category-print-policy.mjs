// W14: pure print-routing policy for all merchant activities.
// Category-level binding is authoritative; never route by SKU, item name,
// client-supplied category, or an arbitrary default printer.
// No physical printer, spooler, Windows device, DB or network interaction.
import {createHash} from "node:crypto";

const id=value=>typeof value==="string"&&value.length>0&&value.length<=128&&
  !/[\r\n\0]/.test(value);
const stamp=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const safeFooter=value=>{
  if(value===undefined||value===null)return "";
  if(typeof value!=="string"||value.length>300||/[\0]/.test(value))
    throw Error("PRINT_INVALID_FOOTER");
  return value;
};
function requireMerchantScope(tenantId,branchId){
  if(!id(tenantId)||!id(branchId))throw Error("PRINT_INVALID_MERCHANT_SCOPE");
}
function printerById(printers,printerId,role,tenantId,branchId){
  if(!Array.isArray(printers))throw Error("PRINT_INVALID_PRINTER_REGISTRY");
  const matches=printers.filter(item=>item?.id===printerId);
  if(matches.length!==1)throw Error("PRINT_PRINTER_NOT_FOUND_OR_DUPLICATED");
  const p=matches[0];
  if(p.enabled!==true||p.role!==role)throw Error("PRINT_PRINTER_ROLE_UNAVAILABLE");
  if(role==="platform-admin"){
    if(p.scope!=="platform")throw Error("PRINT_PRINTER_SCOPE_FORBIDDEN");
  }else if(p.tenantId!==tenantId||p.branchId!==branchId||p.scope!=="merchant"){
    throw Error("PRINT_PRINTER_SCOPE_FORBIDDEN");
  }
  return p;
}
export function planCategoryPrintJobs({
  tenantId,branchId,orderId,eventId,items,catalogItems,
  categoryAssignments,printers
}){
  requireMerchantScope(tenantId,branchId);
  if(!id(orderId)||!id(eventId)||!Array.isArray(items)||items.length<1||items.length>200||
     !Array.isArray(catalogItems)||!Array.isArray(categoryAssignments))
    throw Error("PRINT_INVALID_ORDER_EVENT");
  const seenLineIds=new Set(),groups=new Map();
  for(const line of items){
    if(!id(line?.lineId)||!id(line?.itemId)||!Number.isSafeInteger(line.quantity)||
       line.quantity<1||line.quantity>1000||seenLineIds.has(line.lineId))
      throw Error("PRINT_INVALID_ORDER_LINE");
    seenLineIds.add(line.lineId);
    // Catalog is trusted server/native inventory data, NEVER a client label.
    const match=catalogItems.filter(item=>item?.id===line.itemId);
    if(match.length!==1)throw Error("PRINT_ITEM_NOT_FOUND_OR_DUPLICATED");
    const item=match[0];
    if(item.tenantId!==tenantId||item.branchId!==branchId||
       !id(item.categoryId)||typeof item.name!=="string"||!item.name.trim())
      throw Error("PRINT_CATALOG_SCOPE_FORBIDDEN");
    const bindings=categoryAssignments.filter(binding=>
      binding?.categoryId===item.categoryId&&binding?.tenantId===tenantId&&binding?.branchId===branchId);
    if(bindings.length!==1||!id(bindings[0]?.printerId))
      throw Error("PRINT_CATEGORY_PRINTER_MISSING_OR_DUPLICATED");
    const printer=printerById(printers,bindings[0].printerId,"section",tenantId,branchId);
    if(!groups.has(printer.id))groups.set(printer.id,[]);
    groups.get(printer.id).push({
      lineId:line.lineId,itemId:item.id,categoryId:item.categoryId,
      name:item.name,quantity:line.quantity
    });
  }
  const jobs=[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([printerId,lines])=>{
    const ordered=lines.sort((a,b)=>a.lineId.localeCompare(b.lineId));
    return Object.freeze({
      kind:"merchant-section",tenantId,branchId,orderId,eventId,printerId,
      jobId:stamp(["section-v1",tenantId,branchId,orderId,eventId,printerId]),
      lines:ordered
    });
  });
  return Object.freeze({jobs,unassigned:0});
}
export function planCustomerReceipt({
  tenantId,branchId,orderId,receiptId,printerId,printers,footerText
}){
  requireMerchantScope(tenantId,branchId);
  if(![orderId,receiptId,printerId].every(id))throw Error("PRINT_INVALID_RECEIPT");
  printerById(printers,printerId,"customer",tenantId,branchId);
  return Object.freeze({
    kind:"merchant-customer-receipt",tenantId,branchId,orderId,receiptId,printerId,
    jobId:stamp(["customer-v1",tenantId,branchId,orderId,receiptId,printerId]),
    footerText:safeFooter(footerText)
  });
}
export function planPlatformSubscriptionInvoice({
  invoiceId,printerId,printers,footerText
}){
  if(!id(invoiceId)||!id(printerId))throw Error("PRINT_INVALID_ADMIN_INVOICE");
  printerById(printers,printerId,"platform-admin");
  return Object.freeze({
    kind:"platform-subscription-invoice",invoiceId,printerId,
    jobId:stamp(["platform-invoice-v1",invoiceId,printerId]),
    footerText:safeFooter(footerText)
  });
}

// W16: synthetic coordinator tying trusted W14 category routing to W15
// disposable SQLite print outbox. NO physical print driver is connected.
// This does not import POS databases, production credentials or network IO.
import {planCategoryPrintJobs,planCustomerReceipt,planPlatformSubscriptionInvoice} from './foon-category-print-policy.mjs';
export function queueTrustedPrintEvent(queue,orderInput){
  if(!queue||typeof queue.enqueue!=='function'||!orderInput||typeof orderInput!=='object')
    throw Error('W16_INVALID_QUEUE_OR_INPUT');
  const kind=orderInput.kind;
  let jobs;
  if(kind==='merchant-order'){
    jobs=planCategoryPrintJobs(orderInput).jobs;
  }else if(kind==='merchant-customer-receipt'){
    jobs=[planCustomerReceipt(orderInput)];
  }else if(kind==='platform-subscription-invoice'){
    jobs=[planPlatformSubscriptionInvoice(orderInput)];
  }else throw Error('W16_UNSUPPORTED_PRINT_EVENT');
  return queue.enqueue(jobs);
}
// Fake device callback must explicitly indicate spool output confirmed.
// An error after dispatch is ambiguous; the queue preserves it for review.
// Do NOT wire to a real printer or production service without role/driver checks.
export async function processOneSyntheticPrinterJob({queue,printerId,workerId,simulateDriver}){
  if(!queue||typeof queue.claim!=='function'||typeof simulateDriver!=='function')
    throw Error('W16_INVALID_SYNTHETIC_DRIVER');
  const job=queue.claim({printerId,workerId});
  if(!job)return {state:'empty'};
  queue.beginDispatch({jobId:job.jobId,token:job.token});
  try{
    const confirmed=await simulateDriver({jobId:job.jobId,printerId,kind:job.payload.kind});
    if(confirmed!==true){
      queue.markUnknown({jobId:job.jobId,token:job.token});
      return {state:'unknown',jobId:job.jobId};
    }
    queue.markPrinted({jobId:job.jobId,token:job.token});
    return {state:'printed',jobId:job.jobId};
  }catch{
    queue.markUnknown({jobId:job.jobId,token:job.token});
    return {state:'unknown',jobId:job.jobId};
  }
}

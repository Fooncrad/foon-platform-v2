// W15: disposable-sandbox SQLite print-job outbox for test-only integration.
// Never uses W05/W06 saved SQLite or opens a real printer. Physical printing
// cannot be exactly-once after a crash: interrupted dispatch goes to 'unknown'
// and requires explicit human review; never automatically reprint it.
import {DatabaseSync} from 'node:sqlite';
import {createHash, randomUUID} from 'node:crypto';
import {existsSync,lstatSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,isAbsolute,resolve,sep} from 'node:path';

const id = value=>typeof value==='string'&&value.length>=1&&value.length<=128&&!/[\x00-\x1f\x7f]/.test(value);
const digest = value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function expectedSandbox(path){
  if(typeof path!=='string'||!isAbsolute(path)||basename(path)!=='print-jobs.sqlite')throw Error('W15_TEMP_DB_PATH_REQUIRED');
  const directory=dirname(path);
  if(!existsSync(directory)||lstatSync(directory).isSymbolicLink())throw Error('W15_TEMP_DIR_NOT_TRUSTED');
  const root=realpathSync(tmpdir());
  const actual=realpathSync(directory);
  if(dirname(actual)!==root||!basename(actual).startsWith('foon-w15-print-'))throw Error('W15_TEMP_DB_PATH_FORBIDDEN');
  if(existsSync(path)&&(!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink()))throw Error('W15_DB_NOT_REGULAR_FILE');
  return resolve(path);
}
function assertJob(job){
  if(!job||typeof job!=='object'||Array.isArray(job)||!/^[a-f0-9]{64}$/.test(job.jobId??'')||
     !id(job.printerId)||!['merchant-section','merchant-customer-receipt','platform-subscription-invoice'].includes(job.kind))
    throw Error('W15_INVALID_PRINT_JOB');
  if(job.kind==='platform-subscription-invoice'){
    if(!id(job.invoiceId)||job.tenantId!==undefined||job.branchId!==undefined)throw Error('W15_INVALID_ADMIN_SCOPE');
  }else{
    if(![job.tenantId,job.branchId,job.orderId].every(id))throw Error('W15_INVALID_MERCHANT_SCOPE');
    if(job.kind==='merchant-section'&&(!id(job.eventId)||!Array.isArray(job.lines)||!job.lines.length))
      throw Error('W15_INVALID_PRINT_LINES');
    if(job.kind==='merchant-customer-receipt'&&!id(job.receiptId))throw Error('W15_INVALID_CUSTOMER_RECEIPT');
  }
  const json=JSON.stringify(job);
  if(json.length>20000)throw Error('W15_PRINT_JOB_TOO_LARGE');
  return {json,hash:digest(job)};
}
const validMs=ms=>Number.isSafeInteger(ms)&&ms>=0;
export function openW15TemporaryPrintOutbox({dbPath}={}){
  const path=expectedSandbox(dbPath);
  const database=new DatabaseSync(path);
  database.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=2500;');
  database.exec(`CREATE TABLE IF NOT EXISTS w15_print_jobs (
    job_id TEXT PRIMARY KEY NOT NULL,
    printer_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    payload_digest TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('pending','leased','dispatching','unknown','printed')),
    claim_token TEXT,
    lease_expiry INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_seq INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS w15_pending_by_printer ON w15_print_jobs(printer_id,state,created_seq);
  CREATE TABLE IF NOT EXISTS w15_print_reviews (
    review_id TEXT PRIMARY KEY NOT NULL,
    job_id TEXT NOT NULL,
    operator_id TEXT NOT NULL,
    decision TEXT NOT NULL CHECK(decision IN ('confirm-printed','confirmed-not-printed')),
    reviewed_at INTEGER NOT NULL,
    FOREIGN KEY(job_id) REFERENCES w15_print_jobs(job_id)
  );`);
  database.exec('PRAGMA foreign_keys=ON;');
  const statements={
    get:database.prepare('SELECT * FROM w15_print_jobs WHERE job_id=?'),
    pending:database.prepare("SELECT job_id FROM w15_print_jobs WHERE printer_id=? AND state='pending' ORDER BY created_seq, job_id LIMIT 1"),
    insert:database.prepare("INSERT INTO w15_print_jobs(job_id,printer_id,kind,payload_json,payload_digest,state,created_seq,created_at,updated_at) VALUES (?,?,?,?,?,'pending',?,?,?)"),
    maxSeq:database.prepare('SELECT COALESCE(MAX(created_seq),0) AS value FROM w15_print_jobs'),
    lease:database.prepare("UPDATE w15_print_jobs SET state='leased', claim_token=?, lease_expiry=?, attempts=attempts+1, updated_at=? WHERE job_id=? AND state='pending'"),
    begin:database.prepare("UPDATE w15_print_jobs SET state='dispatching',lease_expiry=NULL,updated_at=? WHERE job_id=? AND state='leased' AND claim_token=?"),
    printed:database.prepare("UPDATE w15_print_jobs SET state='printed',claim_token=NULL,lease_expiry=NULL,updated_at=? WHERE job_id=? AND state='dispatching' AND claim_token=?"),
    unknown:database.prepare("UPDATE w15_print_jobs SET state='unknown',claim_token=NULL,lease_expiry=NULL,updated_at=? WHERE job_id=? AND state='dispatching' AND claim_token=?"),
    release:database.prepare("UPDATE w15_print_jobs SET state='pending',claim_token=NULL,lease_expiry=NULL,updated_at=? WHERE job_id=? AND state='leased' AND claim_token=?"),
    stale:database.prepare("UPDATE w15_print_jobs SET state='pending',claim_token=NULL,lease_expiry=NULL,updated_at=? WHERE state='leased' AND lease_expiry<=?"),
    crash:database.prepare("UPDATE w15_print_jobs SET state='unknown',claim_token=NULL,lease_expiry=NULL,updated_at=? WHERE state='dispatching'"),
    review:database.prepare('INSERT INTO w15_print_reviews(review_id,job_id,operator_id,decision,reviewed_at) VALUES (?,?,?,?,?)'),
    decide:database.prepare("UPDATE w15_print_jobs SET state=?,claim_token=NULL,lease_expiry=NULL,updated_at=? WHERE job_id=? AND state='unknown'"),
    status:database.prepare('SELECT state,COUNT(*) AS total FROM w15_print_jobs GROUP BY state ORDER BY state'),
    list:database.prepare('SELECT job_id,printer_id,kind,state,attempts FROM w15_print_jobs ORDER BY created_seq'),
    countReview:database.prepare('SELECT COUNT(*) AS total FROM w15_print_reviews'),
  };
  let closed=false;
  const now=()=>Date.now();
  function check(){if(closed)throw Error('W15_QUEUE_CLOSED');}
  function transaction(fn){
    check(); database.exec('BEGIN IMMEDIATE');
    try{const value=fn();database.exec('COMMIT');return value;}
    catch(error){database.exec('ROLLBACK');throw error;}
  }
  function recover(ms=now()){
    if(!validMs(ms))throw Error('W15_INVALID_TIME');
    return transaction(()=>{
      const a=statements.crash.run(ms).changes;
      const b=statements.stale.run(ms,ms).changes;
      return {unknown:a,released:b};
    });
  }
  // Crash-safe behavior: any 'dispatching' row in an existing SQLite DB is
  // ambiguous; it may already have printed before a process crash.
  recover();
  return Object.freeze({
    enqueue(jobs,ms=now()){
      if(!Array.isArray(jobs)||!jobs.length||jobs.length>200||!validMs(ms))throw Error('W15_INVALID_ENQUEUE');
      const prepared=jobs.map(job=>({job, ...assertJob(job)}));
      if(new Set(prepared.map(x=>x.job.jobId)).size!==prepared.length)throw Error('W15_DUPLICATE_BATCH_JOB');
      return transaction(()=>{
        let inserted=0,duplicates=0,seq=Number(statements.maxSeq.get().value);
        for(const item of prepared){
          const original=statements.get.get(item.job.jobId);
          if(original){
            if(original.payload_digest!==item.hash||original.printer_id!==item.job.printerId||original.kind!==item.job.kind)
              throw Error('W15_IDEMPOTENCY_CONFLICT');
            duplicates++;continue;
          }
          statements.insert.run(item.job.jobId,item.job.printerId,item.job.kind,item.json,item.hash,++seq,ms,ms);
          inserted++;
        }
        return {inserted,duplicates};
      });
    },
    claim({printerId,workerId,leaseMs=60000,ms=now()}){
      if(!id(printerId)||!id(workerId)||!validMs(ms)||!Number.isSafeInteger(leaseMs)||leaseMs<1000||leaseMs>300000)
        throw Error('W15_INVALID_CLAIM');
      return transaction(()=>{
        statements.stale.run(ms,ms);
        const next=statements.pending.get(printerId);
        if(!next)return null;
        const token=randomUUID();
        if(statements.lease.run(token,ms+leaseMs,ms,next.job_id).changes!==1)throw Error('W15_CLAIM_RACE');
        // Only a trusted native driver should receive the job body.
        const row=statements.get.get(next.job_id);
        return {jobId:row.job_id,printerId:row.printer_id,token,payload:JSON.parse(row.payload_json)};
      });
    },
    beginDispatch({jobId,token,ms=now()}){
      if(!id(jobId)||!id(token)||!validMs(ms))throw Error('W15_INVALID_DISPATCH');
      return transaction(()=>{
        const changed=statements.begin.run(ms,jobId,token).changes;
        if(changed!==1)throw Error('W15_CLAIM_NOT_ACTIVE');
        return true;
      });
    },
    markPrinted({jobId,token,ms=now()}){
      if(!id(jobId)||!id(token)||!validMs(ms))throw Error('W15_INVALID_CONFIRMATION');
      return transaction(()=>{
        if(statements.printed.run(ms,jobId,token).changes!==1)throw Error('W15_DISPATCH_NOT_ACTIVE');
        return true;
      });
    },
    markUnknown({jobId,token,ms=now()}){
      if(!id(jobId)||!id(token)||!validMs(ms))throw Error('W15_INVALID_UNCERTAINTY');
      return transaction(()=>{
        if(statements.unknown.run(ms,jobId,token).changes!==1)throw Error('W15_DISPATCH_NOT_ACTIVE');
        return true;
      });
    },
    releaseBeforeDispatch({jobId,token,ms=now()}){
      if(!id(jobId)||!id(token)||!validMs(ms))throw Error('W15_INVALID_RELEASE');
      return transaction(()=>{
        if(statements.release.run(ms,jobId,token).changes!==1)throw Error('W15_CLAIM_NOT_ACTIVE');
        return true;
      });
    },
    manualReview({jobId,operatorId,decision,ms=now()}){
      if(!id(jobId)||!id(operatorId)||!validMs(ms)||!['confirm-printed','confirmed-not-printed'].includes(decision))
        throw Error('W15_INVALID_REVIEW');
      return transaction(()=>{
        const state=decision==='confirm-printed'?'printed':'pending';
        if(statements.decide.run(state,ms,jobId).changes!==1)throw Error('W15_REVIEW_NOT_UNKNOWN');
        statements.review.run(randomUUID(),jobId,operatorId,decision,ms);
        return {jobId,state};
      });
    },
    recover,
    summary(){check();return {
      states:statements.status.all().map(x=>({state:x.state,total:Number(x.total)})),
      reviews:Number(statements.countReview.get().total)
    };},
    // Test-only metadata excludes payload content; no customer/merchant data in output.
    listMetadata(){check();return statements.list.all();},
    close(){if(!closed){closed=true;database.close();}}
  });
}

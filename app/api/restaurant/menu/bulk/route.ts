import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {parseImportCsv} from '@/lib/catalog/import-csv';
import {POST as importBatch} from '@/app/api/restaurant/catalog-import/route';
export const runtime='nodejs';
// Compatibility path; all writes use the same authorization, image processing and quota checks.
export async function POST(request:Request){
 const b=await request.json().catch(()=>null);if(!b||!['categories','items'].includes(b.kind)||typeof b.csv!=='string')return NextResponse.json({ok:false,code:'INVALID_INPUT'},{status:400});
 try{const rows=parseImportCsv(b.csv,b.kind),key=createHash('sha256').update(b.kind+'\n'+b.csv).digest('hex');let created=0;
 for(let index=0;index<rows.length;index+=5){const headers=new Headers(request.headers);headers.set('content-type','application/json');headers.delete('content-length');const result=await importBatch(new Request(new URL('/api/restaurant/catalog-import',request.url),{method:'POST',headers,body:JSON.stringify({kind:b.kind,requestKey:key+'-'+index,rows:rows.slice(index,index+5)})}));const data=await result.json();if(!result.ok)return NextResponse.json({...data,created,firstPendingRow:index+2},{status:result.status});created+=data.created;}return NextResponse.json({ok:true,created},{status:201});
 }catch(e){return NextResponse.json({ok:false,code:e instanceof Error?e.message:'INVALID_CSV'},{status:400});}
}

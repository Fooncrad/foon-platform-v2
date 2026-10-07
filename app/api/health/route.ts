import { NextResponse } from "next/server";
import { databaseHealth } from "@/lib/db/mysql";

export const runtime="nodejs";
export async function GET(){
  try { const db=await databaseHealth(); return NextResponse.json({ok:true,service:"foon-platform-v2",runtime:process.version,db}); }
  catch { return NextResponse.json({ok:false,service:"foon-platform-v2",code:"DATABASE_UNAVAILABLE"},{status:503}); }
}

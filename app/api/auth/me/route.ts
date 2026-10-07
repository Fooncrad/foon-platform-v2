import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { database } from "@/lib/db/mysql";
import { currentUserId } from "@/lib/auth/session";
export async function GET(){
  const id=await currentUserId(); if(!id)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
  const [rows]=await database().execute<RowDataPacket[]>("SELECT id,email,display_name,status FROM users WHERE id=? LIMIT 1",[id]);
  return NextResponse.json({ok:true,user:rows[0]});
}

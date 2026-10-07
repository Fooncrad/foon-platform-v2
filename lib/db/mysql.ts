import mysql from "mysql2/promise";

let pool: mysql.Pool | undefined;

export function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_MISSING");
  pool ??= mysql.createPool({ uri: url, connectionLimit: 10, enableKeepAlive: true, decimalNumbers: true });
  return pool;
}

export async function databaseHealth() {
  const [rows] = await database().query("SELECT 1 AS ok");
  return Array.isArray(rows);
}

import mysql from "mysql2/promise";

let pool: mysql.Pool | undefined;

export function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_MISSING");
  if (!pool) {
    pool = mysql.createPool({ uri: url, connectionLimit: 10, enableKeepAlive: true, decimalNumbers: true, timezone: "Z" });
    // Every pooled session must use the same clock, including registration.
    // Queue this before the first query so a reused session cannot change semantics.
    pool.pool.on("connection", connection => {
      connection.query("SET time_zone='+00:00'", error => {
        if (error) connection.destroy();
      });
    });
  }
  return pool;
}

export async function databaseHealth() {
  const [rows] = await database().query("SELECT 1 AS ok");
  return Array.isArray(rows);
}

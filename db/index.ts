import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { Pool as PgPool } from "pg";
import * as schema from "../shared/schema";
import ws from "ws";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const useNeon = process.env.DB_DRIVER === "neon" || /neon/i.test(connectionString);
const poolMax = Math.max(4, Number(process.env.DB_POOL_MAX || 10));
const idleTimeoutMillis = Math.max(10000, Number(process.env.DB_IDLE_TIMEOUT_MS || 30000));
const connectionTimeoutMillis = Math.max(10000, Number(process.env.DB_CONNECTION_TIMEOUT_MS || 15000));

const attachPoolErrorHandler = (
  pool: { on: (...args: any[]) => any },
  label: string,
) => {
  pool.on("error", (error: any) => {
    console.error(`[DB] ${label} pool connection error:`, error?.message || error);
  });
};

const db = (() => {
  if (useNeon) {
    // Configure WebSocket for Neon serverless in Node.js environment
    neonConfig.webSocketConstructor = ws;
    const pool = new NeonPool({ 
      connectionString,
      max: poolMax, // Maximum number of connections in the pool
      idleTimeoutMillis, // How long a connection can be idle before being closed
      connectionTimeoutMillis, // How long to wait when connecting a new client
    });
    attachPoolErrorHandler(pool, "Neon");
    return drizzleNeon(pool, { schema });
  }

  const useSsl =
    !/localhost|127\.0\.0\.1/.test(connectionString) &&
    !/sslmode=disable/i.test(connectionString);
  const pool = new PgPool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    max: poolMax, // Maximum number of connections in the pool
    idleTimeoutMillis, // How long a connection can be idle before being closed
    connectionTimeoutMillis, // How long to wait when connecting a new client
  });
  attachPoolErrorHandler(pool, "Postgres");
  return drizzlePg(pool, { schema });
})();

export { db };

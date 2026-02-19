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

const db = (() => {
  if (useNeon) {
    // Configure WebSocket for Neon serverless in Node.js environment
    neonConfig.webSocketConstructor = ws;
    const pool = new NeonPool({ connectionString });
    return drizzleNeon(pool, { schema });
  }

  const useSsl =
    !/localhost|127\.0\.0\.1/.test(connectionString) &&
    !/sslmode=disable/i.test(connectionString);
  const pool = new PgPool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });
  return drizzlePg(pool, { schema });
})();

export { db };

import "server-only";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

type Holder = { db?: Promise<DB>; close?: () => Promise<void> };
const g = globalThis as unknown as { __founderdesk_db?: Holder };
const holder: Holder = (g.__founderdesk_db ??= {});

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function connect(): Promise<DB> {
  const e = env();
  if (e.DATABASE_URL) {
    // Neon serverless driver over HTTP: one round trip per statement, no pool
    // to exhaust on serverless. Every state transition in this app is a single
    // atomic statement (conditional UPDATE … RETURNING / INSERT … ON CONFLICT),
    // so interactive transactions are not required.
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle(neon(e.DATABASE_URL), { schema }) as unknown as DB;
  }
  if (e.NODE_ENV === "production" && !e.PGLITE_DIR) {
    // Serverless filesystems are read-only and not shared between functions,
    // so the embedded database is for local development and tests only.
    throw new Error("DATABASE_URL is not set. Production needs Neon (or any Postgres): set DATABASE_URL and run `pnpm db:migrate`.");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = e.NODE_ENV === "test" ? undefined : (e.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite"));
  if (dataDir) (await import("node:fs")).mkdirSync(path.dirname(dataDir), { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  holder.close = () => client.close();
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  holder.db ??= connect().catch((err) => {
    holder.db = undefined;
    throw err;
  });
  return holder.db;
}

/** Tests: start every file from a fresh in-memory database. */
export async function resetDbForTests() {
  if (holder.close) await holder.close();
  holder.db = undefined;
  holder.close = undefined;
}

export { schema };

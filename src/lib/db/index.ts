import "server-only";
import type Database from "better-sqlite3";
import { DB_PATH } from "@/lib/env";
import { openDb } from "./open";

// One connection per process, surviving dev-server HMR reloads.
declare global {
  var __axonDb: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (!globalThis.__axonDb) {
    globalThis.__axonDb = openDb(DB_PATH);
  }
  return globalThis.__axonDb;
}

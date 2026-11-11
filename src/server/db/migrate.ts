import type pg from "pg";
import { MIGRATIONS } from "./schema.js";

const MIGRATION_LOCK = 51190731;

async function migrateEshop(pool: pg.Pool): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK]);
    await client.query("create table if not exists eshop_schema_migrations (id text primary key, applied_at timestamptz not null default now())");
    const done = new Set((await client.query<{id:string}>("select id from eshop_schema_migrations")).rows.map((row) => row.id));
    for (const migration of MIGRATIONS) {
      if (done.has(migration.id)) continue;
      await client.query("begin");
      try {
        for (const statement of migration.statements) await client.query(statement);
        await client.query("insert into eshop_schema_migrations (id) values ($1)", [migration.id]);
        await client.query("commit");
        applied.push(migration.id);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK]).catch (() => undefined);
    client.release();
  }
  return applied;
}

export { migrateEshop };

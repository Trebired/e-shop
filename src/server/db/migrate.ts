import type { StoreSql } from "@trebired/store";
import { MIGRATIONS } from "./schema.js";

async function migrateEshop(sql: StoreSql): Promise<string[]> {
  const applied = await sql.migrate({
      id: "eshop",
      legacyTable: "eshop_schema_migrations",
      steps: MIGRATIONS.map((migration) => ({ id: migration.id, up: migration.statements })),
  });
  return applied.map((key) => key.slice(key.indexOf(":") + 1));
}

export { migrateEshop };

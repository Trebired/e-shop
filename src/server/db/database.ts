import pg from "pg";

type QueryParams = readonly unknown[];

type Db = {
  exec: (sql: string, params?: QueryParams) => Promise<number>;
  many: <T = Record < string, any >> (sql: string, params?: QueryParams) => Promise<T[]>;
  one: <T = Record < string, any >> (sql: string, params?: QueryParams) => Promise<T|null>;
  tx: <T > (work: (db: Db) => Promise<T>) => Promise<T>;
};

type Queryable = Pick<pg.Pool, "query">|pg.PoolClient;

const INT8_OID = 20;
const NUMERIC_OID = 1700;
const NUMBER_TYPES = new Set([INT8_OID, NUMERIC_OID]);
const TYPES = {
  getTypeParser: ((oid: number, format?: "binary" | "text") =>
    NUMBER_TYPES.has(oid) ? (value: string) => Number(value) : pg.types.getTypeParser(oid, format as any)) as typeof pg.types.getTypeParser,
};

function queryDb(target: Queryable, tx: Db["tx"]): Db {
  const run = async(sql: string, params: QueryParams = []) => await target.query({ text: sql, types: TYPES, values: [...params] });
  return {
    exec: async(sql, params) => (await run(sql, params)).rowCount ?? 0,
    many: async(sql, params) => (await run(sql, params)).rows as any[],
    one: async(sql, params) => ((await run(sql, params)).rows[0] as any) ?? null,
    tx,
  };
}

function clientDb(client: pg.PoolClient): Db {
  const nested: Db = queryDb(client, async(work) => await work(nested));
  return nested;
}

function createDb(pool: pg.Pool): Db {
  return queryDb(pool, async(work) => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const value = await work(clientDb(client));
        await client.query("commit");
        return value;
      } catch (error) {
        await client.query("rollback").catch (() => undefined);
        throw error;
      } finally {
        client.release();
      }
  });
}

export { createDb };
export type { Db };

import type { SqlSession, StoreSql } from "@trebired/store";

type QueryParams = readonly unknown[];

type Db = {
  exec: (sql: string, params?: QueryParams) => Promise<number>;
  many: <T = Record < string, any >> (sql: string, params?: QueryParams) => Promise<T[]>;
  one: <T = Record < string, any >> (sql: string, params?: QueryParams) => Promise<T|null>;
  tx: <T > (work: (db: Db) => Promise<T>) => Promise<T>;
};

function sessionDb(session: SqlSession, tx: Db["tx"]): Db {
  return {
    exec: async(sql, params) => await session.exec(sql, params),
    many: async(sql, params) => await session.many(sql, params) as any[],
    one: async(sql, params) => await session.one(sql, params) as any,
    tx,
  };
}

function transactionDb(session: SqlSession): Db {
  const nested: Db = sessionDb(session, async(work) => await work(nested));
  return nested;
}

function eshopSql(sql: StoreSql): StoreSql {
  return sql.with({ int8: "number", numeric: "number" });
}

function createDb(sql: StoreSql): Db {
  const typed = eshopSql(sql);
  return sessionDb(typed, async(work) => await typed.transaction(async(session) => await work(transactionDb(session))));
}

export { createDb, eshopSql };
export type { Db };

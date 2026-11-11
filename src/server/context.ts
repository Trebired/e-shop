import type pg from "pg";
import type { NormalizedEshopConfig } from "./../config/types.js";
import type { Db } from "./db/database.js";
import type { Mailer } from "./mail.js";

type EshopContext = {
  adminToken: string;
  config: NormalizedEshopConfig;
  db: Db;
  eventsUrl: string;
  mailer: Mailer;
  pool: pg.Pool;
  publicUrl: string;
};

export type { EshopContext };

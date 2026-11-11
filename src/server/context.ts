import type pg from "pg";
import type { NormalizedEshopConfig } from "./../config/types.js";
import type { Db } from "./db/database.js";
import type { Gateways } from "./gateways/index.js";
import type { Mailer } from "./mail.js";

type EshopContext = {
  adminToken: string;
  config: NormalizedEshopConfig;
  db: Db;
  eventsUrl: string;
  gateways: Gateways;
  mailer: Mailer;
  pool: pg.Pool;
  publicUrl: string;
};

export type { EshopContext };

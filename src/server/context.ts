import type pg from "pg";
import type { NormalizedEshopConfig } from "./../config/types.js";
import type { Db } from "./db/database.js";
import type { Gateways } from "./gateways/index.js";
import type { Mailer } from "./mail.js";
import type { PacketaClient } from "./packeta.js";

type EshopContext = {
  adminToken: string;
  config: NormalizedEshopConfig;
  db: Db;
  eventsUrl: string;
  gateways: Gateways;
  mailer: Mailer;
  packeta: PacketaClient | null;
  pool: pg.Pool;
  publicUrl: string;
};

export type { EshopContext };

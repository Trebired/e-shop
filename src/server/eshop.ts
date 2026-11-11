import type pg from "pg";
import { normalizeConfig } from "./../config/normalize.js";
import type { EshopConfig, NormalizedEshopConfig } from "./../config/types.js";
import { adminRouter } from "./admin.js";
import { pruneCarts } from "./cart.js";
import type { EshopContext } from "./context.js";
import { createDb } from "./db/database.js";
import { migrateEshop } from "./db/migrate.js";
import { createGateways } from "./gateways/index.js";
import type { GatewaySecrets } from "./gateways/types.js";
import { dispatch } from "./http.js";
import { createMailer } from "./mail.js";
import { storefrontRouter } from "./storefront.js";

type CreateEshopOptions = {
  adminToken: string;
  config: EshopConfig | NormalizedEshopConfig;
  eventsUrl?: string;
  gateways?: GatewaySecrets;
  pool: pg.Pool;
  publicUrl?: string;
  smtpUrl?: string;
};

const MIN_TOKEN_LENGTH = 32;

function isNormalized(config: EshopConfig | NormalizedEshopConfig): config is NormalizedEshopConfig {
  return typeof(config as NormalizedEshopConfig).basePath === "string" && Array.isArray((config as NormalizedEshopConfig).shipping);
}

function createEshop(options: CreateEshopOptions) {
  if (String(options.adminToken || "").length < MIN_TOKEN_LENGTH) throw new Error("e-shop admin token must be at least 32 characters");
  const config = isNormalized(options.config) ? options.config : normalizeConfig(options.config, { requireForVersion: false });
  const db = createDb(options.pool);
  const context: EshopContext = {
    adminToken: options.adminToken,
    config,
    db,
    eventsUrl: options.eventsUrl ?? "",
    gateways: createGateways(config, options.gateways),
    mailer: createMailer(options.smtpUrl ?? "", config.mail.from),
    pool: options.pool,
    publicUrl: options.publicUrl ?? "",
  };
  const routers = [adminRouter(context), storefrontRouter(context)];
  const handle = async(req: any, res: any, next?: () => void) => {
    for (const router of routers) if (await dispatch(router, req, res)) return;
    if (next) next();
    else {
      res.statusCode = 404;
      res.end();
    }
  };
  return {
    config,
    context,
    db,
    handle,
    migrate: async() => await migrateEshop(options.pool),
    pruneCarts: async() => await pruneCarts(db, config.cart.ttlDays),
  };
}

type Eshop = ReturnType<typeof createEshop>;

export { createEshop };
export type { CreateEshopOptions, Eshop };

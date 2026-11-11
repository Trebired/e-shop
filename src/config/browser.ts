import type { LoadedEshopConfig } from "./types.js";

import { CONFIG_PATH } from "./paths.js";

function serverOnly(): never {
  throw new Error("e-shop-config-server-only :: loadConfig and findConfig read files and run on the server");
}

async function loadConfig(_projectRoot?: string): Promise<LoadedEshopConfig> {
  return serverOnly();
}

function findConfig(_startDir: string): string | null {
  return serverOnly();
}

export { CONFIG_PATH, findConfig, loadConfig };
export { defineConfig, normalizeConfig } from "./normalize.js";
export type { BankTransferConfig, EshopConfig, LoadedEshopConfig, NormalizedEshopConfig, ShippingMethodConfig } from "./types.js";

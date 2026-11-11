import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeConfig } from "./normalize.js";
import type { EshopConfig, LoadedEshopConfig } from "./types.js";

const CONFIG_PATH = ".trebired/e-shop/config.ts";

function findConfig(startDir: string): string | null {
  let current = path.resolve(startDir);
  for (;; ) {
    const candidate = path.join(current, CONFIG_PATH);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function loadConfig(projectRoot = process.cwd()): Promise<LoadedEshopConfig> {
  const configPath = findConfig(projectRoot);
  if (!configPath) throw new Error(`e-shop config was not found: ${CONFIG_PATH}`);
  const module = await import(pathToFileURL(configPath).href);
  const config = (module.default ??module) as EshopConfig;
  return { config: normalizeConfig(config, { configPath, requireForVersion: true }), configPath };
}

export { CONFIG_PATH, findConfig, loadConfig };

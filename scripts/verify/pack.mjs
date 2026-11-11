import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveLogger } from "@package/logger-adapter";

const log = resolveLogger({ source: "@trebired/e-shop" });
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const versionSource = fs.readFileSync(path.join(rootDir, "src", "version.ts"), "utf8");

assert.match(
  versionSource,
  new RegExp(`PACKAGE_VERSION = "${packageJson.version.replace(/\./gu, "\\.")}"`, "u"),
  "src/version.ts matches package.json"
);
assert.deepEqual(Object.keys(packageJson.exports).sort(), [".", "./client", "./config", "./react", "./server"], "the public subpaths are fixed");
for (const [key, entry] of Object.entries(packageJson.exports)) {
  assert.ok(fs.existsSync(path.join(rootDir, entry.import)), `${key} is built`);
  assert.ok(fs.existsSync(path.join(rootDir, entry.types)), `${key} has types`);
}
for (const subpath of ["", "client", "config", "server"]) await import(pathToFileURL(path.join(rootDir, "dist", subpath, "index.js")).href);

const listing = execFileSync("bun", ["pm", "pack", "--dry-run"], { cwd: rootDir, encoding: "utf8" });

const PACKED = [
  "dist/index.js",
  "dist/server/index.js",
  "dist/react/index.js",
  "assets/fonts/NotoSans-Regular.ttf",
  "assets/fonts/NotoSans-Bold.ttf",
  "assets/fonts/OFL.txt",
  "LICENSE",
  "README.md",
  "CHANGELOG.md",
];

for (const file of PACKED) {
  assert.ok(listing.includes(file), `${file} is packed`);
}
assert.ok(!listing.includes("src/"), "sources are not packed");
log.info("verify.pack", "e-shop pack verification passed");

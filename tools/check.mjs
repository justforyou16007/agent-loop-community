#!/usr/bin/env node
/**
 * Check every loop and role of this library as a project of each side would
 * have it, with agent-loop-studio's checker: built in a checkout given with
 * --studio (default ./agent-loop-studio). The library has no project package,
 * so its loops may declare only the framework's hook actions.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const at = process.argv.indexOf("--studio");
const studio = path.resolve(at > 0 ? process.argv[at + 1] : path.join(root, "agent-loop-studio"));
const checker = path.join(studio, "dist", "tools", "library-cli.js");
if (!fs.existsSync(checker))
  throw new Error(`Build agent-loop-studio first (npm ci && npm run build in ${studio}): ${checker} is missing.`);
const { checkLibrary } = await import(pathToFileURL(checker).href);
const { ok, reports } = await checkLibrary(path.join(root, "library"));
console.log(JSON.stringify(reports, null, 2));
process.exitCode = ok ? 0 : 1;

#!/usr/bin/env node
/**
 * Check every loop and role of this library as a project of each side would
 * have it, with agent-loop-studio's checker: built in a checkout given with
 * --studio (default ./agent-loop-studio). A project receives the framework's
 * base loops and roles too, so they are laid under this library for the check;
 * a name here never repeats one of the framework's. The library has no project
 * package, so its loops may declare only the framework's hook actions.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const at = process.argv.indexOf("--studio");
const studio = path.resolve(at > 0 ? process.argv[at + 1] : path.join(root, "agent-loop-studio"));
const checker = path.join(studio, "dist", "tools", "library-cli.js");
if (!fs.existsSync(checker))
  throw new Error(`Build agent-loop-studio first (npm ci && npm run build in ${studio}): ${checker} is missing.`);
const { checkLibrary } = await import(pathToFileURL(checker).href);

const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => !file.startsWith(".")) : []);
const repeated = [];
for (const kind of ["loops", "roles"])
  for (const file of files(path.join(root, "library", kind, "framework")))
    if (fs.existsSync(path.join(studio, "library", kind, "framework", file)))
      repeated.push(`library/${kind}/framework/${file}: the framework already has one of this name`);

const merged = fs.mkdtempSync(path.join(os.tmpdir(), "community-check-"));
let result;
try {
  for (const library of [path.join(studio, "library"), path.join(root, "library")])
    fs.cpSync(library, merged, { recursive: true, filter: (file) => path.basename(file) !== ".gitkeep" });
  result = await checkLibrary(merged);
} finally {
  fs.rmSync(merged, { recursive: true, force: true });
}
console.log(JSON.stringify({ repeated, reports: result.reports }, null, 2));
process.exitCode = result.ok && !repeated.length ? 0 : 1;

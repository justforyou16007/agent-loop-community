#!/usr/bin/env node
/**
 * Check every loop and role of this library as a project of each side would
 * have it, with agent-loop-studio's checker: built in a checkout given with
 * --studio (default ./agent-loop-studio). A project receives the framework's
 * base loops and roles too, so they are laid under this library for the check; a
 * `framework` loop or role here of a framework one's name is a project's version
 * of it, which takes the framework's place, and is listed as such.
 *
 * A side's loops may use roles, loops and hook actions its projects' package
 * provides, which this library does not hold: such a loop was checked whole in
 * the project that contributed it, and is noted here rather than failed.
 * `framework` loops may use only the framework's.
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
const replacing = [];
for (const kind of ["loops", "roles"])
  for (const file of files(path.join(root, "library", kind, "framework")))
    if (fs.existsSync(path.join(studio, "library", kind, "framework", file)))
      replacing.push(`library/${kind}/framework/${file}: a project's version of the framework's, which takes its place`);

const merged = fs.mkdtempSync(path.join(os.tmpdir(), "community-check-"));
let result;
try {
  for (const library of [path.join(studio, "library"), path.join(root, "library")])
    fs.cpSync(library, merged, { recursive: true, filter: (file) => path.basename(file) !== ".gitkeep" });
  result = await checkLibrary(merged);
} finally {
  fs.rmSync(merged, { recursive: true, force: true });
}
// A side's loop that names what only its package provides is noted, not failed.
const PACKAGE_PROVIDED = /^unknown (role|loop|trigger) "/;
const notes = [];
let ok = true;
for (const [side, report] of Object.entries(result.reports)) {
  for (const loop of report.check) {
    if (loop.ok) continue;
    if (side !== "framework" && loop.defects.some((defect) => PACKAGE_PROVIDED.test(defect))) {
      notes.push({ side, loop: loop.loop, checked_whole_only_in_a_project_of_this_side: loop.defects });
      continue;
    }
    ok = false;
  }
  if (report.roles.some((role) => !role.ok)) ok = false;
}
console.log(JSON.stringify({ replacing, notes, reports: result.reports }, null, 2));
process.exitCode = ok ? 0 : 1;

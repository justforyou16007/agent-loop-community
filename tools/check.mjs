#!/usr/bin/env node
/**
 * Check every project published here by starting a project from it the way the
 * Studio does, with agent-loop-studio built in a checkout given with --studio
 * (default ./agent-loop-studio): the framework's installer sets up a new
 * project, the framework's own code gives it the published project's loops and
 * roles and makes its task loop, with its values, the new project's; then the
 * framework's loop and role checks run on that project. What a project started
 * from nothing already has wrong is the framework's, not the published one's,
 * and is left out.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const at = process.argv.indexOf("--studio");
const studio = path.resolve(at > 0 ? process.argv[at + 1] : path.join(root, "agent-loop-studio"));
const tool = (name) => path.join(studio, "dist", "tools", name);
const installer = path.join(studio, "distribution", "install-from-repo.mjs");
for (const needed of [tool("workspace.js"), tool("loop-check.js"), tool("loops.js"), installer])
  if (!fs.existsSync(needed))
    throw new Error(`Build agent-loop-studio first (npm ci && npm run build in ${studio}): ${needed} is missing.`);
const { applyExample } = await import(pathToFileURL(tool("workspace.js")).href);
const { checkLoop, checkRoles } = await import(pathToFileURL(tool("loop-check.js")).href);
const { listLoops } = await import(pathToFileURL(tool("loops.js")).href);

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "agent-loop-community-check-"));
/** A new project, installed as the Studio installs one. */
const install = (name) => {
  const project = path.join(workspace, name);
  try {
    execFileSync(process.execPath, [installer, "--role", "default", "--project", project], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (error) {
    throw new Error(`the framework's installer failed: ${String(error.stderr || error.message).trim()}`);
  }
  return project;
};
/** Every defect the framework's checks find in a project, one line each. */
const defectsOf = async (project) => {
  const lines = [];
  for (const loop of listLoops(project)) {
    const report = await checkLoop(project, loop);
    if (report.stale) lines.push(`loop ${loop}: its script is stale, regenerate it from its definition`);
    for (const defect of report.defects) lines.push(`loop ${loop}: ${defect}`);
  }
  for (const report of checkRoles(project))
    for (const defect of report.defects) lines.push(`role ${report.role}: ${defect}`);
  return lines;
};
const texts = (value) =>
  Boolean(value) && [value.zh, value.en].every((text) => typeof text === "string" && text.trim());
/** What a published project holds: its reference.json, its loops (definition and script) and its roles. */
const BELONGS = [/^reference\.json$/, /^loops\/[a-z0-9][a-z0-9-]*\.(md|js)$/, /^roles\/[a-z0-9][a-z0-9-]*\.md$/];
const filesIn = (dir, prefix = "") =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesIn(path.join(dir, entry.name), `${prefix}${entry.name}/`)
      : [`${prefix}${entry.name}`],
  );

const results = {};
let ok = true;
try {
  const baseline = new Set(await defectsOf(install("started-from-nothing")));
  const projectsDir = path.join(root, "projects");
  for (const name of fs.readdirSync(projectsDir).sort()) {
    const dir = path.join(projectsDir, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const problems = [];
    for (const file of filesIn(dir))
      if (!BELONGS.some((pattern) => pattern.test(file)))
        problems.push(`${file} does not belong in a published project: only reference.json, loops/ and roles/ do`);
    let reference = null;
    try {
      reference = JSON.parse(fs.readFileSync(path.join(dir, "reference.json"), "utf8"));
    } catch {
      problems.push("reference.json is missing or not JSON");
    }
    if (reference && (!texts(reference.title) || !texts(reference.description)))
      problems.push("reference.json needs a title and a description, each in zh and en");
    let started = null;
    if (reference)
      try {
        const project = install(name);
        started = applyExample(project, dir, "community");
        for (const defect of await defectsOf(project)) if (!baseline.has(defect)) problems.push(defect);
      } catch (error) {
        problems.push(`a project cannot start from it: ${error.message}`);
      }
    if (problems.length) ok = false;
    results[name] = { task_loop: started?.loop ?? null, files: started?.added.length ?? 0, problems };
  }
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}
console.log(JSON.stringify({ projects: results }, null, 2));
process.exitCode = ok ? 0 : 1;

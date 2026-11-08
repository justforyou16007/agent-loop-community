export const meta = {
  name: "training-run",
  description:
    "Launch the production-scale training run, watch it while it goes, fetch its logs and metrics when it ends, and hand the waiting back to the session while it is still going",
  whenToUse: 'Run it with {"notes": "what the owner, the diagnosis or the last fix said"}.',
  phases: [{ title: "Launch" }, { title: "Watch" }, { title: "Collect" }, { title: "Record" }],
};

const STRINGS = { type: "array", items: { type: "string" } };
const LAUNCHED = {
  type: "object",
  properties: {
    launched: { type: "boolean" },
    already_running: { type: "boolean" },
    run_id: { type: "string" },
    log_file: { type: "string" },
    checkpoints_dir: { type: "string" },
    failed: { type: "boolean" },
    why: { type: "string" },
  },
  required: [
    "launched",
    "already_running",
    "run_id",
    "log_file",
    "checkpoints_dir",
    "failed",
    "why",
  ],
};
const WATCHED = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["running", "completed", "failed", "stopped"] },
    step: { type: "integer" },
    rate: { type: "string" },
    loss: { type: "string" },
    errors: STRINGS,
    note: { type: "string" },
  },
  required: ["status", "step", "rate", "loss", "errors", "note"],
};
const COLLECTED = {
  type: "object",
  properties: {
    log_file: { type: "string" },
    metrics_file: { type: "string" },
    errors: STRINGS,
    last_step: { type: "integer" },
    summary: { type: "string" },
  },
  required: ["log_file", "metrics_file", "errors", "last_step", "summary"],
};
const RECORDED = {
  type: "object",
  properties: {
    recorded: { type: "boolean" },
    file: { type: "string" },
    summary: { type: "string" },
  },
  required: ["recorded", "file", "summary"],
};

const input = args || {};
const params = input.params || {};
const maxChecks = Number.isInteger(params.max_checks) ? params.max_checks : 6;
const checkAfter = Number.isInteger(params.check_after_minutes) ? params.check_after_minutes : 15;
const notes = input.notes || "";

// Step 1
phase("Launch");
const launched = await agent(JSON.stringify({ action: "launch", notes }), {
  agentType: "run-launcher",
  schema: LAUNCHED,
  phase: "Launch",
});
if (launched.failed)
  return {
    outcome: "failed",
    run_id: launched.run_id,
    log_file: launched.log_file,
    metrics_file: "",
    checkpoints_dir: launched.checkpoints_dir,
    summary: `the run could not be launched: ${launched.why}`,
  };

// Step 2
let status = "running";
let watched = null;
for (let check = 1; check <= maxChecks; check += 1) {
  phase("Watch");
  watched = await agent(
    JSON.stringify({
      action: "check",
      run_id: launched.run_id,
      log_file: launched.log_file,
      check,
    }),
    { agentType: "run-watcher", schema: WATCHED, phase: "Watch" },
  );
  status = watched.status;
  if (status !== "running") break;
}
// A run still going is handed back to the session: a loop may not sleep through a training run.
if (status === "running")
  return {
    waiting: "run",
    run_id: launched.run_id,
    log_file: launched.log_file,
    check_after_minutes: checkAfter,
    note: watched ? watched.note : "",
  };

// Step 3
phase("Collect");
const collected = await agent(
  JSON.stringify({ action: "collect", run_id: launched.run_id, log_file: launched.log_file }),
  { agentType: "log-collector", schema: COLLECTED, phase: "Collect" },
);

// Step 4
phase("Record");
await agent(
  JSON.stringify({
    action: "record",
    what: `the production run ${launched.run_id}`,
    outcome: status === "completed" ? "worked" : "failed",
    evidence: [collected.summary, ...collected.errors],
  }),
  { agentType: "project-memory", schema: RECORDED, phase: "Record" },
);
return {
  outcome: status,
  run_id: launched.run_id,
  log_file: collected.log_file,
  metrics_file: collected.metrics_file,
  checkpoints_dir: launched.checkpoints_dir,
  errors: collected.errors,
  metrics: { last_step: collected.last_step, rate: watched.rate, loss: watched.loss },
  summary: `the run ${launched.run_id} ${status} at step ${collected.last_step}: ${collected.summary}`,
};

// contrejour-loop-definition-sha256: e5f1407d7e6b341c6d646b0afdc7322142b73faa1d389f4a3c97b2f7d6372a96

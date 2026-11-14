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
// Send back (the definition's Send back section): a step that cannot use an input names the step that
// made it (`send_back.to`); that step runs again with `returned`, then the step runs again on what it
// makes. At most SEND_BACKS times in a row; past that, or for the loop's own input (`caller`), the loop
// ends with `sent_back`.
const SEND_BACKS = 2;
const sending = (schema, to) => ({
  ...schema,
  properties: {
    ...schema.properties,
    send_back: {
      type: "object",
      properties: {
        needed: { type: "boolean" },
        to: { type: "string", enum: to },
        problems: { type: "array", items: { type: "string" } },
      },
      required: ["needed", "to", "problems"],
    },
  },
  required: [...schema.required, "send_back"],
});
const step = async (name, run, redo = {}) => {
  for (let returns = 0; ; returns += 1) {
    const out = await run();
    const back = out && out.send_back;
    if (!back || !back.needed) return out;
    const again = redo[back.to];
    if (!again || returns >= SEND_BACKS)
      return { sent_back: { by: name, to: back.to, problems: back.problems } };
    const remade = await again({ by: name, problems: back.problems });
    if (remade && (remade.sent_back || remade.waiting)) return remade;
  }
};

// Step 1: a result the calling loop sent back is what the launch redoes.
phase("Launch");
const launch = (back) =>
  agent(JSON.stringify({ action: "launch", notes, returned: back }), {
    agentType: "run-launcher",
    schema: sending(LAUNCHED, ["caller"]),
    phase: "Launch",
  });
let launched = await step("run-launcher:launch", () => launch(input.returned || null));
if (launched.sent_back) return { outcome: "failed", sent_back: launched.sent_back };
if (launched.failed)
  return {
    outcome: "failed",
    run_id: launched.run_id,
    log_file: launched.log_file,
    metrics_file: "",
    checkpoints_dir: launched.checkpoints_dir,
    summary: `the run could not be launched: ${launched.why}`,
  };
const relaunch = async (back) => {
  phase("Launch");
  const again = await step("run-launcher:launch", () => launch(back));
  if (again.sent_back) return again;
  if (again.failed)
    return { sent_back: { by: "run-watcher:check", to: "run-launcher:launch", problems: [again.why] } };
  launched = again;
  return again;
};

// Step 2
let status = "running";
let watched = null;
const watch = (check, back) =>
  agent(
    JSON.stringify({
      action: "check",
      run_id: launched.run_id,
      log_file: launched.log_file,
      check,
      returned: back,
    }),
    {
      agentType: "run-watcher",
      schema: sending(WATCHED, ["run-launcher:launch"]),
      phase: "Watch",
    },
  );
for (let check = 1; check <= maxChecks; check += 1) {
  phase("Watch");
  watched = await step("run-watcher:check", () => watch(check, null), {
    "run-launcher:launch": relaunch,
  });
  if (watched.sent_back) return { outcome: "failed", run_id: launched.run_id, sent_back: watched.sent_back };
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
// What the collection cannot use is checked again: it does not launch the run again.
const rewatch = async (back) => {
  phase("Watch");
  const again = await step("run-watcher:check", () => watch(maxChecks, back), {
    "run-launcher:launch": relaunch,
  });
  if (!again.sent_back) {
    watched = again;
    status = again.status;
  }
  return again;
};

// Step 3
phase("Collect");
const collect = (back) =>
  agent(
    JSON.stringify({
      action: "collect",
      run_id: launched.run_id,
      log_file: launched.log_file,
      returned: back,
    }),
    {
      agentType: "log-collector",
      schema: sending(COLLECTED, ["run-watcher:check"]),
      phase: "Collect",
    },
  );
let collected = await step("log-collector:collect", () => collect(null), {
  "run-watcher:check": rewatch,
});
if (collected.sent_back) return { outcome: "failed", run_id: launched.run_id, sent_back: collected.sent_back };
const recollect = async (back) => {
  const again = await step("log-collector:collect", () => collect(back), {
    "run-watcher:check": rewatch,
  });
  if (!again.sent_back) collected = again;
  return again;
};

// Step 4
phase("Record");
const recorded = await step(
  "project-memory:record",
  () =>
    agent(
      JSON.stringify({
        action: "record",
        what: `the production run ${launched.run_id}`,
        outcome: status === "completed" ? "worked" : "failed",
        evidence: [collected.summary, ...collected.errors],
      }),
      {
        agentType: "project-memory",
        schema: sending(RECORDED, ["log-collector:collect"]),
        phase: "Record",
      },
    ),
  { "log-collector:collect": recollect },
);
if (recorded.sent_back) return { outcome: "failed", run_id: launched.run_id, sent_back: recorded.sent_back };
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

// contrejour-loop-definition-sha256: 8e74426a62d01f9cec5f9b58ff5941b6b3bb7442d6dd2b5a9ed0c5cce253b585

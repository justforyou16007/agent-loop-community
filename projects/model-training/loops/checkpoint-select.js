export const meta = {
  name: "checkpoint-select",
  description:
    "Pick the checkpoints of a finished run that are worth benchmarking, from what the run's own metrics show, and prove each one loads before any benchmark time is spent on it",
  whenToUse:
    'Run it with {"run_id": "the finished run", "log_file": "its log", "metrics_file": "its metrics"}.',
  phases: [{ title: "Select" }, { title: "Check" }, { title: "Record" }],
};

const STRINGS = { type: "array", items: { type: "string" } };
const SELECTED = {
  type: "object",
  properties: { candidates: STRINGS, basis: STRINGS, excluded: STRINGS },
  required: ["candidates", "basis", "excluded"],
};
const CHECKED = {
  type: "object",
  properties: { usable: STRINGS, broken: STRINGS, evidence: STRINGS },
  required: ["usable", "broken", "evidence"],
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
const topK = Number.isInteger(params.top_k) ? params.top_k : 2;
const maxRounds = Number.isInteger(params.max_rounds) ? params.max_rounds : 2;
const runId = input.run_id || "";

let excluded = [];
let candidates = [];
let basis = [];
let usable = [];
let broken = [];

for (let round = 1; round <= maxRounds; round += 1) {
  // Step 1
  phase("Select");
  const selected = await agent(
    JSON.stringify({
      action: "select",
      run_id: runId,
      log_file: input.log_file || "",
      metrics_file: input.metrics_file || "",
      top_k: topK,
      excluded,
      round,
    }),
    { agentType: "checkpoint-selector", schema: SELECTED, phase: "Select" },
  );
  candidates = selected.candidates;
  basis = selected.basis;
  // Step 2: a candidate that will not load is a benchmark result nobody can trust.
  phase("Check");
  const checked = await agent(
    JSON.stringify({ action: "check", candidates, run_id: runId }),
    { agentType: "checkpoint-checker", schema: CHECKED, phase: "Check" },
  );
  usable = checked.usable;
  broken = checked.broken;
  if (!broken.length) break;
  excluded = [...excluded, ...broken];
}

// Step 3
phase("Record");
await agent(
  JSON.stringify({
    action: "record",
    what: `the checkpoints picked from ${runId}`,
    outcome: usable.length ? "worked" : "failed",
    evidence: [...basis, ...broken],
  }),
  { agentType: "project-memory", schema: RECORDED, phase: "Record" },
);
return {
  candidates,
  usable,
  broken,
  basis,
  summary: usable.length
    ? `${usable.length} of ${candidates.length} checkpoints load and are worth benchmarking`
    : `none of the ${candidates.length} checkpoints picked from ${runId} could be loaded`,
};

// contrejour-loop-definition-sha256: ce8bee77ed4d07b782aa5a5fc01f138d412ef06429904eade269cfff4a201e0c

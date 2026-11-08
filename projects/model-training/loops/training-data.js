export const meta = {
  name: "training-data",
  description:
    "Validate the prepared data against what the task requires, repair what the project's own preparation can repair, and validate it again",
  whenToUse:
    'Run it with {"reason": "why the data is being validated", "notes": "what the owner or the diagnosis said"}.',
  phases: [{ title: "Validate" }, { title: "Repair" }, { title: "Record" }],
};

const STRINGS = { type: "array", items: { type: "string" } };
const VALIDATED = {
  type: "object",
  properties: {
    ready: { type: "boolean" },
    dataset: { type: "string" },
    counts: STRINGS,
    problems: STRINGS,
    evidence: STRINGS,
    report_file: { type: "string" },
  },
  required: ["ready", "dataset", "counts", "problems", "evidence", "report_file"],
};
const REPAIRED = {
  type: "object",
  properties: {
    changed: { type: "boolean" },
    changes: STRINGS,
    left: STRINGS,
    summary: { type: "string" },
  },
  required: ["changed", "changes", "left", "summary"],
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
const maxRounds = Number.isInteger(params.max_rounds) ? params.max_rounds : 2;
const repair = typeof params.repair === "boolean" ? params.repair : true;
const notes = input.notes || "";

let problems = [];
let counts = [];
let dataset = "";
let reportFile = "";
let ready = false;

for (let round = 1; round <= maxRounds; round += 1) {
  // Step 1
  phase("Validate");
  const validated = await agent(JSON.stringify({ action: "validate", round, notes, problems }), {
    agentType: "data-validator",
    schema: VALIDATED,
    phase: "Validate",
  });
  ready = validated.ready && !validated.problems.length;
  problems = validated.problems;
  counts = validated.counts;
  dataset = validated.dataset;
  reportFile = validated.report_file;
  if (ready) break;
  // Step 2: only what the project's own preparation can repair, and only while a round is left to check it.
  if (!repair || round === maxRounds) break;
  phase("Repair");
  const repaired = await agent(
    JSON.stringify({ action: "repair", problems, report_file: reportFile, round }),
    { agentType: "data-repairer", schema: REPAIRED, phase: "Repair" },
  );
  if (!repaired.changed) break;
}

// Step 3
phase("Record");
await agent(
  JSON.stringify({
    action: "record",
    what: `the prepared data ${dataset}`,
    outcome: ready ? "worked" : "failed",
    evidence: [...counts, ...problems],
  }),
  { agentType: "project-memory", schema: RECORDED, phase: "Record" },
);
return {
  ready,
  dataset,
  problems,
  counts,
  report_file: reportFile,
  summary: ready
    ? `the prepared data ${dataset} fits what the task asks for`
    : `the prepared data has ${problems.length} problems left`,
};

// contrejour-loop-definition-sha256: 483b1d43d7852c15502bf340f6e0d8f11f350592fbaa0f77a34e01fe0478dc25

export const meta = {
  name: "training-smoke",
  description:
    "Run the training code at a small scale to prove the code, the image, the data and the launch arguments work together, and tell a code failure from a run that never started",
  whenToUse: 'Run it with {"notes": "what the owner, the diagnosis or the last fix said"}.',
  phases: [{ title: "Run" }, { title: "Record" }],
};

const STRINGS = { type: "array", items: { type: "string" } };
const RAN = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["did-not-start", "passed", "code-failed"] },
    run_id: { type: "string" },
    log_file: { type: "string" },
    output: { type: "string" },
    failed_at: { type: "string" },
  },
  required: ["verdict", "run_id", "log_file", "output", "failed_at"],
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
const steps = Number.isInteger(params.steps) ? params.steps : 20;
const maxRounds = Number.isInteger(params.max_rounds) ? params.max_rounds : 2;
const notes = input.notes || "";

let ran = null;
for (let round = 1; round <= maxRounds; round += 1) {
  // Step 1
  phase("Run");
  ran = await agent(JSON.stringify({ action: "run", steps, round, notes }), {
    agentType: "smoke-runner",
    schema: RAN,
    phase: "Run",
  });
  // Step 2: a run that never started says nothing about the code, so it is tried again.
  if (ran.verdict !== "did-not-start") break;
}

const passed = ran.verdict === "passed";
// Step 3
phase("Record");
await agent(
  JSON.stringify({
    action: "record",
    what: `a ${steps}-step run of the training code`,
    outcome: passed ? "worked" : "failed",
    evidence: [ran.verdict, ran.failed_at, ran.output],
  }),
  { agentType: "project-memory", schema: RECORDED, phase: "Record" },
);
return {
  passed,
  verdict: ran.verdict,
  run_id: ran.run_id,
  log_file: ran.log_file,
  summary: passed
    ? `the training code ran ${steps} steps`
    : `the small-scale run ${ran.verdict} at ${ran.failed_at}`,
};

// contrejour-loop-definition-sha256: bbf5a5fd9a348aa5942613eaebff5853a3c3bb182868e44f95a2269facc9fc38

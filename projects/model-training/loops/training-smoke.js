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

const run = (round, back) =>
  agent(JSON.stringify({ action: "run", steps, round, notes, returned: back }), {
    agentType: "smoke-runner",
    schema: sending(RAN, ["caller"]),
    phase: "Run",
  });
let ran = null;
for (let round = 1; round <= maxRounds; round += 1) {
  // Step 1: a result the calling loop sent back is what the first run redoes.
  phase("Run");
  ran = await step("smoke-runner:run", () => run(round, round === 1 ? input.returned || null : null));
  if (ran.sent_back) return { passed: false, sent_back: ran.sent_back };
  // Step 2: a run that never started says nothing about the code, so it is tried again.
  if (ran.verdict !== "did-not-start") break;
}
const rerun = async (back) => {
  const again = await step("smoke-runner:run", () => run(maxRounds, back));
  if (!again.sent_back) ran = again;
  return again;
};

// Step 3
phase("Record");
const recorded = await step(
  "project-memory:record",
  () =>
    agent(
      JSON.stringify({
        action: "record",
        what: `a ${steps}-step run of the training code`,
        outcome: ran.verdict === "passed" ? "worked" : "failed",
        evidence: [ran.verdict, ran.failed_at, ran.output],
      }),
      {
        agentType: "project-memory",
        schema: sending(RECORDED, ["smoke-runner:run"]),
        phase: "Record",
      },
    ),
  { "smoke-runner:run": rerun },
);
if (recorded.sent_back) return { passed: false, sent_back: recorded.sent_back };
const passed = ran.verdict === "passed";
return {
  passed,
  verdict: ran.verdict,
  run_id: ran.run_id,
  log_file: ran.log_file,
  summary: passed
    ? `the training code ran ${steps} steps`
    : `the small-scale run ${ran.verdict} at ${ran.failed_at}`,
};

// contrejour-loop-definition-sha256: 216d195a53e995db41e31062b42451fbe433facd4356ec804a2744037506ec97

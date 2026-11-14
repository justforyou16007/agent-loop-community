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

let excluded = [];
let candidates = [];
let basis = [];
let usable = [];
let broken = [];
let recheck = null;

for (let round = 1; round <= maxRounds; round += 1) {
  // Step 1: a result the calling loop sent back is what the first selection redoes.
  phase("Select");
  const select = (back) =>
    agent(
      JSON.stringify({
        action: "select",
        run_id: runId,
        log_file: input.log_file || "",
        metrics_file: input.metrics_file || "",
        top_k: topK,
        excluded,
        round,
        returned: back,
      }),
      {
        agentType: "checkpoint-selector",
        schema: sending(SELECTED, ["caller"]),
        phase: "Select",
      },
    );
  let selected = await step("checkpoint-selector:select", () =>
    select(round === 1 ? input.returned || null : null),
  );
  if (selected.sent_back) return { usable: [], sent_back: selected.sent_back };
  // Step 2: a candidate that will not load is a benchmark result nobody can trust.
  phase("Check");
  const check = (back) =>
    agent(
      JSON.stringify({ action: "check", candidates: selected.candidates, run_id: runId, returned: back }),
      {
        agentType: "checkpoint-checker",
        schema: sending(CHECKED, ["checkpoint-selector:select"]),
        phase: "Check",
      },
    );
  const reselect = async (back) => {
    const again = await step("checkpoint-selector:select", () => select(back));
    if (!again.sent_back) selected = again;
    return again;
  };
  let checked = await step("checkpoint-checker:check", () => check(null), {
    "checkpoint-selector:select": reselect,
  });
  if (checked.sent_back) return { usable: [], sent_back: checked.sent_back };
  recheck = async (back) => {
    const again = await step("checkpoint-checker:check", () => check(back), {
      "checkpoint-selector:select": reselect,
    });
    if (!again.sent_back) {
      checked = again;
      usable = again.usable;
      broken = again.broken;
    }
    return again;
  };
  candidates = selected.candidates;
  basis = selected.basis;
  usable = checked.usable;
  broken = checked.broken;
  if (!broken.length) break;
  excluded = [...excluded, ...broken];
}

// Step 3
phase("Record");
const recorded = await step(
  "project-memory:record",
  () =>
    agent(
      JSON.stringify({
        action: "record",
        what: `the checkpoints picked from ${runId}`,
        outcome: usable.length ? "worked" : "failed",
        evidence: [...basis, ...broken],
      }),
      {
        agentType: "project-memory",
        schema: sending(RECORDED, ["checkpoint-checker:check"]),
        phase: "Record",
      },
    ),
  { "checkpoint-checker:check": recheck },
);
if (recorded.sent_back) return { usable: [], sent_back: recorded.sent_back };
return {
  candidates,
  usable,
  broken,
  basis,
  summary: usable.length
    ? `${usable.length} of ${candidates.length} checkpoints load and are worth benchmarking`
    : `none of the ${candidates.length} checkpoints picked from ${runId} could be loaded`,
};

// contrejour-loop-definition-sha256: 899abe157ada6d6820672f0e925a5719f0763054b9ced5960d2c57394a26b9dc

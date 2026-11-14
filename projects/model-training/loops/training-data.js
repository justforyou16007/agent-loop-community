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

let problems = [];
let counts = [];
let dataset = "";
let reportFile = "";
let ready = false;
let revalidate = null;
const ending = (sent) => ({ ready: false, dataset, problems, sent_back: sent });

for (let round = 1; round <= maxRounds; round += 1) {
  // Step 1: a result the calling loop sent back is what the first validation redoes.
  phase("Validate");
  const known = problems;
  const validate = (back) =>
    agent(JSON.stringify({ action: "validate", round, notes, problems: known, returned: back }), {
      agentType: "data-validator",
      schema: sending(VALIDATED, ["caller"]),
      phase: "Validate",
    });
  const take = (validated) => {
    ready = validated.ready && !validated.problems.length;
    problems = validated.problems;
    counts = validated.counts;
    dataset = validated.dataset;
    reportFile = validated.report_file;
  };
  const validated = await step("data-validator:validate", () =>
    validate(round === 1 ? input.returned || null : null),
  );
  if (validated.sent_back) return ending(validated.sent_back);
  take(validated);
  revalidate = async (back) => {
    phase("Validate");
    const again = await step("data-validator:validate", () => validate(back));
    if (!again.sent_back) take(again);
    return again;
  };
  if (ready) break;
  // Step 2: only what the project's own preparation can repair, and only while a round is left to check it.
  if (!repair || round === maxRounds) break;
  phase("Repair");
  const repaired = await step(
    "data-repairer:repair",
    () =>
      agent(JSON.stringify({ action: "repair", problems, report_file: reportFile, round }), {
        agentType: "data-repairer",
        schema: sending(REPAIRED, ["data-validator:validate"]),
        phase: "Repair",
      }),
    { "data-validator:validate": revalidate },
  );
  if (repaired.sent_back) return ending(repaired.sent_back);
  if (!repaired.changed) break;
}

// Step 3
phase("Record");
const recorded = await step(
  "project-memory:record",
  () =>
    agent(
      JSON.stringify({
        action: "record",
        what: `the prepared data ${dataset}`,
        outcome: ready ? "worked" : "failed",
        evidence: [...counts, ...problems],
      }),
      {
        agentType: "project-memory",
        schema: sending(RECORDED, ["data-validator:validate"]),
        phase: "Record",
      },
    ),
  { "data-validator:validate": revalidate },
);
if (recorded.sent_back) return ending(recorded.sent_back);
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

// contrejour-loop-definition-sha256: 74b43a31485ca9ac7ca3badba2fb719087b343783fadeaea121e045a88189861

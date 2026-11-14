export const meta = {
  name: "training-diagnosis",
  description:
    "Collect a failed run's logs, locate the first real error and classify where its repair belongs, and confirm the classification by reproducing the failure at a small scale",
  whenToUse:
    'Run it with {"run_id": "the run that failed", "log_file": "its log", "scale": "small or production", "notes": "what the owner said"}.',
  phases: [{ title: "Collect" }, { title: "Localize" }, { title: "Reproduce" }, { title: "Record" }],
};

const STRINGS = { type: "array", items: { type: "string" } };
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
const ANALYZED = {
  type: "object",
  properties: {
    category: {
      type: "string",
      enum: [
        "code",
        "image",
        "data",
        "performance",
        "hyperparameters",
        "environment",
        "unknown",
      ],
    },
    cause: { type: "string" },
    first_error: { type: "string" },
    where: { type: "string" },
    evidence: STRINGS,
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    report_file: { type: "string" },
  },
  required: [
    "category",
    "cause",
    "first_error",
    "where",
    "evidence",
    "confidence",
    "report_file",
  ],
};
const REPRODUCED = {
  type: "object",
  properties: {
    reproduced: { type: "boolean" },
    how: { type: "string" },
    output: { type: "string" },
    contradicts: { type: "string" },
  },
  required: ["reproduced", "how", "output", "contradicts"],
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
const reproduce = typeof params.reproduce === "boolean" ? params.reproduce : true;
const runId = input.run_id || "";
const scale = input.scale || "production";
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

// Step 1: a result the calling loop sent back is what the collection redoes.
phase("Collect");
const collect = (back) =>
  agent(
    JSON.stringify({ action: "collect", run_id: runId, log_file: input.log_file || "", returned: back }),
    { agentType: "log-collector", schema: sending(COLLECTED, ["caller"]), phase: "Collect" },
  );
let collected = await step("log-collector:collect", () => collect(input.returned || null));
if (collected.sent_back) return { reproduced: false, sent_back: collected.sent_back };
const recollect = async (back) => {
  phase("Collect");
  const again = await step("log-collector:collect", () => collect(back));
  if (!again.sent_back) collected = again;
  return again;
};

let analyzed = null;
let reproducedIt = false;
let how = "";
let contradiction = "";
let reanalyze = null;
for (let round = 1; round <= maxRounds; round += 1) {
  // Step 2
  phase("Localize");
  const known = contradiction;
  const analyze = (back) =>
    agent(
      JSON.stringify({
        action: "analyze",
        run_id: runId,
        scale,
        log_file: collected.log_file,
        metrics_file: collected.metrics_file,
        errors: collected.errors,
        round,
        notes,
        contradiction: known,
        returned: back,
      }),
      {
        agentType: "failure-analyst",
        schema: sending(ANALYZED, ["log-collector:collect"]),
        phase: "Localize",
      },
    );
  analyzed = await step("failure-analyst:analyze", () => analyze(null), {
    "log-collector:collect": recollect,
  });
  if (analyzed.sent_back) return { reproduced: false, sent_back: analyzed.sent_back };
  reanalyze = async (back) => {
    phase("Localize");
    const again = await step("failure-analyst:analyze", () => analyze(back), {
      "log-collector:collect": recollect,
    });
    if (!again.sent_back) analyzed = again;
    return again;
  };
  // Step 3: a diagnosis that is not already certain is worth confirming before it becomes a fix.
  if (!reproduce || analyzed.confidence === "high") break;
  phase("Reproduce");
  const attempt = await step(
    "fault-reproducer:reproduce",
    () =>
      agent(
        JSON.stringify({
          action: "reproduce",
          category: analyzed.category,
          cause: analyzed.cause,
          evidence: analyzed.evidence,
          report_file: analyzed.report_file,
        }),
        {
          agentType: "fault-reproducer",
          schema: sending(REPRODUCED, ["failure-analyst:analyze"]),
          phase: "Reproduce",
        },
      ),
    { "failure-analyst:analyze": reanalyze },
  );
  if (attempt.sent_back) return { reproduced: false, sent_back: attempt.sent_back };
  reproducedIt = attempt.reproduced;
  how = attempt.how;
  if (!attempt.contradicts) break;
  contradiction = attempt.contradicts;
}

// Step 4
phase("Record");
const recorded = await step(
  "project-memory:record",
  () =>
    agent(
      JSON.stringify({
        action: "record",
        what: `the diagnosis of ${runId}: ${analyzed.category}`,
        outcome: reproducedIt ? "worked" : "failed",
        evidence: [analyzed.cause, analyzed.first_error, how, ...analyzed.evidence],
      }),
      {
        agentType: "project-memory",
        schema: sending(RECORDED, ["failure-analyst:analyze"]),
        phase: "Record",
      },
    ),
  { "failure-analyst:analyze": reanalyze },
);
if (recorded.sent_back) return { reproduced: false, sent_back: recorded.sent_back };
return {
  category: analyzed.category,
  cause: analyzed.cause,
  first_error: analyzed.first_error,
  where: analyzed.where,
  evidence: analyzed.evidence,
  confidence: analyzed.confidence,
  reproduced: reproducedIt,
  report_file: analyzed.report_file,
  summary: `${analyzed.category}: ${analyzed.cause} (${analyzed.confidence} confidence, ${reproducedIt ? "reproduced" : "not reproduced"})`,
};

// contrejour-loop-definition-sha256: b8ea0eb4b0a93fbd35b78d7152e41a67713200710f17bbf9e0f2c13d89ab6b9a

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

// Step 1
phase("Collect");
const collected = await agent(
  JSON.stringify({ action: "collect", run_id: runId, log_file: input.log_file || "" }),
  { agentType: "log-collector", schema: COLLECTED, phase: "Collect" },
);

let analyzed = null;
let reproducedIt = false;
let how = "";
let contradiction = "";
for (let round = 1; round <= maxRounds; round += 1) {
  // Step 2
  phase("Localize");
  analyzed = await agent(
    JSON.stringify({
      action: "analyze",
      run_id: runId,
      scale,
      log_file: collected.log_file,
      metrics_file: collected.metrics_file,
      errors: collected.errors,
      round,
      notes,
      contradiction,
    }),
    { agentType: "failure-analyst", schema: ANALYZED, phase: "Localize" },
  );
  // Step 3: a diagnosis that is not already certain is worth confirming before it becomes a fix.
  if (!reproduce || analyzed.confidence === "high") break;
  phase("Reproduce");
  const attempt = await agent(
    JSON.stringify({
      action: "reproduce",
      category: analyzed.category,
      cause: analyzed.cause,
      evidence: analyzed.evidence,
      report_file: analyzed.report_file,
    }),
    { agentType: "fault-reproducer", schema: REPRODUCED, phase: "Reproduce" },
  );
  reproducedIt = attempt.reproduced;
  how = attempt.how;
  if (!attempt.contradicts) break;
  contradiction = attempt.contradicts;
}

// Step 4
phase("Record");
await agent(
  JSON.stringify({
    action: "record",
    what: `the diagnosis of ${runId}: ${analyzed.category}`,
    outcome: reproducedIt ? "worked" : "failed",
    evidence: [analyzed.cause, analyzed.first_error, how, ...analyzed.evidence],
  }),
  { agentType: "project-memory", schema: RECORDED, phase: "Record" },
);
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

// contrejour-loop-definition-sha256: e26dac89b185b347a2797f750665630354d37b520080d029fcd606db14db57ca

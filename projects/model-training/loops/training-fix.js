export const meta = {
  name: "training-fix",
  description:
    "Make the change the failure's class calls for: an upstream fix found and aligned to the version this project pins, a performance change planned from measurements, or a hyperparameter change planned from what the run learned",
  whenToUse:
    'Run it with {"category": "code, performance or hyperparameters", "cause": "what the diagnosis found", "report_file": "the diagnosis report", "notes": "what the owner said"}.',
  phases: [{ title: "Plan" }, { title: "Apply" }, { title: "Record" }],
};

const STRINGS = { type: "array", items: { type: "string" } };
const SCOUTED = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    source: { type: "string" },
    reference: { type: "string" },
    applies: { type: "boolean" },
    why: { type: "string" },
    local_change: { type: "string" },
  },
  required: ["found", "source", "reference", "applies", "why", "local_change"],
};
const APPLIED = {
  type: "object",
  properties: {
    applied: { type: "boolean" },
    files: STRINGS,
    conflicts: STRINGS,
    needs_image: { type: "boolean" },
    summary: { type: "string" },
  },
  required: ["applied", "files", "conflicts", "needs_image", "summary"],
};
const PLANNED = {
  type: "object",
  properties: {
    change: { type: "string" },
    expected: { type: "string" },
    basis: STRINGS,
    files: STRINGS,
    needs_image: { type: "boolean" },
  },
  required: ["change", "expected", "basis", "files", "needs_image"],
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
const takeUpstream = typeof params.take_upstream === "boolean" ? params.take_upstream : true;
const category = input.category || "";
const cause = input.cause || "";
const reportFile = input.report_file || "";
const notes = input.notes || "";

let changed = false;
let needsImage = false;
let summary = "";
let files = [];
let reference = "";

// Step 1
phase("Plan");
if (category === "code") {
  const scouted = await agent(
    JSON.stringify({ action: "scout", cause, report_file: reportFile, notes }),
    { agentType: "upstream-scout", schema: SCOUTED, phase: "Plan" },
  );
  reference = scouted.reference;
  // Step 2: only a fix that exists, applies to the pinned version, and is allowed to be taken.
  if (scouted.found && scouted.applies && takeUpstream) {
    phase("Apply");
    const applied = await agent(
      JSON.stringify({
        action: "apply",
        source: scouted.source,
        reference: scouted.reference,
        local_change: scouted.local_change,
        cause,
      }),
      { agentType: "patch-aligner", schema: APPLIED, phase: "Apply" },
    );
    changed = applied.applied;
    needsImage = applied.needs_image;
    files = applied.files;
    summary = applied.conflicts.length
      ? `${applied.summary} (conflicts: ${applied.conflicts.length})`
      : applied.summary;
  } else if (scouted.found) {
    summary = `an upstream fix is at ${scouted.reference}, not taken: ${scouted.why}`;
  } else {
    summary = `no upstream fix matches this failure: ${scouted.why}`;
  }
} else if (category === "performance") {
  const planned = await agent(
    JSON.stringify({ action: "plan", cause, report_file: reportFile, notes }),
    { agentType: "performance-tuner", schema: PLANNED, phase: "Plan" },
  );
  changed = Boolean(planned.change);
  needsImage = planned.needs_image;
  files = planned.files;
  summary = `${planned.change} — expected: ${planned.expected}`;
} else if (category === "hyperparameters") {
  const planned = await agent(
    JSON.stringify({ action: "plan", cause, report_file: reportFile, notes }),
    { agentType: "hyperparameter-tuner", schema: PLANNED, phase: "Plan" },
  );
  changed = Boolean(planned.change);
  needsImage = planned.needs_image;
  files = planned.files;
  summary = `${planned.change} — expected: ${planned.expected}`;
} else {
  summary = `${category} is not a class this loop repairs`;
}

// Step 3
phase("Record");
await agent(
  JSON.stringify({
    action: "record",
    what: `a ${category} fix: ${summary}`,
    outcome: changed ? "worked" : "failed",
    evidence: [cause, reference, ...files],
  }),
  { agentType: "project-memory", schema: RECORDED, phase: "Record" },
);
return { changed, category, needs_image: needsImage, files, reference, summary };

// contrejour-loop-definition-sha256: 556afc9c2d1d40a02a95dcaade74357b5f5feecfe37423303e08a272c7fe98be

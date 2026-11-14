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

let changed = false;
let needsImage = false;
let summary = "";
let files = [];
let reference = "";
// The step that made the change, which Record may send back to, and how to make it again.
let maker = "caller";
const remake = {};
const ending = (sent) => ({ changed: false, category, needs_image: false, files: [], reference, sent_back: sent });

// Step 1: a result the calling loop sent back is what the first step redoes.
phase("Plan");
if (category === "code") {
  const scout = (back) =>
    agent(JSON.stringify({ action: "scout", cause, report_file: reportFile, notes, returned: back }), {
      agentType: "upstream-scout",
      schema: sending(SCOUTED, ["caller"]),
      phase: "Plan",
    });
  let scouted = await step("upstream-scout:scout", () => scout(input.returned || null));
  if (scouted.sent_back) return ending(scouted.sent_back);
  const rescout = async (back) => {
    phase("Plan");
    const again = await step("upstream-scout:scout", () => scout(back));
    if (!again.sent_back) scouted = again;
    return again;
  };
  reference = scouted.reference;
  maker = "upstream-scout:scout";
  remake[maker] = rescout;
  // Step 2: only a fix that exists, applies to the pinned version, and is allowed to be taken.
  if (scouted.found && scouted.applies && takeUpstream) {
    phase("Apply");
    const apply = (back) =>
      agent(
        JSON.stringify({
          action: "apply",
          source: scouted.source,
          reference: scouted.reference,
          local_change: scouted.local_change,
          cause,
          returned: back,
        }),
        {
          agentType: "patch-aligner",
          schema: sending(APPLIED, ["upstream-scout:scout"]),
          phase: "Apply",
        },
      );
    const take = (applied) => {
      changed = applied.applied;
      needsImage = applied.needs_image;
      files = applied.files;
      reference = scouted.reference;
      summary = applied.conflicts.length
        ? `${applied.summary} (conflicts: ${applied.conflicts.length})`
        : applied.summary;
    };
    const applied = await step("patch-aligner:apply", () => apply(null), {
      "upstream-scout:scout": rescout,
    });
    if (applied.sent_back) return ending(applied.sent_back);
    take(applied);
    maker = "patch-aligner:apply";
    remake[maker] = async (back) => {
      phase("Apply");
      const again = await step("patch-aligner:apply", () => apply(back), {
        "upstream-scout:scout": rescout,
      });
      if (!again.sent_back) take(again);
      return again;
    };
  } else if (scouted.found) {
    summary = `an upstream fix is at ${scouted.reference}, not taken: ${scouted.why}`;
  } else {
    summary = `no upstream fix matches this failure: ${scouted.why}`;
  }
} else if (category === "performance" || category === "hyperparameters") {
  const tuner = category === "performance" ? "performance-tuner" : "hyperparameter-tuner";
  const plan = (back) =>
    agent(JSON.stringify({ action: "plan", cause, report_file: reportFile, notes, returned: back }), {
      agentType: tuner,
      schema: sending(PLANNED, ["caller"]),
      phase: "Plan",
    });
  const take = (planned) => {
    changed = Boolean(planned.change);
    needsImage = planned.needs_image;
    files = planned.files;
    summary = `${planned.change} — expected: ${planned.expected}`;
  };
  const planned = await step(`${tuner}:plan`, () => plan(input.returned || null));
  if (planned.sent_back) return ending(planned.sent_back);
  take(planned);
  maker = `${tuner}:plan`;
  remake[maker] = async (back) => {
    phase("Plan");
    const again = await step(`${tuner}:plan`, () => plan(back));
    if (!again.sent_back) take(again);
    return again;
  };
} else {
  summary = `${category} is not a class this loop repairs`;
}

// Step 3
phase("Record");
const recorded = await step(
  "project-memory:record",
  () =>
    agent(
      JSON.stringify({
        action: "record",
        what: `a ${category} fix: ${summary}`,
        outcome: changed ? "worked" : "failed",
        evidence: [cause, reference, ...files],
      }),
      { agentType: "project-memory", schema: sending(RECORDED, [maker]), phase: "Record" },
    ),
  remake,
);
if (recorded.sent_back) return ending(recorded.sent_back);
return { changed, category, needs_image: needsImage, files, reference, summary };

// contrejour-loop-definition-sha256: 1b7a2b075cc4ae59827044f00f441cc244f0ed0bd7651d8e5bdcd37c94134aa7

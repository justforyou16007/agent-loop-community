export const meta = {
  name: "training-image",
  description:
    "Build or repair the training image and verify it runs the training stack, going back to the build with what the verification found",
  whenToUse:
    'Run it with {"reason": "why the image is being made", "notes": "what the owner or the diagnosis said"}.',
  phases: [{ title: "Build" }, { title: "Verify" }, { title: "Record" }],
};

const STRINGS = { type: "array", items: { type: "string" } };
const BUILT = {
  type: "object",
  properties: {
    image: { type: "string" },
    digest: { type: "string" },
    built: { type: "string" },
    changes: STRINGS,
    failed: { type: "boolean" },
  },
  required: ["image", "digest", "built", "changes", "failed"],
};
const VERIFIED = {
  type: "object",
  properties: {
    ready: { type: "boolean" },
    image: { type: "string" },
    mismatches: STRINGS,
    evidence: STRINGS,
  },
  required: ["ready", "image", "mismatches", "evidence"],
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
const verifyOnly = typeof params.verify_only === "boolean" ? params.verify_only : false;
const reason = input.reason || "";
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

let image = "";
let digest = "";
let mismatches = [];
let evidence = [];
let ready = false;
let reverify = null;
const ending = (sent) => ({ ready: false, image, digest, mismatches, sent_back: sent });

for (let round = 1; round <= maxRounds; round += 1) {
  // Step 1: a result the calling loop sent back is what the first build redoes.
  const build = (back) =>
    agent(JSON.stringify({ action: "build", reason, notes, round, mismatches, returned: back }), {
      agentType: "image-builder",
      schema: sending(BUILT, ["caller"]),
      phase: "Build",
    });
  // A built image Verify cannot use is built again; a failed build ends the loop.
  const rebuild = async (back) => {
    phase("Build");
    const built = await step("image-builder:build", () => build(back));
    if (built.sent_back) return built;
    if (built.failed) return { sent_back: { by: "image-verifier:verify", to: "image-builder:build", problems: [built.built] } };
    image = built.image;
    digest = built.digest;
    return built;
  };
  if (!verifyOnly) {
    phase("Build");
    const built = await step("image-builder:build", () =>
      build(round === 1 ? input.returned || null : null),
    );
    if (built.sent_back) return ending(built.sent_back);
    if (built.failed)
      return {
        ready: false,
        image: built.image,
        digest: built.digest,
        mismatches: [],
        summary: `the image could not be built: ${built.built}`,
      };
    image = built.image;
    digest = built.digest;
  }
  // Step 2
  phase("Verify");
  const verify = (back) =>
    agent(JSON.stringify({ action: "verify", image, digest, round, returned: back }), {
      agentType: "image-verifier",
      schema: sending(VERIFIED, verifyOnly ? ["caller"] : ["image-builder:build"]),
      phase: "Verify",
    });
  const verifyRedo = verifyOnly ? {} : { "image-builder:build": rebuild };
  let verified = await step("image-verifier:verify", () => verify(null), verifyRedo);
  if (verified.sent_back) return ending(verified.sent_back);
  reverify = async (back) => {
    const again = await step("image-verifier:verify", () => verify(back), verifyRedo);
    if (!again.sent_back) {
      verified = again;
      ready = again.ready && !again.mismatches.length;
      mismatches = again.mismatches;
      evidence = again.evidence;
    }
    return again;
  };
  // Step 3: a verification that found nothing wrong is what makes the image ready.
  ready = verified.ready && !verified.mismatches.length;
  mismatches = verified.mismatches;
  evidence = verified.evidence;
  image = image || verified.image;
  if (ready) break;
}

// Step 4
phase("Record");
const recorded = await step(
  "project-memory:record",
  () =>
    agent(
      JSON.stringify({
        action: "record",
        what: `the training image ${image}`,
        outcome: ready ? "worked" : "failed",
        evidence: [...mismatches, ...evidence],
      }),
      {
        agentType: "project-memory",
        schema: sending(RECORDED, ["image-verifier:verify"]),
        phase: "Record",
      },
    ),
  { "image-verifier:verify": reverify },
);
if (recorded.sent_back) return ending(recorded.sent_back);
return {
  ready,
  image,
  digest,
  mismatches,
  summary: ready
    ? `the image ${image} verified against what the training code needs`
    : `the image ${image} still gets ${mismatches.length} things wrong`,
};

// contrejour-loop-definition-sha256: 61d397c041be546a35fbb63b70e489ef7458e1c5a999996047e476c689b727fe

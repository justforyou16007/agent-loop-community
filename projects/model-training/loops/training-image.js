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

let image = "";
let digest = "";
let mismatches = [];
let evidence = [];
let ready = false;

for (let round = 1; round <= maxRounds; round += 1) {
  // Step 1
  if (!verifyOnly) {
    phase("Build");
    const built = await agent(JSON.stringify({ action: "build", reason, notes, round, mismatches }), {
      agentType: "image-builder",
      schema: BUILT,
      phase: "Build",
    });
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
  const verified = await agent(JSON.stringify({ action: "verify", image, digest, round }), {
    agentType: "image-verifier",
    schema: VERIFIED,
    phase: "Verify",
  });
  // Step 3: a verification that found nothing wrong is what makes the image ready.
  ready = verified.ready && !verified.mismatches.length;
  mismatches = verified.mismatches;
  evidence = verified.evidence;
  image = image || verified.image;
  if (ready) break;
}

// Step 4
phase("Record");
await agent(
  JSON.stringify({
    action: "record",
    what: `the training image ${image}`,
    outcome: ready ? "worked" : "failed",
    evidence: [...mismatches, ...evidence],
  }),
  { agentType: "project-memory", schema: RECORDED, phase: "Record" },
);
return {
  ready,
  image,
  digest,
  mismatches,
  summary: ready
    ? `the image ${image} verified against what the training code needs`
    : `the image ${image} still gets ${mismatches.length} things wrong`,
};

// contrejour-loop-definition-sha256: 1c63ecf68e59e30c7a22544aef902795bbced9900f81ebb19de302c23f6df109

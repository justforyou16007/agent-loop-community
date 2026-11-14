export const meta = {
  name: "model-training",
  description:
    "Train a model in attempts: the image, the data, a small-scale check of the training code, the production run with its logs, a diagnosis of what went wrong, the fix its class calls for, and the checkpoints with their benchmark",
  whenToUse:
    "The project's task loop. Run it with {params}, then again with the owner's replies in answers.",
  phases: [
    { title: "Image" },
    { title: "Data" },
    { title: "Small-scale check" },
    { title: "Training run" },
    { title: "Diagnosis" },
    { title: "Checkpoints" },
    { title: "Benchmark" },
    { title: "Record" },
    { title: "Review" },
    { title: "Fix" },
  ],
};

const STRINGS = { type: "array", items: { type: "string" } };
const REVIEW = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["approve", "revise", "cancel", "ask"] },
    question: { type: "string" },
    document: { type: "string" },
    notes: { type: "string" },
    accepted: STRINGS,
  },
  required: ["decision", "question", "document", "notes", "accepted"],
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
const answers = input.answers || {};
const params = input.params || {};
const maxAttempts = Number.isInteger(params.max_attempts) ? params.max_attempts : 3;
const smokeFirst = typeof params.smoke_first === "boolean" ? params.smoke_first : true;
const topK = Number.isInteger(params.benchmark_top_k) ? params.benchmark_top_k : 2;
const stopAfter = typeof params.stop_after === "string" && params.stop_after
  ? params.stop_after
  : "benchmark";
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
// A child loop is a step too: when it sends back what it was given (`sent_back.to` is `caller`), `redo`
// makes it again and the child loop runs again, at most SEND_BACKS times; what it sent back past that,
// or about its own steps, ends this loop with `sent_back` too.
const child = async (name, run, redo) => {
  for (let returns = 0; ; returns += 1) {
    const out = await run();
    const back = out && out.sent_back;
    if (!back) return out;
    if (!redo || back.to !== "caller" || returns >= SEND_BACKS)
      return { sent_back: { by: `${name}/${back.by}`, to: back.to, problems: back.problems } };
    const remade = await redo({ by: name, problems: back.problems });
    if (remade && (remade.sent_back || remade.waiting)) return remade;
  }
};

// What the attempts have established, so an attempt redoes only what its diagnosis blames.
let imageReady = false;
let dataReady = false;
// Something changed that the small-scale check has not seen yet.
let changedSince = true;
// The class the last diagnosis gave, which decides where the next attempt starts.
let category = "";
// The owner's words, or what the last fix did.
let notes = "";
let last = null;
// A child loop's result a step could not use, past what could be made again here, ends the loop with it.
const ending = (sent) => ({
  done: false,
  reason: "a step could not use what it was given",
  ...(last || {}),
  sent_back: sent,
});
const stopped = (result) => Boolean(result && (result.waiting || result.sent_back));
// A child loop asked to make its result again gets what was sent back as `returned`.
const withReturned = (args, back) => (back ? { ...args, returned: back } : args);

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  // Step 1
  if (!imageReady || category === "image") {
    phase("Image");
    const image = await child(
      "training-image",
      () => workflow("training-image", { reason: category || "first attempt", notes, answers }),
      null,
    );
    if (image && image.waiting) return image;
    if (image && image.sent_back) return ending(image.sent_back);
    if (!image || !image.ready) {
      last = {
        attempt,
        stopped_at: "image",
        summary: image ? image.summary : "the image loop returned nothing",
      };
      break;
    }
    imageReady = true;
    changedSince = true;
    category = "";
  }

  // Step 2
  if (!dataReady || category === "data") {
    phase("Data");
    const data = await child(
      "training-data",
      () => workflow("training-data", { reason: category || "first attempt", notes, answers }),
      null,
    );
    if (data && data.waiting) return data;
    if (data && data.sent_back) return ending(data.sent_back);
    if (!data || !data.ready) {
      last = {
        attempt,
        stopped_at: "data",
        summary: data ? data.summary : "the data loop returned nothing",
      };
      break;
    }
    dataReady = true;
    changedSince = true;
    category = "";
  }

  // Step 3: what this attempt ran, and what it left to read; `producer` is the child loop that made it.
  let evidence = null;
  let producer = null;
  if (smokeFirst || changedSince || stopAfter === "small-scale") {
    phase("Small-scale check");
    const smokeEvidence = (smoke) => ({
      scale: "small",
      run_id: smoke ? smoke.run_id : "",
      log_file: smoke ? smoke.log_file : "",
      metrics_file: "",
      checkpoints_dir: "",
      outcome: smoke && smoke.passed ? "completed" : "failed",
      summary: smoke ? smoke.summary : "",
    });
    const smokeRun = (back) => workflow("training-smoke", withReturned({ notes, answers }, back));
    const smoke = await child("training-smoke", () => smokeRun(null), null);
    if (smoke && smoke.waiting) return smoke;
    if (smoke && smoke.sent_back) return ending(smoke.sent_back);
    changedSince = false;
    evidence = smokeEvidence(smoke);
    producer = {
      name: "training-smoke",
      again: async (back) => {
        phase("Small-scale check");
        const remade = await child("training-smoke", () => smokeRun(back), null);
        if (!stopped(remade)) evidence = smokeEvidence(remade);
        return remade;
      },
    };
  }

  // Step 4
  if ((!evidence || evidence.outcome === "completed") && stopAfter !== "small-scale") {
    phase("Training run");
    const runEvidence = (run) => ({
      scale: "production",
      run_id: run ? run.run_id : "",
      log_file: run ? run.log_file : "",
      metrics_file: run ? run.metrics_file : "",
      checkpoints_dir: run ? run.checkpoints_dir : "",
      outcome: run ? run.outcome : "failed",
      summary: run ? run.summary : "",
    });
    const productionRun = (back) => workflow("training-run", withReturned({ notes, answers }, back));
    const run = await child("training-run", () => productionRun(null), null);
    // A run still going comes back as {waiting: "run"}: the session checks back and runs this loop again.
    if (run && run.waiting) return run;
    if (run && run.sent_back) return ending(run.sent_back);
    evidence = runEvidence(run);
    producer = {
      name: "training-run",
      again: async (back) => {
        phase("Training run");
        const remade = await child("training-run", () => productionRun(back), null);
        if (!stopped(remade)) evidence = runEvidence(remade);
        return remade;
      },
    };
  }
  evidence = evidence || {
    scale: "small",
    run_id: "",
    log_file: "",
    metrics_file: "",
    checkpoints_dir: "",
    outcome: "failed",
    summary: "nothing ran in this attempt",
  };
  // A child loop that cannot use the run it is given has the loop that ran it make it again.
  const remakeEvidence = producer ? producer.again : null;

  // Step 5
  let diagnosis = null;
  let rediagnose = null;
  if (evidence.outcome !== "completed") {
    phase("Diagnosis");
    const diagnose = (back) =>
      workflow(
        "training-diagnosis",
        withReturned(
          {
            run_id: evidence.run_id,
            log_file: evidence.log_file,
            scale: evidence.scale,
            notes,
            answers,
          },
          back,
        ),
      );
    const take = (diagnosed) => {
      diagnosis = diagnosed;
      category = diagnosed && diagnosed.category ? diagnosed.category : "unknown";
    };
    const diagnosed = await child("training-diagnosis", () => diagnose(null), remakeEvidence);
    if (diagnosed && diagnosed.waiting) return diagnosed;
    if (diagnosed && diagnosed.sent_back) return ending(diagnosed.sent_back);
    take(diagnosed);
    rediagnose = async (back) => {
      phase("Diagnosis");
      const remade = await child("training-diagnosis", () => diagnose(back), remakeEvidence);
      if (!stopped(remade)) take(remade);
      return remade;
    };
  }

  // Step 6
  let selected = null;
  let benchmarked = null;
  let rebenchmark = null;
  if (
    evidence.outcome === "completed" &&
    evidence.scale === "production" &&
    stopAfter === "benchmark"
  ) {
    phase("Checkpoints");
    const select = (back) =>
      workflow(
        "checkpoint-select",
        withReturned(
          {
            run_id: evidence.run_id,
            log_file: evidence.log_file,
            metrics_file: evidence.metrics_file,
            params: { top_k: topK },
            answers,
          },
          back,
        ),
      );
    const sel = await child("checkpoint-select", () => select(null), remakeEvidence);
    if (sel && sel.waiting) return sel;
    if (sel && sel.sent_back) return ending(sel.sent_back);
    selected = sel;
    const reselect = async (back) => {
      phase("Checkpoints");
      const remade = await child("checkpoint-select", () => select(back), remakeEvidence);
      if (!stopped(remade)) selected = remade;
      return remade;
    };
    phase("Benchmark");
    const benchmark = (back) =>
      workflow(
        "model-benchmark",
        withReturned(
          {
            candidates: selected && selected.usable ? selected.usable : [],
            run_id: evidence.run_id,
            answers,
          },
          back,
        ),
      );
    const bench = await child("model-benchmark", () => benchmark(null), reselect);
    if (bench && bench.waiting) return bench;
    if (bench && bench.sent_back) return ending(bench.sent_back);
    benchmarked = bench;
    rebenchmark = async (back) => {
      phase("Benchmark");
      const remade = await child("model-benchmark", () => benchmark(back), reselect);
      if (!stopped(remade)) benchmarked = remade;
      return remade;
    };
  }

  // Step 7: what Record cannot use is made again by the child loop that gave it.
  phase("Record");
  const sources = {};
  if (producer) sources[producer.name] = producer.again;
  if (rediagnose) sources["training-diagnosis"] = rediagnose;
  if (rebenchmark) sources["model-benchmark"] = rebenchmark;
  const targets = Object.keys(sources);
  const recorded = await step(
    "project-memory:record",
    () =>
      agent(
        JSON.stringify({
          action: "record",
          what: `attempt ${attempt}: a ${evidence.scale} run, ${evidence.run_id}`,
          outcome: evidence.outcome === "completed" ? "worked" : "failed",
          evidence: [
            evidence.summary,
            diagnosis ? diagnosis.summary : "",
            benchmarked ? benchmarked.summary : "",
          ],
        }),
        {
          agentType: "project-memory",
          schema: sending(RECORDED, targets.length ? targets : ["caller"]),
          phase: "Record",
        },
      ),
    sources,
  );
  if (recorded.waiting) return recorded;
  if (recorded.sent_back) return ending(recorded.sent_back);
  last = { attempt, evidence, diagnosis, selected, benchmarked };

  // Step 8: the review names the run it is of, so a later attempt never takes an answer meant for this one.
  phase("Review");
  const id = `attempt:${evidence.run_id}:${attempt}`;
  const decided = await agent(
    JSON.stringify({
      review_id: id,
      subject: `attempt ${attempt}: what the ${evidence.scale} run did, and what comes next`,
      request: "Approve this as the result, say what to do differently, or cancel the work.",
      materials: last,
      approvable: Boolean(benchmarked),
      answer: answers[id] ?? null,
    }),
    { agentType: "owner-review", schema: REVIEW, phase: "Review" },
  );
  if (decided.decision === "ask")
    return {
      waiting: "owner",
      review_id: id,
      question: decided.question,
      document: decided.document,
    };
  if (decided.decision === "approve") return { done: true, ...last };
  if (decided.decision === "cancel")
    return { done: false, reason: "the owner stopped the work", ...last };
  notes = decided.notes;

  // Step 9: a diagnosis the fix cannot use is made again before the fix runs again.
  if (category === "code" || category === "performance" || category === "hyperparameters") {
    phase("Fix");
    const fix = (back) =>
      workflow(
        "training-fix",
        withReturned(
          {
            category,
            cause: diagnosis ? diagnosis.cause : "",
            report_file: diagnosis ? diagnosis.report_file : "",
            notes,
            answers,
          },
          back,
        ),
      );
    const fixed = await child("training-fix", () => fix(null), rediagnose);
    if (fixed && fixed.waiting) return fixed;
    if (fixed && fixed.sent_back) return ending(fixed.sent_back);
    changedSince = true;
    notes = fixed && fixed.summary ? fixed.summary : notes;
    // A fix that only works with a different image sends the next attempt back to the image.
    category = fixed && fixed.needs_image ? "image" : "";
  }
  if (category === "image") imageReady = false;
  if (category === "data") dataReady = false;
}
return {
  done: false,
  reason: `no result was approved within ${maxAttempts} attempts`,
  ...(last || {}),
};

// contrejour-loop-definition-sha256: 2dd0ebd29157c8230251b31ac611caf3410b4e7992fc9a0153b508448d58095c

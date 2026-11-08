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

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  // Step 1
  if (!imageReady || category === "image") {
    phase("Image");
    const image = await workflow("training-image", {
      reason: category || "first attempt",
      notes,
      answers,
    });
    if (image && image.waiting) return image;
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
    const data = await workflow("training-data", {
      reason: category || "first attempt",
      notes,
      answers,
    });
    if (data && data.waiting) return data;
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

  // Step 3: what this attempt ran, and what it left to read.
  let evidence = null;
  if (smokeFirst || changedSince || stopAfter === "small-scale") {
    phase("Small-scale check");
    const smoke = await workflow("training-smoke", { notes, answers });
    if (smoke && smoke.waiting) return smoke;
    changedSince = false;
    evidence = {
      scale: "small",
      run_id: smoke ? smoke.run_id : "",
      log_file: smoke ? smoke.log_file : "",
      metrics_file: "",
      checkpoints_dir: "",
      outcome: smoke && smoke.passed ? "completed" : "failed",
      summary: smoke ? smoke.summary : "",
    };
  }

  // Step 4
  if ((!evidence || evidence.outcome === "completed") && stopAfter !== "small-scale") {
    phase("Training run");
    const run = await workflow("training-run", { notes, answers });
    // A run still going comes back as {waiting: "run"}: the session checks back and runs this loop again.
    if (run && run.waiting) return run;
    evidence = {
      scale: "production",
      run_id: run ? run.run_id : "",
      log_file: run ? run.log_file : "",
      metrics_file: run ? run.metrics_file : "",
      checkpoints_dir: run ? run.checkpoints_dir : "",
      outcome: run ? run.outcome : "failed",
      summary: run ? run.summary : "",
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

  // Step 5
  let diagnosis = null;
  if (evidence.outcome !== "completed") {
    phase("Diagnosis");
    const diagnosed = await workflow("training-diagnosis", {
      run_id: evidence.run_id,
      log_file: evidence.log_file,
      scale: evidence.scale,
      notes,
      answers,
    });
    if (diagnosed && diagnosed.waiting) return diagnosed;
    diagnosis = diagnosed;
    category = diagnosed && diagnosed.category ? diagnosed.category : "unknown";
  }

  // Step 6
  let selected = null;
  let benchmarked = null;
  if (
    evidence.outcome === "completed" &&
    evidence.scale === "production" &&
    stopAfter === "benchmark"
  ) {
    phase("Checkpoints");
    const sel = await workflow("checkpoint-select", {
      run_id: evidence.run_id,
      log_file: evidence.log_file,
      metrics_file: evidence.metrics_file,
      params: { top_k: topK },
      answers,
    });
    if (sel && sel.waiting) return sel;
    selected = sel;
    phase("Benchmark");
    const bench = await workflow("model-benchmark", {
      candidates: sel && sel.usable ? sel.usable : [],
      run_id: evidence.run_id,
      answers,
    });
    if (bench && bench.waiting) return bench;
    benchmarked = bench;
  }

  // Step 7
  phase("Record");
  await agent(
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
    { agentType: "project-memory", schema: RECORDED, phase: "Record" },
  );
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

  // Step 9
  if (category === "code" || category === "performance" || category === "hyperparameters") {
    phase("Fix");
    const fixed = await workflow("training-fix", {
      category,
      cause: diagnosis ? diagnosis.cause : "",
      report_file: diagnosis ? diagnosis.report_file : "",
      notes,
      answers,
    });
    if (fixed && fixed.waiting) return fixed;
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

// contrejour-loop-definition-sha256: 8e6225250cc89fcff0dca3ef11ac4e0ee7d1abdf72d653eaf61a5765de430f4f

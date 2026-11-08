export const meta = {
  name: "model-benchmark",
  description:
    "Run the project's benchmark suite on the candidate checkpoints and judge the results against the task's target and the project's own history, the running kept apart from the judging",
  whenToUse:
    'Run it with {"candidates": ["the checkpoints to benchmark"], "run_id": "the run they came from"}.',
  phases: [{ title: "Benchmark" }, { title: "Judge" }, { title: "Record" }],
};

const STRINGS = { type: "array", items: { type: "string" } };
const BENCHMARKED = {
  type: "object",
  properties: {
    results: STRINGS,
    completed: { type: "boolean" },
    not_run: STRINGS,
    infrastructure_failure: { type: "boolean" },
    report_file: { type: "string" },
    settings: { type: "string" },
  },
  required: ["results", "completed", "not_run", "infrastructure_failure", "report_file", "settings"],
};
const JUDGED = {
  type: "object",
  properties: {
    meets_target: { type: "boolean" },
    best: { type: "string" },
    comparison: STRINGS,
    regressions: STRINGS,
    summary: { type: "string" },
  },
  required: ["meets_target", "best", "comparison", "regressions", "summary"],
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
const suite = typeof params.suite === "string" ? params.suite : "";
const sampleLimit = Number.isInteger(params.sample_limit) ? params.sample_limit : 0;
const maxRounds = Number.isInteger(params.max_rounds) ? params.max_rounds : 2;
const candidates = Array.isArray(input.candidates) ? input.candidates : [];
const runId = input.run_id || "";

let benchmarked = null;
for (let round = 1; round <= maxRounds; round += 1) {
  // Step 1
  phase("Benchmark");
  benchmarked = await agent(
    JSON.stringify({
      action: "benchmark",
      candidates,
      suite,
      sample_limit: sampleLimit,
      run_id: runId,
      round,
    }),
    { agentType: "benchmark-runner", schema: BENCHMARKED, phase: "Benchmark" },
  );
  // Only a failure that is not the model's is worth running again.
  if (benchmarked.completed || !benchmarked.infrastructure_failure) break;
}

// Step 2
phase("Judge");
const judged = await agent(
  JSON.stringify({
    action: "judge",
    results: benchmarked.results,
    settings: benchmarked.settings,
    report_file: benchmarked.report_file,
    run_id: runId,
  }),
  { agentType: "benchmark-judge", schema: JUDGED, phase: "Judge" },
);

// Step 3
phase("Record");
await agent(
  JSON.stringify({
    action: "record",
    what: `the benchmark of ${runId}: ${judged.best}`,
    outcome: judged.meets_target ? "worked" : "failed",
    evidence: [...benchmarked.results, ...judged.comparison, ...judged.regressions],
  }),
  { agentType: "project-memory", schema: RECORDED, phase: "Record" },
);
return {
  results: benchmarked.results,
  not_run: benchmarked.not_run,
  best: judged.best,
  meets_target: judged.meets_target,
  regressions: judged.regressions,
  report_file: benchmarked.report_file,
  summary: judged.summary,
};

// contrejour-loop-definition-sha256: 0ca16491bc8d3527b7b43459b529bdcc453e77363fa6a8038b56a940f69e21d7

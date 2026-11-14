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

const bench = (round, back) =>
  agent(
    JSON.stringify({
      action: "benchmark",
      candidates,
      suite,
      sample_limit: sampleLimit,
      run_id: runId,
      round,
      returned: back,
    }),
    { agentType: "benchmark-runner", schema: sending(BENCHMARKED, ["caller"]), phase: "Benchmark" },
  );
let benchmarked = null;
for (let round = 1; round <= maxRounds; round += 1) {
  // Step 1: a result the calling loop sent back is what the first benchmark redoes.
  phase("Benchmark");
  benchmarked = await step("benchmark-runner:benchmark", () =>
    bench(round, round === 1 ? input.returned || null : null),
  );
  if (benchmarked.sent_back) return { meets_target: false, sent_back: benchmarked.sent_back };
  // Only a failure that is not the model's is worth running again.
  if (benchmarked.completed || !benchmarked.infrastructure_failure) break;
}
const rebench = async (back) => {
  const again = await step("benchmark-runner:benchmark", () => bench(maxRounds, back));
  if (!again.sent_back) benchmarked = again;
  return again;
};

// Step 2
phase("Judge");
const judge = (back) =>
  agent(
    JSON.stringify({
      action: "judge",
      results: benchmarked.results,
      settings: benchmarked.settings,
      report_file: benchmarked.report_file,
      run_id: runId,
      returned: back,
    }),
    {
      agentType: "benchmark-judge",
      schema: sending(JUDGED, ["benchmark-runner:benchmark"]),
      phase: "Judge",
    },
  );
let judged = await step("benchmark-judge:judge", () => judge(null), {
  "benchmark-runner:benchmark": rebench,
});
if (judged.sent_back) return { meets_target: false, sent_back: judged.sent_back };
const rejudge = async (back) => {
  const again = await step("benchmark-judge:judge", () => judge(back), {
    "benchmark-runner:benchmark": rebench,
  });
  if (!again.sent_back) judged = again;
  return again;
};

// Step 3
phase("Record");
const recorded = await step(
  "project-memory:record",
  () =>
    agent(
      JSON.stringify({
        action: "record",
        what: `the benchmark of ${runId}: ${judged.best}`,
        outcome: judged.meets_target ? "worked" : "failed",
        evidence: [...benchmarked.results, ...judged.comparison, ...judged.regressions],
      }),
      {
        agentType: "project-memory",
        schema: sending(RECORDED, ["benchmark-judge:judge"]),
        phase: "Record",
      },
    ),
  { "benchmark-judge:judge": rejudge },
);
if (recorded.sent_back) return { meets_target: false, sent_back: recorded.sent_back };
return {
  results: benchmarked.results,
  not_run: benchmarked.not_run,
  best: judged.best,
  meets_target: judged.meets_target,
  regressions: judged.regressions,
  report_file: benchmarked.report_file,
  summary: judged.summary,
};

// contrejour-loop-definition-sha256: 0328a3d2180f26f55e5b24a476d1c74138fe212462d6119fd03f29eee1f1d56a

---
name: model-benchmark
description: Benchmark the candidate checkpoints on the project's own suite and judge the results against what the task asks for and what the project already had — the run that produces the numbers kept apart from the judgement of them.
side: framework
kind: on-request
triggers: record-trajectory
check-args: [{"candidates": ["step-1000"], "run_id": "r-1"}]
trial-args: {"candidates": [], "run_id": "", "params": {"sample_limit": 8, "max_rounds": 1}}
---

# Model benchmark

## Purpose

A training curve says the model learned something; a benchmark says whether it learned what the task asked for. This loop runs the project's own suite on the candidates and then judges the numbers — two steps, by two roles, on purpose: the role that produces a number should not be the one that decides whether it is good enough, which is the same separation the framework keeps between building and checking.

The judgement is against two things. The task's own target, which `task.md` states, and the project's own history, because a model that gained three points on the target while losing ten somewhere else has not improved. A benchmark that could not be run is reported as that, and never as a bad result: an adapter that would not load and a model that answers badly are different findings, and a run with a sample limit is never compared against a full one.

Which suite, how a checkpoint is served to it and where its results land are the project's: a role reads them from the project's own environment.

## Inputs

- `candidates`: the checkpoints to benchmark; empty means the project's most recent usable one.
- `run_id`: the run they came from.
- `params`: this loop's parameter values.
- `returned`: when the calling loop sent this loop's result back, what it could not use; the first benchmark redoes it.

## Steps

1. **Benchmark** — `benchmark-runner` runs the suite on each candidate (`{action: "benchmark", candidates, suite, sample_limit, run_id, round}`) and reports each result with how it was obtained, which candidates could not be run, and where the raw results are. When nothing could be run for a reason that is not the model's and rounds are left, it runs again.
2. **Judge** — `benchmark-judge` judges the results (`{action: "judge", results, report_file, run_id}`) against what the task asks for and what the project recorded before: which candidate is best, whether it meets the target, what moved and what went backwards.
3. **Record** — `project-memory` records the benchmark (`{action: "record", what, outcome, evidence}`): the numbers, under which settings, and the judgement of them.

## Bounds

At most `max_rounds` benchmark rounds; at most 2 send-backs in a row by any step.

## Send back

Every step checks what it receives against its role's Inputs. A step that cannot use an input sends it back (`send_back`) to the step that made it, which runs again with `returned` (that step and its problems); then the step runs again on what it makes. Judge may send the benchmark's results back to Benchmark; Record may send the judgement back to Judge. Benchmark may send the candidates it was given back to the caller. Past 2 send-backs in a row, or when what a step cannot use is the loop's own input, the loop ends with `sent_back`: the step, where it sent the input, and the problems.

## Parameters

```json
[
  {
    "name": "suite",
    "type": "string",
    "default": "",
    "description": "Which of the project's benchmark suites to run; empty means the one the project's rules name as its own."
  },
  {
    "name": "sample_limit",
    "type": "integer",
    "default": 0,
    "min": 0,
    "max": 100000,
    "description": "Use at most this many samples per suite, 0 for all of them; a limited run is never compared with a full one."
  },
  {
    "name": "max_rounds",
    "type": "integer",
    "default": 2,
    "min": 1,
    "max": 4,
    "description": "How many times the benchmark is run again when it could not be run for a reason that is not the model's."
  }
]
```

## Waiting

Nothing in this loop waits.

## Triggers

- `record-trajectory`: every role that finishes leaves its trajectory.

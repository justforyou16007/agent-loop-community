---
name: model-training
description: Train a model in attempts — the image, the data, a small-scale check of the training code, the production run with its logs, a diagnosis of whatever went wrong, the fix its class calls for, and the checkpoints with their benchmark — stopping for the owner at the end of every attempt.
side: framework
kind: task
triggers: record-trajectory, guard-owner-answers
check-args: [{}, {"params": {"stop_after": "small-scale", "max_attempts": 1}}]
trial-args: {"params": {"max_attempts": 1, "stop_after": "small-scale", "smoke_first": true}}
---

# Model training

## Purpose

Training a model is a cycle, not a sequence: what a run leaves in its logs decides what the next run changes. This loop runs that cycle. An attempt gets the image and the data ready, proves the training code runs at a small scale, trains at production scale, and reads what the run left. When the run did not finish, the failure is located and classified, and the class decides where the next attempt starts: an image fault goes back to building the image, a data fault to validating the data, a code bug to the fix that matches it against the upstream repository's own fix, and performance and hyperparameters to their own planners. When the run did finish, the checkpoints worth the cost are picked and benchmarked. The owner sees every attempt and decides whether the work goes on.

Each stage is a loop of its own, so it can be run and tried alone; this loop only orders them and routes on what they report. Nothing here names a machine, a path, an image registry, a dataset or a launch command: a role reads those from the project's own environment (its environment skill, or the rules in `project-rules.md`), which is why the same loop serves any training stack.

## Inputs

- `params`: the parameter values the owner chose in the Studio.
- `answers`: the owner's replies so far, by review id; the session adds each one as it comes (see `running-loops.md`).

## Steps

1. **Image** — on the first attempt, and whenever the last diagnosis blamed the image, the child loop `training-image` builds or repairs the image and verifies it runs the training stack (`{reason, notes}`). An image that cannot be made ready ends the loop with what blocked it.
2. **Data** — on the first attempt, and whenever the last diagnosis blamed the data, the child loop `training-data` validates what the data preparation produced (`{reason, notes}`). Data that cannot be made ready ends the loop with the problems found.
3. **Small-scale check** — when `smoke_first` is set, when anything changed since the last check, or when `stop_after` is `small-scale`, the child loop `training-smoke` runs the training code at a small scale (`{notes}`). What it leaves is this attempt's evidence.
4. **Training run** — unless `stop_after` is `small-scale`, and only when the small-scale check passed or was skipped, the child loop `training-run` launches the production run, watches it and fetches its logs (`{notes}`). A run still going when its checks run out comes back as `{waiting: "run", ...}`, returned as it is.
5. **Diagnosis** — when the attempt's run did not finish, the child loop `training-diagnosis` locates the failure in the logs, classifies it and tries to reproduce it (`{run_id, log_file, scale, notes}`). Its `category` is what step 9 and the next attempt route on.
6. **Checkpoints and benchmark** — when the production run finished and `stop_after` is `benchmark`, the child loop `checkpoint-select` picks at most `benchmark_top_k` checkpoints worth evaluating and checks they load (`{run_id, log_file, metrics_file}`), and the child loop `model-benchmark` benchmarks the usable ones and judges them against the task's target (`{candidates, run_id}`).
7. **Record** — `project-memory` records the attempt (`{action: "record", what, outcome, evidence}`): what it ran, what came of it, and what the diagnosis or the benchmark said.
8. **Review** — `owner-review` puts the attempt to the owner (`review_id` `attempt:<run_id>:<attempt>`, which names the run under review): approval ends the loop with the result, `cancel` ends it, and `revise` carries the owner's words into the next attempt as `notes`. Approval is offered only when there is a benchmarked result.
9. **Fix** — when the class is `code`, `performance` or `hyperparameters`, the child loop `training-fix` makes the change that class calls for (`{category, cause, report_file, notes}`). A fix that only works with a different image reports `needs_image`, and the next attempt starts at step 1. A class of `image` or `data` sends the next attempt to step 1 or step 2 instead, and `environment` or `unknown` goes no further than the owner's words, since neither is the project's to repair.

## Bounds

At most `max_attempts` attempts; every attempt ends at the owner's review. Each child loop keeps its own bounds.

## Parameters

```json
[
  {
    "name": "max_attempts",
    "type": "integer",
    "default": 3,
    "min": 1,
    "max": 6,
    "description": "How many attempts — image, data, small-scale check, run, diagnosis, fix — the loop makes before it ends without an approved result."
  },
  {
    "name": "smoke_first",
    "type": "boolean",
    "default": true,
    "description": "Run the small-scale check before every production run, not only after something changed."
  },
  {
    "name": "benchmark_top_k",
    "type": "integer",
    "default": 2,
    "min": 1,
    "max": 5,
    "description": "How many of a finished run's checkpoints are picked for the benchmark."
  },
  {
    "name": "stop_after",
    "type": "enum",
    "choices": ["small-scale", "production", "benchmark"],
    "default": "benchmark",
    "description": "Where an attempt stops: after the small-scale check, after the production run, or after the benchmark."
  }
]
```

## Waiting

- Step 8 waits for the owner, and steps 1 to 6 wait for the owner inside their child loops: the loop returns `{waiting: "owner", review_id, question, document}`, and the session runs it again with the reply in `answers`.
- Step 4 waits for a training run that is still going: the loop returns `{waiting: "run", run_id, log_file, check_after_minutes, note}`. The session waits that long, then runs the loop again with the same arguments and every answer it already has; the run is read again rather than launched again.

## Triggers

- `record-trajectory`: every role that finishes leaves its trajectory.
- `guard-owner-answers`: every answer the session passes in is the owner's own message, typed after the loop stopped at that review; anything else is blocked before the loop runs.

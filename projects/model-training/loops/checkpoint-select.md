---
name: checkpoint-select
description: Pick the checkpoints of a finished run that are worth benchmarking — from what the run's own metrics show rather than from the last step — and prove each one loads before any benchmark time is spent on it.
side: framework
kind: on-request
triggers: record-trajectory
check-args: [{"run_id": "r-1", "log_file": "logs/r-1.log", "metrics_file": "logs/r-1.json"}]
trial-args: {"run_id": "", "log_file": "", "metrics_file": "", "params": {"max_rounds": 1}}
---

# Checkpoint selection

## Purpose

The last checkpoint is not the best one, and the one with the lowest training loss often is not either. A run leaves dozens, benchmarking each is unaffordable, and the choice has to come from what the run itself recorded: where the held-out metric turned, where the loss curve stopped moving, which steps came after the learning rate decayed, and which ones were written while something was already going wrong. This loop makes that choice explicit — the basis for each candidate, and what was excluded and why — so a benchmark result can be traced back to a reason for picking that step.

It then loads each candidate before handing it on. A truncated write, a shard missing from a sharded save, a precision or parallelism layout the evaluation path cannot read: all of these look like a bad model in a benchmark result, and all of them are cheap to catch here. A candidate that does not load is excluded and the selection is made again without it.

Where the checkpoints are, how they are named and how one is loaded are the project's: a role reads them from the project's own environment.

## Inputs

- `run_id`: the finished run, or empty for the project's most recent one.
- `log_file`, `metrics_file`: what the run left, when the caller already knows them.
- `params`: this loop's parameter values.

## Steps

1. **Select** — `checkpoint-selector` picks at most `top_k` candidates (`{action: "select", run_id, log_file, metrics_file, top_k, excluded, round}`) from what the run's metrics show, with the basis for each and what it left out.
2. **Check** — `checkpoint-checker` loads each candidate the way the evaluation path will (`{action: "check", candidates, run_id}`) and reports which are usable and which are broken, with the real error for each. When a candidate is broken and rounds are left, the loop goes back to step 1 with it excluded.
3. **Record** — `project-memory` records the selection (`{action: "record", what, outcome, evidence}`): which steps were picked, on what basis, and which were broken.

## Bounds

At most `max_rounds` rounds of selection and loading.

## Parameters

```json
[
  {
    "name": "top_k",
    "type": "integer",
    "default": 2,
    "min": 1,
    "max": 5,
    "description": "How many checkpoints are picked for the benchmark."
  },
  {
    "name": "max_rounds",
    "type": "integer",
    "default": 2,
    "min": 1,
    "max": 4,
    "description": "How many times the selection is redone when a candidate does not load."
  }
]
```

## Waiting

Nothing in this loop waits.

## Triggers

- `record-trajectory`: every role that finishes leaves its trajectory.

---
name: training-smoke
description: Run the training code at a small scale — a few steps, a small model, a small batch — to prove the code, the image, the data and the launch arguments work together before production-scale time is spent, and tell a code failure from an infrastructure one.
side: framework
kind: on-request
triggers: record-trajectory
check-args: [{"notes": ""}]
trial-args: {"notes": "", "params": {"steps": 2, "max_rounds": 1}}
---

# Training smoke run

## Purpose

A production run that dies in its first minutes costs a queue slot and an hour of waiting to learn what a two-minute run would have said. This loop is that two-minute run: the project's own training entry point, at the smallest scale that still exercises the real path — the real launcher, the real data loader, a few optimizer steps, a checkpoint written and read back. It distinguishes the two failures that look alike in a log: the code is wrong, or the run never got to the code (a node that would not allocate, a mount missing, a queue that rejected it). An infrastructure failure is retried while rounds are left; a code failure is reported, for the diagnosis to classify.

The entry point, the scale that counts as small here and how a run is launched are the project's: a role reads them from the project's own environment.

## Inputs

- `notes`: what the owner, the last diagnosis or the last fix said, verbatim.
- `params`: this loop's parameter values.

## Steps

1. **Run** — `smoke-runner` runs the training code at a small scale (`{action: "run", steps, round, notes}`): `steps` optimizer steps through the project's own entry point, with the real image and the prepared data. It reports its verdict — it passed, the code failed, or the run never started — with the run's id, its log and the real output.
2. When the verdict is that the run never started and rounds are left, the loop runs it again; a code failure or a pass goes on.
3. **Record** — `project-memory` records the round (`{action: "record", what, outcome, evidence}`): whether the code runs at this scale, and what stopped it.

## Bounds

At most `max_rounds` runs.

## Parameters

```json
[
  {
    "name": "steps",
    "type": "integer",
    "default": 20,
    "min": 1,
    "max": 200,
    "description": "How many optimizer steps the small-scale run does."
  },
  {
    "name": "max_rounds",
    "type": "integer",
    "default": 2,
    "min": 1,
    "max": 4,
    "description": "How many times a run that never started is tried again."
  }
]
```

## Waiting

Nothing in this loop waits: a small-scale run is short enough to finish inside it.

## Triggers

- `record-trajectory`: every role that finishes leaves its trajectory.

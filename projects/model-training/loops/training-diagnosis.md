---
name: training-diagnosis
description: Find out what a failed run failed of — collect its logs, locate the first real error and what it came from, classify it as the image, the data, the code, performance, hyperparameters, the environment or unknown, and confirm the classification by reproducing it at a small scale.
side: framework
kind: on-request
triggers: record-trajectory
check-args: [{"run_id": "r-1", "log_file": "logs/r-1.log", "scale": "production", "notes": ""}]
trial-args: {"run_id": "", "log_file": "", "scale": "small", "notes": "", "params": {"reproduce": false, "max_rounds": 1}}
---

# Training diagnosis

## Purpose

A training log does not say what went wrong; it says what happened last. The real error is usually thousands of lines above the traceback that killed the job, on one rank out of hundreds, and the line that looks like the cause is often a consequence — an out-of-memory error from a batch that only grew because an earlier step silently fell back to a slower path. This loop separates locating from classifying from confirming. It collects the run's logs, finds the first error that is not a consequence of another, says what it came from, and gives the class the loop above routes on. Then, unless told not to, it tries to reproduce that failure at a small scale: a diagnosis that reproduces is worth a fix, and one that does not is worth another look, which is why a contradicted analysis goes round again instead of becoming a fix.

The class is what the next attempt acts on, so it is deliberately about where the repair belongs, not about what the error message says: `image` when the fix is a different image, `data` when it is the prepared data, `code` when it is the training code, `performance` when the run works but too slowly or too expensively, `hyperparameters` when it runs and learns badly, `environment` when neither the project nor its code can repair it, and `unknown` when the evidence does not support any of these.

## Inputs

- `run_id`: the run to diagnose, or empty for the project's most recent run.
- `log_file`: its log, when the caller already knows it.
- `scale`: `small` or `production`, which says how much the run proves.
- `notes`: what the owner said, verbatim.
- `params`: this loop's parameter values.

## Steps

1. **Collect** — `log-collector` fetches the run's logs and metrics into the project (`{action: "collect", run_id, log_file}`) and reports where they are, the errors in them and the last step reached.
2. **Localize** — `failure-analyst` reads them (`{action: "analyze", run_id, log_file, metrics_file, errors, round, notes, contradiction}`): the first real error, which rank and which stage it came from, the class it belongs to, and the evidence for it, with how sure it is. It writes the diagnosis report.
3. **Reproduce** — when `reproduce` is set and the analysis is not already certain, `fault-reproducer` tries to make the same failure happen at the smallest scale that would show it (`{action: "reproduce", category, cause, evidence, report_file}`). What it finds either confirms the analysis or contradicts it; a contradiction goes back to step 2 while rounds are left.
4. **Record** — `project-memory` records the diagnosis (`{action: "record", what, outcome, evidence}`): the class, the cause and whether it reproduced.

## Bounds

At most `max_rounds` rounds of analysis and reproduction.

## Parameters

```json
[
  {
    "name": "max_rounds",
    "type": "integer",
    "default": 2,
    "min": 1,
    "max": 4,
    "description": "How many times the analysis is redone when a reproduction contradicts it."
  },
  {
    "name": "reproduce",
    "type": "boolean",
    "default": true,
    "description": "Confirm the diagnosis by reproducing the failure at a small scale before it becomes a fix."
  }
]
```

## Waiting

Nothing in this loop waits: it reports the class it found, and the loop that runs it puts the diagnosis to the owner before anything is changed.

## Triggers

- `record-trajectory`: every role that finishes leaves its trajectory.

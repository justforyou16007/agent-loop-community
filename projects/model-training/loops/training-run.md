---
name: training-run
description: Launch the production-scale training run, watch it while it goes, and fetch its logs and metrics when it ends — reporting a run that is still going so the session can check back instead of holding the loop open.
side: framework
kind: on-request
triggers: record-trajectory
check-args: [{"notes": ""}]
---

# Training run

## Purpose

The production run is the one that costs: many accelerators for many hours, where a mistake is expensive and an unnoticed stall is worse than a crash. This loop launches it through the project's own launcher, names it so several runs can be told apart, and then watches it — step rate, loss, memory, the errors a log shows while a run is still alive — rather than waiting blindly for an exit code. A run that ends, well or badly, has its logs and metrics fetched into the project, which is what every later stage reads: the diagnosis, the checkpoint selection and the benchmark all work from those files, not from a role's memory of the run.

Training for hours does not fit in one loop run, and a loop may not sleep through it. So when the watches run out and the run is still going, the loop stops and says so: the session comes back after `check_after_minutes` and runs it again, and the run is read, not launched again.

## Inputs

- `notes`: what the owner, the last diagnosis or the last fix said, verbatim.
- `params`: this loop's parameter values.

## Steps

1. **Launch** — `run-launcher` launches the production run through the project's own launcher (`{action: "launch", notes}`), or reports the run already going for this configuration rather than starting a second one. It returns the run's id, its log file and where its checkpoints go. A launch that failed ends the loop with the real error.
2. **Watch** — `run-watcher` reads the run once (`{action: "check", run_id, log_file, check}`): whether it still runs, the step it reached, its rate, its loss, and the errors its log already shows. While it still runs and checks are left, it is read again; a run that stopped or finished goes on. A run still going when the checks run out ends the loop with `{waiting: "run", ...}`.
3. **Collect** — `log-collector` fetches the run's logs and metrics into the project (`{action: "collect", run_id, log_file}`) and reports where they are, the errors in them and the last step reached.
4. **Record** — `project-memory` records the run (`{action: "record", what, outcome, evidence}`): what was launched, how it ended and where its files are.

## Bounds

At most `max_checks` watches in one run of this loop; the session may run it again while the run goes on.

## Parameters

```json
[
  {
    "name": "max_checks",
    "type": "integer",
    "default": 6,
    "min": 1,
    "max": 60,
    "description": "How many times a run is read before the loop hands the waiting back to the session."
  },
  {
    "name": "check_after_minutes",
    "type": "integer",
    "default": 15,
    "min": 1,
    "max": 240,
    "description": "How long the session waits before running this loop again for a run that is still going."
  }
]
```

## Waiting

Step 2 waits for the run itself: the loop returns `{waiting: "run", run_id, log_file, check_after_minutes, note}`. The session waits that long and runs the loop again with the same arguments; `run-launcher` finds the run already going and the loop goes on watching it. No parameter of this loop ever starts a second run for the same configuration.

## Triggers

- `record-trajectory`: every role that finishes leaves its trajectory.

---
name: training-fix
description: Make the change the failure's class calls for — a code bug matched against the upstream repository's own fix and aligned to the version the training environment pins, a performance change planned from what the run measured, or a hyperparameter change planned from what it learned — and say when the change needs a different image.
side: framework
kind: on-request
triggers: record-trajectory
check-args: [{"category": "code", "cause": "a stub cause", "report_file": "reports/d-1.md", "notes": ""}, {"category": "performance", "cause": "a stub cause", "report_file": "reports/d-1.md", "notes": ""}, {"category": "hyperparameters", "cause": "a stub cause", "report_file": "reports/d-1.md", "notes": ""}]
trial-args: {"category": "code", "cause": "a trial cause", "report_file": "", "notes": "", "params": {"take_upstream": false}}
---

# Training fix

## Purpose

Three kinds of repair share one shape — work out the change, make it, write down why — and differ only in who works it out, so they are one loop with three planners rather than three loops.

A **code** bug is rarely this project's alone. Someone upstream has usually hit the same error, and the repository holds the issue, the pull request or the commit that fixed it. So the code path looks there first, and the hard part is not finding the fix but deciding whether it applies: the training environment pins a version, the fix may be against a later one, and the patch that lands cleanly on the upstream tree may touch code this project has already changed. That is why finding and aligning are two steps, and why aligning reports when a fix cannot work without a different image — the loop above then goes back to building the image, instead of training again against an image the fix needs more than the code.

**Performance** is planned from what the run measured, not from what is generally fast: where the time actually went, what the accelerators were waiting for, which change the measurement supports. **Hyperparameters** are planned from what the run learned, and against what the project's memory says was already tried, so the same learning rate is not tried twice without saying what is different.

What the project's checkout is, what version it pins, and where the launch configuration lives are the project's: a role reads them from the project's own environment.

## Inputs

- `category`: `code`, `performance` or `hyperparameters` — the class the diagnosis gave.
- `cause`: the cause the diagnosis found, verbatim.
- `report_file`: the diagnosis report.
- `notes`: what the owner said, verbatim.
- `params`: this loop's parameter values.

## Steps

1. **Plan** — by class:
   - `code`: `upstream-scout` searches the upstream repository for the same failure (`{action: "scout", cause, report_file, notes}`): the issue, pull request or commit that matches it, whether it applies to the version the training environment pins, and what the change would be here.
   - `performance`: `performance-tuner` plans the change from what the run measured (`{action: "plan", cause, report_file, notes}`) and writes it into the project's launch configuration.
   - `hyperparameters`: `hyperparameter-tuner` plans the change from what the run learned and what the project's memory says was already tried (`{action: "plan", cause, report_file, notes}`) and writes it into the project's launch configuration.
2. **Apply** — for a code fix, and only when `take_upstream` is set and the scout found one that applies, `patch-aligner` brings it into this project's checkout (`{action: "apply", source, reference, local_change, cause}`): the change against the version this project pins rather than the upstream tree, the conflicts with what this project has changed itself, and whether it needs a different image. With `take_upstream` unset, the reference is reported and nothing is changed.
3. **Record** — `project-memory` records the fix (`{action: "record", what, outcome, evidence}`): what was changed, on whose evidence, and what it is expected to do.

## Bounds

One change per run of this loop. The small-scale check of the loop above is what proves it, so nothing here runs the training code.

## Parameters

```json
[
  {
    "name": "take_upstream",
    "type": "boolean",
    "default": true,
    "description": "Bring an upstream fix that applies into this project's checkout, instead of only reporting where it is."
  }
]
```

## Waiting

Nothing in this loop waits: the owner has already approved the fix at the review of the loop that runs it.

## Triggers

- `record-trajectory`: every role that finishes leaves its trajectory.

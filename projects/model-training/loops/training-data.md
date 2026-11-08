---
name: training-data
description: Validate what the data preparation produced against what the task requires — format, counts, splits, duplication and leakage, length statistics — and repair what the project's own preparation can repair, until the data is fit to train on.
side: framework
kind: on-request
triggers: record-trajectory
check-args: [{"reason": "first attempt", "notes": ""}]
trial-args: {"reason": "trial", "notes": "", "params": {"repair": false, "max_rounds": 1}}
---

# Training data

## Purpose

A training run cannot tell bad data from a bad model: it will train on a corrupt split, a truncated field or a test set that leaked into training, and only the result will look wrong. This loop checks the prepared data before any accelerator time is spent on it, against what the task asks for rather than against a general idea of clean data. What the project's own preparation can repair — a split redone, duplicates dropped, a field remapped, the preparation re-run — is repaired and then validated again; what it cannot is reported, so the loop that runs this one can put it to the owner.

Where the data is, what prepared it and what the fields mean are the project's: a role reads them from the project's own environment and never guesses a path or a schema.

## Inputs

- `reason`: why the data is being validated — the first attempt, or the class a diagnosis gave (`data`), or the owner's words.
- `notes`: what the owner or the last diagnosis said, verbatim.
- `params`: this loop's parameter values.

## Steps

1. **Validate** — `data-validator` checks the prepared data against the task (`{action: "validate", round, notes, problems}`): that it is there and readable, the counts and splits the task asks for, duplication within and across splits, anything of the evaluation set in the training set, the length and label statistics, and the fields the training code reads. It reports each problem with the evidence and writes its report.
2. **Repair** — when there are problems and `repair` is set, `data-repairer` repairs what the project's own preparation can repair (`{action: "repair", problems, report_file, round}`) and reports what it changed and what it left. Then the loop goes back to step 1 while rounds are left.
3. **Record** — `project-memory` records the round (`{action: "record", what, outcome, evidence}`): what the data got wrong and what was done about it.

## Bounds

At most `max_rounds` rounds of validate and repair.

## Parameters

```json
[
  {
    "name": "max_rounds",
    "type": "integer",
    "default": 2,
    "min": 1,
    "max": 4,
    "description": "How many times the data is validated and repaired before the loop reports what is still wrong."
  },
  {
    "name": "repair",
    "type": "boolean",
    "default": true,
    "description": "Repair what the project's own preparation can repair, instead of only reporting the problems."
  }
]
```

## Waiting

Nothing in this loop waits: what it cannot make ready it reports, and the loop that runs it puts that to the owner.

## Triggers

- `record-trajectory`: every role that finishes leaves its trajectory.

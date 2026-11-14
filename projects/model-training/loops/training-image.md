---
name: training-image
description: Build or repair the training image and verify it actually runs the training stack — the versions the code needs, the accelerators visible, the launcher present — repeating while a verification finds a mismatch.
side: framework
kind: on-request
triggers: record-trajectory
check-args: [{"reason": "first attempt", "notes": ""}]
trial-args: {"reason": "trial", "notes": "", "params": {"verify_only": true, "max_rounds": 1}}
---

# Training image

## Purpose

Most of a training run's early failures are the image's: a library one minor version off, a kernel built for another accelerator, a launcher missing, a pinned dependency that silently resolved to something else. This loop makes the image and then proves it, because a built image is not a working one. It builds from the recipe the project keeps, verifies the image against what the training code actually imports and calls, and goes back to the build with the mismatches the verification found. When the owner only wants the current image proved, `verify_only` skips the build.

The recipe, the registry, the build command and how an image is run are the project's: a role reads them from the project's own environment and never invents them.

## Inputs

- `reason`: why the image is being made — the first attempt, or the class a diagnosis gave (`image`), or the owner's words.
- `notes`: what the owner or the last diagnosis said, verbatim.
- `params`: this loop's parameter values.
- `returned`: when the calling loop sent this loop's result back, what it could not use; the first build redoes it.

## Steps

1. **Build** — unless `verify_only`, `image-builder` builds or updates the image from the project's recipe (`{action: "build", reason, notes, round, mismatches}`) and reports the image, its digest and what changed. A build that cannot be done ends the loop with the real error.
2. **Verify** — `image-verifier` runs the image and checks it against what the training code needs (`{action: "verify", image, digest, round}`): the versions, the accelerators, the launcher, the mounts the project's rules name. It reports each mismatch with the evidence.
3. When mismatches remain and rounds are left, the loop goes back to step 1 with them; otherwise it goes on.
4. **Record** — `project-memory` records the round (`{action: "record", what, outcome, evidence}`): which image was made and what it still gets wrong.

## Bounds

At most `max_rounds` rounds of build and verify; at most 2 send-backs in a row by any step.

## Send back

Every step checks what it receives against its role's Inputs. A step that cannot use an input sends it back (`send_back`) to the step that made it, which runs again with `returned` (that step and its problems); then the step runs again on what it makes. Verify may send the built image back to Build, which builds it again (when the loop only verifies, the image goes back to the caller); Record may send the verification back to Verify. Build may send the reason and notes it was given back to the caller. Past 2 send-backs in a row, or when what a step cannot use is the loop's own input, the loop ends with `sent_back`: the step, where it sent the input, and the problems.

## Parameters

```json
[
  {
    "name": "max_rounds",
    "type": "integer",
    "default": 2,
    "min": 1,
    "max": 4,
    "description": "How many times the image is built and verified before the loop reports what is still wrong."
  },
  {
    "name": "verify_only",
    "type": "boolean",
    "default": false,
    "description": "Verify the image the project already records instead of building one."
  }
]
```

## Waiting

Nothing in this loop waits: what it cannot make ready it reports, and the loop that runs it puts that to the owner.

## Triggers

- `record-trajectory`: every role that finishes leaves its trajectory.

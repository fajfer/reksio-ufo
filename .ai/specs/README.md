# Specs

A spec is the plan for a task with 3+ steps: the goal, its scope, and a task
list. Each task names the exact files an agent must read (**Load**), so it can
be done with only those files.

## Rules

- File name: `YYYY-MM-DD-slug.md`, copied from [TEMPLATE.md](TEMPLATE.md).
- GitHub issues are the backlog. Write a spec when work starts, and put the issue number in its `Issue` field.
- **Load** lists exact paths (scoped `AGENTS.md`, ADRs, specific source files). Nothing outside the list is needed; if it is, fix the list.
- Each task row has its own Load (a subset of, or addition to, the spec's Load), a checkable "Done when", a Status (`todo` / `doing` / `done` / `dropped`) and, when done, the Commit.
- If a spec changes a decision, it lists the ADRs affected, and a superseding ADR is written as one of its tasks.
- When all tasks are `done` and Validation passes, move the file to [implemented/](implemented/).
- Retroactive specs record work already in the tree. They use `Status: implemented`, cite the commits, and keep the same sections as a forward-looking spec.

## Open

| Spec | Goal |
|---|---|
| [2026-10-21-complete-playthrough](2026-10-21-complete-playthrough.md) | Finish chapter 6, then a fresh start-to-finish run of all eight chapters |

## Implemented

| Spec | Goal |
|---|---|
| [2026-10-21-engine-port](implemented/2026-10-21-engine-port.md) | Decode the original data, run the original scripts, and load all 90 scenes in the browser |
| [2026-10-21-static-and-offline-delivery](implemented/2026-10-21-static-and-offline-delivery.md) | Static build, manifest/folder-picker delivery, installable PWA and offline download |
| [2026-10-21-alien-invaders-tweaks](implemented/2026-10-21-alien-invaders-tweaks.md) | The opt-out gameplay tweaks in `src/mods.ts`, with their constants and validation |
| [2026-10-21-playthrough-testing](implemented/2026-10-21-playthrough-testing.md) | CDP driver, scene sweep, hotspot fuzzer, session daemon and recorded walkthroughs |

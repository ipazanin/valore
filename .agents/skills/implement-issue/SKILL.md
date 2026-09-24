---
name: implement-issue
description: Implement explicitly selected Valore GitHub issues through the requested checkpoint, with scoped validation and direct-to-main delivery carrying task IDs, then agent-managed Done status. Use only when the user requests issue implementation.
metadata:
  invocation: explicit
---

# Implement an issue

Use only on an explicit request to implement issues, including `$implement-issue`. Follow the [shared workflow](../../workflow.md), [privacy rules](../../rules/secrets.md), and [github skill](../github/SKILL.md). Preserve the user's requested stop point and previously granted authorization.

An implementation request grants standing authorization to stage the selected issue's changes, commit directly to `main` with its task ID, push, verify, and mark it Done. Complete that flow without repeated approval requests unless the user says to stop earlier. Environment changes and deployments retain their separate approval requirements.

## Select and inspect

- Use the requested issue numbers in order. If no issue is identified by the request or conversation, show a concise list of relevant open issues and ask for selection; do not choose or implement the whole backlog automatically.
- Read the issue and discussion, acceptance criteria, dependencies, existing implementation, and applicable agent guides. For product work, read [README.md](../../../README.md) and [docs/plan.md](../../../docs/plan.md). Flag unresolved dependencies rather than silently changing the queue.
- Inspect the worktree and current branch. Inventory existing domain concepts before proposing new types, persistence structures, or abstractions. Preserve unrelated local and staged work.
- Keep work within the explicitly selected issue and authorized phase. An issue's milestone alone does not authorize starting that phase. Resolve a conflict with the plan or a material financial ambiguity before dependent implementation; continue unaffected discovery.

## Implement and validate

- Give a short plan scaled to the work. Include meaningful validation and request independent critique for consequential decisions under the shared workflow. Resolve routine implementation choices without extra approval rounds.
- Set an existing linked project item In Progress through the github skill. Implement in small runnable increments, delegating bounded tasks when useful. Keep form drafts local and financial rules separate from presentation and persistence.
- Run the relevant checks from current package scripts and the shared workflow. For storage or backup changes, verify compatibility, dated observations, and atomic failure behavior. For visible flows, cover Firefox, keyboard use, and phone layouts where available.
- Review the complete scoped diff, fix confirmed findings, and rerun affected checks. Update durable documentation when behavior or setup changes. Report unavailable checks honestly.

## Deliver and finish

- Use the github skill to stage the issue's changes, commit directly on `main` with `(#N)` in the subject, and push to `origin/main` under the user's standing/session authorization. Do not introduce a branch or PR into the normal flow. If a Git operation is not authorized, finish the reviewable work before asking for that operation.
- Verify remote delivery and successful required CI for that revision. Only then have the agent close the issue as completed and move any linked project item to Done. With no linked project, the completed issue state is sufficient. A local-only stop, failure, or pending check leaves it open.
- Report the implemented scope, commit and issue link, actual check results, and remaining manual checks. Stop at the requested checkpoint. Start another issue only when it was explicitly included in the requested queue and its prerequisites are met.

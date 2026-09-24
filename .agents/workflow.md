# Shared agent workflow

## Scope and authorization

- Follow the user's requested issue, phase, and stop point. Planning, backlog maintenance, and review requests do not start implementation. Do not begin another issue or later phase automatically.
- An explicit request to implement selected issues authorizes staging their changes, committing directly on `main` with their issue IDs, pushing to `origin/main`, and agent-managed Done status after verification. This standing authorization replaces separate staging, commit, and push approvals for issue implementation; do not ask again. A narrower instruction such as “local diff only” takes precedence and also excludes GitHub status writes.
- Keep other authorization from the whole session. For operations outside this standing flow, finish safe preparation and show the concrete result or plan before asking for any missing authorization.
- Only the lead mutates Git. Preserve unrelated changes and the user's index; never reset, stash, unstage, or bulk-stage their work to make delivery easier. Include only the selected issue's changes, including when a file contains unrelated edits.
- Environment changes and deployments need their own concrete plan or dry run and approval. Inspect current workflow triggers before pushing; a Git authorization alone does not authorize an otherwise unapproved deployment. Do not add manual approval gates to pipelines.
- Do not send comments or messages to other people without authorization. Issue status updates requested by the delivery workflow are permitted; avoid extra notification comments.

## Implementation and review

- Read the applicable `AGENTS.md`, [privacy rules](rules/secrets.md), issue acceptance criteria, and affected code. For product work, read [README.md](../README.md) and [docs/plan.md](../docs/plan.md); the plan remains the financial and phase source of truth.
- Inventory existing concepts before adding types or abstractions. Explain and resolve ambiguity that materially changes financial behavior, scope, or architecture. Proceed with routine reversible choices.
- Give a short plan for complex work and implement in small, runnable increments. Delegate bounded discovery or disjoint edits when useful; choose an explicitly available model appropriate to the task. Keep integration and decisions with the lead.
- Use independent critique for consequential financial, persistence, backup, migration, or security changes when agents are available. Give reviewers the exact scoped diff or snapshot, relevant context, and invariants. Reviewers use Git read-only; the lead verifies findings and fixes them within scope.
- Review the complete issue diff before delivery, including new files. Keep durable instructions and product docs; leave investigation scratch and personal review notes outside version control.

## Validation

Use the current package scripts and workflows, choosing checks for the changed behavior:

- Financial calculations, persistence, and backup changes: meaningful tests with `npm test`. Cover decimal precision, missing valuations, dated observations, compatibility, and atomic replacement where affected.
- Application code: `npm run typecheck` and `npm run build`, plus relevant tests.
- Visible browser behavior: `npm run test:e2e` or focused browser checks, including Firefox, keyboard use, and phone layouts. Distinguish emulation from physical-device testing.
- Instructions and documentation only: validate changed links, skill metadata/discovery, and workflow behavior; do not require unrelated application builds.

Report only checks actually run. Fix failures and rerun affected checks. A review cannot substitute for an executed test, and local checks cannot substitute for required CI.

## Completion

Use the [github skill](skills/github/SKILL.md) for direct-to-`main` delivery. Every issue commit must identify its task, for example `fix(backup): reject incompatible currencies (#42)`.

Mark Done only after acceptance criteria and relevant checks pass, the issue changes are committed and verified on `origin/main`, and any required CI for the delivered revision succeeds. The agent closes the issue as completed and updates an existing linked project status to Done. A local diff, local commit, failed push, or failed/pending required check is not Done. When no project is linked, the completed issue state is sufficient.

Honor an earlier requested stop point and leave the issue open. Report the actual delivery state, check results, remaining manual checks, and any blocker; stop at the requested checkpoint.

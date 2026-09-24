---
name: github
description: Manage Valore GitHub issues, milestones, dependencies, and project status, and deliver authorized issue changes directly to main with task IDs in commits.
---

# GitHub workflow

Read the [shared workflow](../../workflow.md) and [privacy rules](../../rules/secrets.md). Apply the user's existing authorization without asking again; a backlog or review request does not authorize implementation or Git mutations.

An explicit issue implementation request grants the full scoped flow: stage its changes, commit directly to `main` with the task ID, push, verify, and have the agent mark it Done. Do not request separate approval for these operations unless the user set an earlier stop point. Deployment and environment approval remain separate.

## Inspect and organize

- Derive the repository from this worktree's remote. Use `gh` with an explicit repository where context could be ambiguous; check authentication without printing tokens.
- Read the selected issue, comments, dependencies, linked project items, and current labels/milestones before changes. Search for existing work before creating duplicates. Keep phase decisions aligned with [the plan](../../../docs/plan.md).
- Write concrete outcomes and testable acceptance criteria. Reuse actual labels and milestones; do not invent platform prefixes, sprint fields, or a project board. Do not copy private portfolio records into examples.
- Derive author and assignee identity from `git config user.email` in this worktree. Match it to a verified GitHub identity, for example commit metadata pairing that email with a login. If missing or ambiguous, ask; do not substitute the authenticated account or `@me`.
- When actual issue dependencies are requested, use GitHub's dependency relationship and verify it. The REST `issues/{number}/dependencies/blocked_by` endpoint takes the blocking issue's numeric database ID as `issue_id`, not its issue number. Do not silently reorder the user's queue.
- For multiline issue bodies, prefer structured arguments or a temporary file with `--body-file`. Keep text human-written in style; never add AI attribution or generated-by footers.

## Work directly on main

1. Inspect branch, status, diff, remotes, and current remote `main`. Read current CI/deployment workflows before delivery. Work directly on `main`; do not create a feature branch or PR unless the user requests an exception. If another branch is checked out or integration with remote changes is needed, preserve the worktree and resolve the needed operation within authorization; do not force-push, reset, or rebase by assumption.
2. When implementation starts, move an existing linked project item to its actual In Progress status if available. Do not create a board merely to represent progress. Leave the issue open.
3. Implement, validate, and review the selected issue. Use the [implement-issue skill](../implement-issue/SKILL.md) only for explicitly requested issue implementation. Respect an earlier requested stop point.
4. Under the session's Git authorization, stage only the issue's changes and make a direct commit on `main`. Inspect what will enter the commit and preserve unrelated staged and unstaged work. If changes share files, isolate the issue hunks safely; never stage entire mixed files by default.
5. Put the issue ID in every issue commit subject: `type(scope): concrete change (#N)`, for example `chore(agents): add issue delivery guidance (#10)`. Use a suitable Conventional Commit type and optional scope. Include each applicable ID when the user explicitly requests a combined task. Do not use automatic closing keywords to close work before verification, and do not add AI co-author trailers.
6. Push to `origin/main` when authorized. Inspect the commits to be published so unrelated unpublished work is not included. Verify the delivered commit is on remote `main`; if a normal push is rejected, stop dependent delivery and inspect the cause. Never retry with force by assumption.
7. Inspect checks for the delivered commit. Wait for required CI to succeed; if no applicable CI exists, report that fact. Pending or failed checks, failed pushes, and unmet acceptance criteria leave the issue open.

## Agent-managed Done

After the shared workflow's completion criteria are met, the agent closes the issue with the completed reason (`gh issue close N --reason completed`) and sets any existing linked project item to its actual Done status. Inspect field and option IDs rather than guessing board commands. Without a project item, closing the issue as completed is Done.

Verify the resulting issue state and any project update. If a status update fails, report the partial result and retry only within the existing authorization; do not claim the board was updated. Do not require a PR or ask the maintainer to move completed work manually. Report the issue link, commit, actual validation, and delivery state without posting an extra issue comment unless requested.

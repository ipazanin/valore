# Project instructions

- Read README.md and docs/plan.md before changing product behavior.
- Work on the requested phase in small, runnable increments. Let the maintainer test each increment before expanding scope.
- Keep future-phase details deferred until they affect the current work.
- Organize by feature and separate financial rules, application workflows, persistence, and presentation.
- Use Vue's Composition API, focused typed components, and composables. Keep form drafts local and use Pinia only for shared state.
- Access IndexedDB through Dexie in the persistence layer. Keep provider integrations behind the planned interfaces.
- Preserve dated observations, backup compatibility, and financial precision. Never count an account total again as an asset or treat a missing price or exchange rate as zero.
- Test meaningful calculation, persistence, and import behavior. Report only validation that was actually run.
- Keep credentials and personal portfolio files out of version control and API keys out of exported backups.
- Follow the user's Git and deployment instructions; preserve unrelated work and do not start later phases automatically.

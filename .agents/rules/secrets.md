# Secrets and portfolio privacy

Apply these rules throughout the repository.

- Keep credentials, tokens, API keys, and private configuration out of model context, terminal output, logs, Git, issues, and agent reports. Use authenticated tools without printing their credentials. Inspect file metadata or ignore status when checking secret files.
- Never include API keys in exported portfolio backups. Consume a credential only through a tool or child process that needs it and will not echo it.
- Treat personal records and backups as private. Use synthetic portfolios for tests and issue examples; do not read or publish the maintainer's records during ordinary discovery. If a supplied sample is needed, limit inspection to the authorized purpose and avoid copying personal content into reports.
- Keep personal portfolios and backups outside version control. The ignored `backups/` and `local-data/` directories are available for local files; check ignore behavior before writing sensitive files.
- Portfolio backups intentionally contain records, observations, and settings. Normal JSON backups and browser storage are unencrypted; preserve that warning in affected user documentation. Privacy rules do not remove required portfolio content from backups.
- Do not paste secrets or personal financial details into a task, commit, screenshot, fixture, or shared artifact. Tell delegated agents which private paths to avoid.

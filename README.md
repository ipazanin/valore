# Valore

A local portfolio and net-worth tracker. Phase 1 is implemented and ready for practical testing: one reporting currency, manual records and prices, current totals, and JSON backups. Phase 2 adds dated entry and history corrections; subsequent capabilities are tracked in the [delivery plan](docs/plan.md).

## Run locally

Requires Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. Choose a reporting currency or restore an existing Valore backup. There is no demo portfolio, login, backend, or market-data service.

```sh
npm test             # Domain, backup validation, and Dexie persistence tests
npm run typecheck    # TypeScript and Vue templates
npm run build        # Typecheck and production build in dist/
npm run preview      # Serve the production build locally
```

Browser tests use Playwright:

```sh
npx playwright install chromium firefox webkit
npm run test:e2e
```

The browser suite covers desktop Chromium and Firefox plus phone-sized Chromium and WebKit. Emulation does not replace testing on physical Android and iPhone devices. Unit persistence tests use real Dexie transactions with fake-indexeddb; browser tests exercise browser IndexedDB.

## Portfolio behavior

- Accounts group cash and stock/ETF holdings. Holdings preserve instrument name, type, optional ISIN, listing symbol, exchange, and trading currency. Choose a saved listing to hold it in another account; its manual price applies to both.
- Property, vehicles/possessions, Other assets, money lent, and debts are separate named records. Use current resale estimates for tangible assets and outstanding amounts for money lent or owed. Record a property and its mortgage separately.
- All amounts and listings must already use the chosen currency. This version has no conversion and cannot change a portfolio’s currency. Restoring a complete backup restores its own currency setting; incompatible currency fields are rejected.
- The asset allocation chart shows each category’s share of known assets, with exact amounts and percentages in its table. Unpriced holdings are named and excluded from the allocation denominator. All-zero assets show an empty state.
- The assets/liabilities comparison uses two bars on the same zero-based monetary scale and keeps signed net worth visible. Incomplete assets are labeled as known assets.
- Net worth is assets minus liabilities. Account totals are only grouping. Negative cash remains signed in the account and contributes its absolute amount once to liabilities.
- Investment value is total quantity multiplied by unit price. A positive holding with no price makes known totals incomplete; it is never assigned a zero price. Blank price updates retain any saved price. An explicitly entered zero price is valid.
- Amounts use decimal strings and decimal.js arithmetic, with up to 18 whole digits and 12 decimal places. Enter a decimal point without thousands separators. Totals display currency precision; calculations and backups retain full precision. Unit prices and quantities display their entered precision.
- Saves default to today’s local calendar date and accept past dates, separately from the UTC edit timestamp. A second save on the same date corrects that observation. History allows independent cash, quantity, price, and valuation corrections and confirmed deletion. Moving an entry onto an occupied date is rejected. Values carry forward only from their first observation; later quantities and prices never change earlier ownership or values.
- Update names, balances, quantities, prices, estimates, and outstanding amounts. Investment identity and existing record categories remain fixed. To record a zero holding or repaid debt, update its quantity or amount to zero. Deleting every observation keeps the named record, which then has no recorded value and is excluded from totals. Price deletion may leave positive holdings unvalued. Archival is deferred.

## Storage and backups

Records persist in IndexedDB through Dexie. Pinia holds the shared application state; forms keep their drafts locally. Financial calculations and validation live in `src/features/portfolio/domain`, storage in `persistence`, workflows in `application`, and Vue forms/views in `components`. Backup validation and its interface live in `src/features/backup`.

Browser storage is tied to the browser profile and site origin (scheme, host, and port). Development and preview addresses can therefore hold different portfolios. Repository paths on the same origin share browser storage; Valore currently uses one database named `valore`. Use HTTPS when hosting, or localhost for development.

Local records are unencrypted. Clearing site data, using private browsing, browser storage limits/eviction, or losing the device can remove them. There is no server copy or recovery account. The app is not yet a PWA and does not guarantee an offline launch.

**Export backups regularly**, especially before replacing a portfolio or clearing browser storage. JSON backups are unencrypted and contain all supported records, instruments/listings, dated observations, and the reporting-currency setting. Keep them private and outside version control; `backups/` and `local-data/` are ignored.

Backup format version 2 supports records with no observations after history deletion and still imports valid version 1 backups. It uses `format: "valore"`, `version`, `exportedAt`, and `portfolio`. Import accepts files up to 10 MB. The complete file is checked for supported fields, decimal amounts, dates, currencies, identifiers, and references before replacement. Version 1 retains its original required-observation checks. A preview and explicit confirmation are required. Replacement is atomic: validation or write failure leaves the existing portfolio intact. Restore replaces rather than merges. A form opened before another tab restores the portfolio must be reopened before saving.

## Static hosting

`npm run build` creates a static `dist/` directory. Vite uses relative asset URLs (`base: './'`), so the output works under a repository path such as `/valore/` as well as at a site root. There is no client-side route requiring server rewrites.

The [CI and Pages workflow](.github/workflows/pages.yml) runs on pushes to `main` and pull requests targeting `main`. It installs from the lockfile with Node.js 22, runs the calculation/persistence/backup tests, type-checks, and builds once. The browser suite then tests that exact production build at `/valore/` in desktop Chromium/Firefox and phone-sized Chromium/WebKit, including IndexedDB persistence and backup flows.

Successful `main` pushes upload only `dist/` and deploy that artifact to [Valore on GitHub Pages](https://ipazanin.github.io/valore/). Pull requests only verify. A failed install, test, type check, build, or browser check prevents deployment, leaving the last successful site available. See the repository's Actions tab for the failing step; fix it and push to `main` to retry. Deployments are serialized without cancelling an active run, and the workflow adds no manual approval gate.

The repository uses **GitHub Actions** under **Settings → Pages → Build and deployment → Source**. Pushes to `main` update the site automatically after successful checks. The `github-pages` environment shows the deployment URL. No custom domain, backend, or application secret is required. The published artifact contains application assets only; personal portfolios remain in each browser and private backups stay outside the repository.

## Manual checkpoint

1. Choose a currency. Add a cash account, a house, a mortgage, and a fractional investment holding with a manual price. Check assets minus liabilities by hand.
2. Add negative cash and an unpriced holding. Verify signed cash, liability totals, incomplete totals, and the named unvalued holding.
3. Update each kind of amount, reload, and check it persisted. After another day, update again and confirm both dates remain in an exported backup.
4. Export a backup. Preview it, cancel once, then restore it in another browser. Confirm records, listing identities, dates, and currency survive.
5. Try malformed JSON and a backup containing a foreign-currency record. Confirm rejection leaves the current portfolio intact.
6. Try the forms with a keyboard and on an Android phone and iPhone, including backup download and file selection.

## License

[MIT](LICENSE).

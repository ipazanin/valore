# Valore — phased delivery plan

Status: Phase 1 manual MVP implemented; its personal-record and physical-phone checkpoint remains pending in #1. Phase 2 implementation is authorized while that checkpoint remains open. Phases 3–6 have not started.

CI and static hosting: the GitHub Actions workflow verifies the production build and deploys successful `main` pushes to GitHub Pages. Publication of the manual MVP and automatic deployment are authorized; the repository uses GitHub Actions as its Pages source.

## Delivery approach

Build a small usable MVP, test it in practical use, and add capabilities in working increments. The proposed phases below organize the planned feature set, with feedback between increments.

- Work on one slice at a time. End each slice with a runnable version, a short test checklist, and its known limitations.
- Let the maintainer try the workflow and use that feedback to fix problems or adjust the next slice before expanding scope.
- Keep later features in this roadmap. Resolve their detailed rules when their phase approaches; they do not block the MVP.
- Preserve entered records and compatible backups as the app evolves. Test migrations when storage changes.
- Phase 1 application implementation is authorized and complete for the manual MVP. CI, publication, and automatic Pages deployment are authorized. Phase 2 is authorized with the Phase 1 practical checkpoint still pending; phases 3–6 require separate authorization.

| Phase | Usable outcome | User test focus |
| --- | --- | --- |
| 1. Manual MVP | Enter a portfolio in one currency, see current net worth, save and restore it | Is basic record-keeping useful and easy? |
| 2. History and offline use | See changes over time; use the app on a phone and offline | Do history, editing, and daily use feel right? |
| 3. Currencies and market data | Combine currencies and reduce manual price updates | Are conversions and supported quotes trustworthy? |
| 4. Asset and rental details | Add useful context around property, debt, and rent | Is the extra information worth maintaining? |
| 5. Import and backup conveniences | Import selected CSV snapshots and encrypt exports optionally | Can real records move safely between tools and devices? |
| 6. Transfer helper | Update both accounts together, including historical transfers | Do linked updates and corrections behave predictably? |

Phases can be reprioritized after testing. Each phase below contains smaller deliverables; it is not a single large implementation batch.

## Product and technical foundations

These decisions remain in force throughout the roadmap.

- Free, open source, and hosted as a static app on GitHub Pages. Portfolio records stay in the browser; no portfolio backend, market-data server, or proxy.
- Licensed under the [MIT License](../LICENSE).
- One person's assets and liabilities, counted in full. No shared ownership, ownership percentages, or household-member model.
- Mostly manual balances and valuations. Track net worth and changes in wealth, without presenting them as investment returns.
- Fixed asset categories plus Other, with custom names for individual records.
- English interface, appropriate number/date/currency formatting, short setup, and no demo portfolio.
- Overview cards and charts with detailed tables. The three target dashboard views are net-worth history, assets versus liabilities, and allocation by asset category.
- Firefox is a primary browser. Mobile layouts start in the MVP; Android and iPhone receive equal validation as features arrive.
- Vue 3 with TypeScript and the Composition API. Build custom components with [scoped CSS](https://vuejs.org/api/sfc-css-features.html) and shared theme variables.
- [Pinia](https://pinia.vuejs.org/introduction.html) holds shared application state. Form drafts and local UI state stay in components or composables.
- [Dexie.js](https://dexie.org/docs/) accesses IndexedDB, which remains the durable record store. Keep persistence and provider APIs outside components and domain calculations.
- Use [Chart.js](https://www.chartjs.org/docs/latest/) inside custom Vue chart components when charts arrive. Prepare series outside those components, synchronize colors/fonts with themes, and provide accessible text or table alternatives.
- Organize by feature with clear calculation, application, persistence, and presentation boundaries. Introduce abstractions needed by the current slice; avoid building later workflows in advance.

Reuse the existing concepts: assets, liabilities, named accounts, instruments/listings, holdings, dated balances, valuations, and prices. Accounts group cash and holdings; their calculated totals are not additional assets. Rental links and transfer links arrive with their own phases.

## Phase 1 — manual MVP

**Status:** implemented; maintainer testing pending. The application includes setup, manual account/asset/debt forms, current totals, dated IndexedDB persistence, and validated version 1 JSON backup replacement. Decimal strings and decimal.js preserve financial precision. Same-day saves replace that day’s observation; previous dates are retained. Calculation, persistence, backup, type-check, and production-build checks pass. Browser workflows pass in desktop Chromium/Firefox and phone-sized Chromium/WebKit, including a production repository path. Physical-device and personal-record testing remain part of this checkpoint.

**Goal:** enter enough of a real portfolio to check today's net worth and decide whether the basic workflow is useful.

### Build

- Short setup: choose one currency, then add records or restore an app backup.
- Named accounts containing cash and investment holdings.
- Simple forms for property, vehicles/possessions, Other assets, money lent, and debts. Use current resale estimates for possessions/property and outstanding amounts for money lent or owed.
- Stocks and ETFs entered as total quantities, including fractions, with manually entered unit prices. Retain listing identity and trading currency so later providers can price the same holding.
- Add and update today's balances, quantities, prices, and valuations. Store dated observations from the start and retain prior dates; the history interface comes in Phase 2.
- Current assets, liabilities, net worth, and category totals, with readable account/record lists and a basic mobile layout.
- IndexedDB persistence and normal, versioned JSON backup export/import. Preview and validate an import before replacing the current portfolio; an invalid file leaves existing records intact.

**Temporary MVP limits:** one chosen currency for all entered amounts and listings, manual prices, and current-value screens. Do not relabel foreign-currency amounts as the chosen currency. Keep original-currency fields in records; multi-currency conversion belongs to Phase 3. Automatic feeds, history charts, PWA installation, rental context, CSV parsers, encrypted exports, and transfer helpers arrive later.

### Calculation and storage rules

- Assets minus liabilities equals net worth. Count every underlying amount once.
- Keep a property's value and its mortgage separate. Do not add its equity as another asset.
- Positive account cash contributes to assets; the absolute amount of negative cash contributes once to liabilities. Keep the signed cash balance visible and do not add a second debt for it.
- A holding is quantity multiplied by its applicable price. Missing prices produce an explicitly incomplete total and an unvalued-holdings list, never a zero price.
- Preserve effective dates separately from edit/fetch timestamps. Use an appropriate decimal representation for amounts, quantities, and rates; select the implementation during this slice.
- Backups contain all records, saved observations, and settings supported at that stage. Expand the format with later features and preserve compatibility. API keys are always excluded.
- Keep browser records unencrypted, without an app unlock step. Browser storage is not a separate backup.

**Test checkpoint:** enter a house, loan, cash account, and investment holding in the chosen currency; check totals by hand; edit them; reload; export and restore in another browser. Check negative cash, missing prices, invalid imports, and phone-sized forms. Fix usability and data-loss issues before adding more features.

## Phase 2 — history, charts, and offline use

Deliver history first, then offline/mobile improvements, with a test checkpoint between them.

### 2A. Dated history and visualization

Dated observation editing, confirmed deletion, dated archival, and all three chart views are implemented. Users may delete every observation while keeping its named record; a record with no observations has no recorded value. Account closure still requires explicit zero balances and quantities, and corrections/imports revalidate that condition. Historical charts use calendar dates, stepped carry-forward, and gaps for incomplete totals, with exact values and source dates in the accompanying table.

- Allow past and present dated balances, valuations, total quantities, and manual prices.
- Carry each recorded amount or quantity forward until its next update or closure. Show its age; do not apply it before its first observation.
- Preserve earlier quantities when a later total changes. Historical quotes alone must never imply past ownership.
- Let users edit or delete historical entries, confirm deletion, and recalculate affected history. No separate revision log.
- Add net-worth history, assets-versus-liabilities, and category-allocation charts, with detailed valuation/history tables and incomplete-total indicators.
- Add dated closure/archive for sold assets, repaid debts, and closed accounts. Preserve earlier history and exclude closed records on and after their closure date.
- Account closure requires each cash balance to be zero and no remaining holdings, checked before archive exclusion. A net-zero account with offsetting contents is not enough. Revalidate after relevant corrections or imports.
- Sale proceeds and repayments remain manual cash updates; archiving does not create them.

**Test checkpoint:** enter several past snapshots, change a quantity, correct a valuation, and archive a record. Verify the chart against expected amounts and dates, including gaps, incomplete values, and closure.

### 2B. PWA, mobile, and themes

- Support offline launch, viewing, editing, calculations, and available backup flows after a successful initial load and cache.
- Add installation metadata and platform-appropriate installation guidance. Keep the app usable in a normal browser tab.
- Support light, dark, and follow-system modes, initially following the device setting and saving the selection locally. Apply themes to forms and charts.
- Validate Android and iPhone equally, including touch interactions and backup handling. Preserve records and unsaved edits through app updates.
- Verify current browser installation support when implementing. Do not promise identical installation across browsers or scheduled quote refreshes while the app is closed.

**Test checkpoint:** install where supported, go offline, edit and reopen the portfolio, export/restore, and switch themes. Check Firefox tabs and both mobile platforms.

## Phase 3 — currencies and market data

Deliver these slices separately. Provider uncertainty must not prevent continued use of the manual app.

### 3A. Multiple currencies and exchange rates

- Preserve original currencies and convert to one chosen reporting currency.
- Use latest available rates for current totals. For historical chart dates, use that date's rate or the latest earlier rate, never a future rate or today's rate applied throughout history.
- Fetch current and historical rates where available, with dated manual fallback.
- Retain dated last-known rates when automatic updates fail or become outdated. Allow manual fallback; resume fresh automatic rates while preserving manual history.
- When a conversion is unavailable, retain the original amount and mark affected totals incomplete. Do not substitute zero or parity.
- Check rates on opening/reconnection and provide a Refresh button, respecting source quotas. Assess freshness against the source's publication schedule.

**Decide here:** rate source, supported currencies, and reporting-currency changes.

**Test checkpoint:** combine two currencies, verify current and historical conversions, enter a manual rate, remove a required rate, and test offline behavior.

### 3B. Current investment prices

- Put fetching behind a `PriceProvider` interface. Keep vendor symbols, requests, quotas, and normalization inside adapters; quotes carry their currency, actual date/time, and source.
- Start with one verified adapter. Support a default provider and optional per-listing overrides as additional adapters become available.
- Aim for a keyless default; also allow optional user API keys. Exclude keys from every backup and re-enter them on another device.
- Support direct browser APIs and scheduled public price files when licensing permits redistribution. Scheduled files contain public market data only; project secrets remain outside the public app/files, and locally added listings may not be in the published catalogue.
- Identify instruments independently of provider symbols, with exchange and trading currency. Do not substitute a fund's base currency or NAV for its selected listing price.
- Define fresh as the most recent completed trading day for the selected exchange, accounting for its calendar and time zone. A later quote is also usable. Keep quote time distinct from fetch time.
- Check on opening/reconnection, fetch missing or outdated observations, and provide a Refresh button. Respect quotas for automatic and manual requests.
- Keep dated last-known prices when unavailable/outdated and allow manual fallback. Resume fresh automatic prices going forward while retaining manual history. Show known totals as incomplete when neither source supplies a usable price.

Initial coverage examples remain SXR8, VUAA, VUSA, PLTR, TSLA (Tesla), SPY, and SPCX. Prioritize EUR European listings for the UCITS ETFs; choose exact exchanges and confirm issuer identity before integration.

**Unresolved feasibility:** no provider has been selected or verified to cover this entire set with the required browser access, freshness, and permitted use. Prior research leads include [TickerInside](https://tickerinside.com/api/), [Stocklake](https://api.stocklake.dev/docs), and [Stoxly](https://www.stoxlyonline.com/mcp); recheck their actual responses and terms in this phase. Free anonymous access alone does not establish suitability.

**Decide here:** real coverage and licensing, exchange calendars, key storage/removal, fallback between providers, and any scheduled-file catalogue and maintenance.

**Test checkpoint:** compare supported quotes with their source dates and currencies; test stale data, unavailable listings, quotas, manual fallback, and automatic recovery. Clearly identify unsupported coverage.

### 3C. Automatic historical investment prices

- Fetch historical prices where the selected provider supports them; retain saved, imported, and manual history as fallbacks.
- Match prices to the quantities applicable on each date. Keep prices consistent with stock splits and the chosen historical price convention.
- Preserve dated manual observations even when an automatic source later supplies history.

**Decide here:** lookup range/timing, overlapping manual and provider prices, revised quotes, and stock-split handling. These decisions are deferred, not prerequisites for Phase 1.

**Test checkpoint:** compare a known holding's history against dated quantities and source prices, including a quantity change and a split case before enabling affected automatic history.

## Phase 4 — useful asset, debt, and rental context

Add optional asset/debt fields first, then the rental view.

- Optional purchase cost for manually valued assets, separate from resale value and excluded from additional asset totals.
- Optional debt interest rate, payment amount, and due dates. Outstanding balances stay manual; no automatic interest, repayment, or cash changes.
- Optional links from debts and expected rental income to assets. Keep linked values separately recorded and counted once.
- Expected rental income and rent payments as monthly amounts with a start and optional end date. Display them for context, outside assets, liabilities, and net worth.
- Keep money lent as a manually updated receivable asset; no interest or repayment engine.

**Decide here:** meanings of debt due dates/payment frequency and where related-record/rental summaries fit in the interface.

**Test checkpoint:** add a rental property with a mortgage and expected rent, plus personal rent payments. Verify links are useful and entering expected rent does not change net worth or cash.

## Phase 5 — imports and backup conveniences

Deliver each CSV adapter separately, then optional encrypted exports; reorder these slices if testing shows a stronger need.

### 5A–5B. CSV snapshots: Yahoo Finance, then IBKR

- Import dated cash balances and holding quantities where the actual export provides snapshots.
- Preserve the agreed priority: Yahoo Finance, then IBKR. Exact formats and samples will be supplied later; compatibility has not been verified.
- Preview changes and define account/listing mapping, duplicate detection, and conflicting-date behavior for the supplied format.
- Do not reconstruct positions from trades or payments or add a transaction ledger. Complete-backup replacement does not determine CSV merge behavior.

### 5C. Optional password-encrypted exports

- Offer normal or password-encrypted backups with identical portfolio content. Browser records remain unencrypted.
- Include complete records/history, archived records, saved prices and FX rates, settings/provider selections, and transfer details/links once supported. Never include API keys.
- Preserve preview-and-replace import behavior and offline restore. An encrypted file requires its password; there is no account-based recovery.
- Choose and verify the encrypted-file format and cryptographic implementation in this slice.

**Test checkpoint:** use actual CSV samples, repeat an import, resolve a conflict, and compare totals. Round-trip both backup modes between devices and verify wrong passwords or invalid files leave existing records intact.

## Phase 6 — transfer helper

This is deliberately late because it introduces linked changes and historical interactions. Preserve the agreed behavior without designing it all before the MVP.

Deliver cash transfers first, then investment transfers, then backdated-transfer workflows, testing each separately.

- Record movements by updating both accounts' dated cash balances or total quantities together. Reuse the snapshot concepts and retain transfer details and links.
- For cash, enter actual debit and credit in their respective currencies, including different currencies. Fees are already reflected in those amounts and must not be deducted again. Reporting FX rates value the resulting balances; they do not determine the actual amount received.
- Keep both sides linked. Preview corrections/deletion and apply both sides together; a failed save must not leave only one side changed. Include links and active transfer details in backups.
- Allow past effective dates with a preview of affected history. Preserve history before that date and later manually entered or imported totals, independently for each account.
- For example, adding a January transfer does not change a balance explicitly recorded in February. Distinguish these observations from totals calculated by the helper.
- Continue validating account-closure conditions. Keep the agreed no-revision-log policy.

**Decide here:** same-date snapshot conflicts, recalculation of subsequent transfer-created totals, investment-transfer fees, and transfers between different listings.

**Test checkpoint:** move cash and holdings, record unequal debit/credit amounts, correct/delete both sides, simulate a failed save, and add a past transfer with later observations on different dates. Confirm backup restoration preserves the links.

## Scope boundaries and decisions to defer

Outside this roadmap: shared ownership, financial goals, budgets, transaction accounting, investment-return/tax calculations, debt-payoff forecasts, automatic depreciation, custom categories, demo portfolios, and additional interface languages. Crypto, pensions, business ownership, insurance, bank connections, and property-management workflows have not been added to scope.

Visual polish, detailed table interactions, additional descriptive fields, and operational maintenance choices can follow practical use; they do not justify a new round of detailed questions now.

Phase 2 is authorized while the maintainer’s Phase 1 practical test with personal records and physical phones remains pending. Fix any usability and data-loss issues reported through that checkpoint. Later phases retain the decisions already made and only need detailed discussion when implementation reaches them.

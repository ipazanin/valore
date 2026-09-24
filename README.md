# Valore

A personal portfolio and net-worth tracker for understanding what you own, what you owe, and how both change over time.

Valore is planned as a free, open-source application hosted on GitHub Pages. Portfolio records stay in the browser, with export and import for moving them between devices.

## Project status

Planning and repository setup. There is no runnable application yet.

The [phased delivery plan](docs/plan.md) defines the product, selected technology, and testing checkpoints. Work starts with a small manual MVP, followed by user testing before additional capabilities are introduced.

## Planned approach

- Vue 3 and TypeScript, with custom components and styles.
- IndexedDB through Dexie for local records; Pinia for shared application state.
- Dated balances and valuations across assets, investments, cash, and liabilities.
- Replaceable market-data providers, with manual pricing available when needed.
- Responsive views and, in a later phase, offline PWA support.

Development commands and application setup will be documented when implementation starts.

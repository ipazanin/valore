import Dexie, { liveQuery, type Table } from 'dexie'
import { validatePortfolio } from '../domain/validation'
import type {
  Account,
  AssetRecord,
  Holding,
  Instrument,
  Listing,
  Observation,
  Portfolio,
} from '../domain/types'

type StoredSettings = Portfolio['settings'] & { key: 'primary'; epoch: string }

export interface PortfolioState {
  portfolio: Portfolio | null
  epoch: string | null
}

export class PortfolioDatabase extends Dexie {
  settings!: Table<StoredSettings, string>
  accounts!: Table<Account, string>
  instruments!: Table<Instrument, string>
  listings!: Table<Listing, string>
  holdings!: Table<Holding, string>
  records!: Table<AssetRecord, string>
  observations!: Table<Observation, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      settings: 'key',
      accounts: 'id',
      instruments: 'id',
      listings: 'id, instrumentId',
      holdings: 'id, accountId, listingId, [accountId+listingId]',
      records: 'id',
      observations: 'id, [kind+subjectId+effectiveDate], [kind+subjectId], effectiveDate',
    })
  }
}

/** Owns all portfolio reads and writes, including the complete-backup replacement. */
export class PortfolioRepository {
  readonly database: PortfolioDatabase

  constructor(databaseName = 'valore') {
    this.database = new PortfolioDatabase(databaseName)
  }

  async read(): Promise<Portfolio | null> {
    return (await this.readState()).portfolio
  }

  observe() {
    return liveQuery(() => this.read())
  }

  async readState(): Promise<PortfolioState> {
    return this.database.transaction('r', this.database.tables, () => this.readStateInTransaction())
  }

  observeState() {
    return liveQuery(() => this.readState())
  }

  async update(change: (current: Portfolio | null) => Portfolio): Promise<Portfolio> {
    return (await this.updateState(change)).portfolio!
  }

  async updateState(
    change: (current: Portfolio | null) => Portfolio,
    expectedEpoch?: string | null,
    replace = false,
  ): Promise<PortfolioState> {
    return this.database.transaction('rw', this.database.tables, async () => {
      const current = await this.readStateInTransaction()
      if (expectedEpoch !== undefined && current.epoch !== expectedEpoch) {
        throw new Error(
          'This portfolio was replaced in another tab. Reopen the form and enter the change again.',
        )
      }
      const next = validatePortfolio(change(current.portfolio))
      const epoch = replace || !current.epoch ? crypto.randomUUID() : current.epoch
      await this.writeInTransaction(next, epoch)
      return { portfolio: next, epoch }
    })
  }

  async replace(portfolio: Portfolio): Promise<Portfolio> {
    return (await this.updateState(() => portfolio, undefined, true)).portfolio!
  }

  close(): void {
    this.database.close()
  }

  private async readStateInTransaction(): Promise<PortfolioState> {
    const [settings, accounts, instruments, listings, holdings, records, observations] =
      await Promise.all([
        this.database.settings.get('primary'),
        this.database.accounts.toArray(),
        this.database.instruments.toArray(),
        this.database.listings.toArray(),
        this.database.holdings.toArray(),
        this.database.records.toArray(),
        this.database.observations.toArray(),
      ])

    if (!settings) {
      if (
        accounts.length ||
        instruments.length ||
        listings.length ||
        holdings.length ||
        records.length ||
        observations.length
      ) {
        throw new Error('Portfolio storage is incomplete: settings are missing.')
      }
      return { portfolio: null, epoch: null }
    }
    if (!settings.epoch) {
      throw new Error('Portfolio storage is incomplete: its version is missing.')
    }

    const portfolio: Portfolio = {
      settings: { reportingCurrency: settings.reportingCurrency, createdAt: settings.createdAt },
      accounts,
      instruments,
      listings,
      holdings,
      records,
      observations,
    }
    return { portfolio: validatePortfolio(portfolio), epoch: settings.epoch }
  }

  private async writeInTransaction(portfolio: Portfolio, epoch: string): Promise<void> {
    await this.database.settings.put({ key: 'primary', epoch, ...portfolio.settings })
    await this.database.accounts.clear()
    await this.database.accounts.bulkPut(portfolio.accounts)
    await this.database.instruments.clear()
    await this.database.instruments.bulkPut(portfolio.instruments)
    await this.database.listings.clear()
    await this.database.listings.bulkPut(portfolio.listings)
    await this.database.holdings.clear()
    await this.database.holdings.bulkPut(portfolio.holdings)
    await this.database.records.clear()
    await this.database.records.bulkPut(portfolio.records)
    await this.database.observations.clear()
    await this.database.observations.bulkPut(portfolio.observations)
  }
}

export const portfolioRepository = new PortfolioRepository()

<script setup lang="ts">
import { computed } from 'vue'
import { usePortfolioStore } from '../application/store'
import { formatMoney } from '../domain/format'
import { localToday } from '../domain/dates'
import { categoryLabels, displayDate } from './labels'

const emit = defineEmits<{ navigate: [tab: 'accounts' | 'records'] }>()
const store = usePortfolioStore()
const currency = computed(() => store.portfolio?.settings.reportingCurrency ?? '')
const hasRecords = computed(() =>
  Boolean(store.portfolio?.accounts.length || store.portfolio?.records.length),
)
const assetCategories = computed(() =>
  Object.entries(store.overview?.categories ?? {}).filter(([category]) => category !== 'debt'),
)
const unvalued = computed(() =>
  (store.overview?.unvaluedHoldings ?? []).map((holdingId) => {
    const holding = store.portfolio!.holdings.find((holding) => holding.id === holdingId)!
    const listing = store.portfolio!.listings.find((listing) => listing.id === holding.listingId)!
    const instrument = store.portfolio!.instruments.find(
      (instrument) => instrument.id === listing.instrumentId,
    )!
    const account = store.portfolio!.accounts.find((account) => account.id === holding.accountId)!
    return { id: holdingId, name: instrument.name, symbol: listing.symbol, account: account.name }
  }),
)
</script>

<template>
  <section v-if="store.overview" aria-labelledby="overview-title" class="stack">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Your financial picture</p>
        <h1 id="overview-title">A little more clarity.</h1>
        <p class="muted">Current values · {{ displayDate(localToday()) }} · {{ currency }}</p>
      </div>
      <span class="local-label"><span aria-hidden="true"></span> Stored on this device</span>
    </div>
    <div class="summary-grid">
      <article class="summary net-worth" aria-label="Net worth">
        <span>{{ store.overview.incomplete ? 'Known net worth' : 'Net worth' }}</span>
        <strong class="amount" data-testid="net-worth">{{
          formatMoney(store.overview.netWorth, currency)
        }}</strong>
        <small>{{
          store.overview.incomplete
            ? 'Incomplete · Some holdings need a price'
            : 'Everything you own, less what you owe'
        }}</small>
      </article>
      <article class="summary" aria-label="Assets">
        <span>{{ store.overview.incomplete ? 'Known assets' : 'Assets' }}</span>
        <strong class="amount" data-testid="assets">{{
          formatMoney(store.overview.assets, currency)
        }}</strong>
        <small
          >Cash, investments and other assets<span v-if="store.overview.incomplete">
            · Incomplete</span
          ></small
        >
      </article>
      <article class="summary" aria-label="Liabilities">
        <span>Liabilities</span>
        <strong class="amount" data-testid="liabilities">{{
          formatMoney(store.overview.liabilities, currency)
        }}</strong>
        <small>Outstanding debts and negative cash</small>
      </article>
    </div>
    <div v-if="unvalued.length" class="notice warning" role="status">
      <strong>Your totals are incomplete.</strong> Add a unit price to value these holdings:
      <ul>
        <li v-for="holding in unvalued" :key="holding.id">
          {{ holding.name }} ({{ holding.symbol }}) · {{ holding.account }}
        </li>
      </ul>
      <button class="secondary" @click="emit('navigate', 'accounts')">
        Update investment prices
      </button>
    </div>
    <div v-if="!hasRecords" class="empty welcome">
      <span class="welcome-mark" aria-hidden="true">+</span>
      <h2>Your portfolio starts with one record</h2>
      <p>
        Add a cash account, an investment, or something you own. Your overview will take shape as
        you go.
      </p>
      <div class="actions">
        <button @click="emit('navigate', 'accounts')">Add an account</button
        ><button class="secondary" @click="emit('navigate', 'records')">
          Add an asset or debt
        </button>
      </div>
    </div>
    <div class="detail-grid">
      <article class="card allocation">
        <div class="section-heading">
          <h2>Assets by category</h2>
          <span class="badge">{{ currency }}</span>
        </div>
        <dl>
          <div v-for="[category, amount] in assetCategories" :key="category">
            <dt>
              {{ categoryLabels[category]
              }}<small v-if="category === 'investments' && store.overview.incomplete"
                >Known value · Incomplete</small
              >
            </dt>
            <dd class="amount">{{ formatMoney(amount, currency) }}</dd>
          </div>
        </dl>
        <div class="total-line">
          <strong>{{ store.overview.incomplete ? 'Known assets' : 'Total assets' }}</strong
          ><strong class="amount">{{ formatMoney(store.overview.assets, currency) }}</strong>
        </div>
      </article>
      <article class="card snapshot">
        <p class="eyebrow">At a glance</p>
        <h2>Keep today up to date</h2>
        <p class="muted">
          Your latest saved balances and estimates carry forward until you update them. Earlier
          dates stay safely in your records and backups.
        </p>
        <div class="snapshot-row">
          <div>
            <strong>{{ store.portfolio?.accounts.length }}</strong
            ><span>Accounts</span>
          </div>
          <button class="quiet" @click="emit('navigate', 'accounts')">
            View accounts <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div class="snapshot-row">
          <div>
            <strong>{{ store.portfolio?.records.length }}</strong
            ><span>Assets & debts</span>
          </div>
          <button class="quiet" @click="emit('navigate', 'records')">
            View records <span aria-hidden="true">↗</span>
          </button>
        </div>
        <p class="snapshot-note">
          All amounts are in {{ currency }}. Values are manual estimates, with no live prices or
          currency conversion.
        </p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: 1.3fr 1fr 1fr;
  gap: 1rem;
}
.summary {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 1.7rem;
  background: white;
  display: flex;
  flex-direction: column;
  gap: 0.95rem;
}
.summary > span {
  font-size: 0.9rem;
  font-weight: 600;
}
.summary > strong {
  font-size: clamp(1.7rem, 3vw, 2.35rem);
  letter-spacing: -0.035em;
  font-weight: 600;
}
.summary small {
  margin-top: auto;
  font-size: 0.78rem;
}
.net-worth {
  background: var(--brand);
  color: white;
  border-color: var(--brand);
}
.net-worth small {
  color: #d4e7db;
}
.detail-grid {
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  gap: 1.25rem;
}
.local-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.77rem;
  color: var(--muted);
}
.local-label span {
  width: 7px;
  height: 7px;
  background: #5e886d;
  border-radius: 50%;
}
.allocation dl {
  margin: 0;
}
.allocation dl > div,
.total-line {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  padding: 0.8rem 0;
}
.allocation dt {
  font-size: 0.9rem;
}
.allocation dt small {
  display: block;
  color: var(--warning);
}
.allocation dd {
  margin: 0;
  text-align: right;
  font-size: 0.9rem;
  font-weight: 600;
}
.total-line {
  border-top: 1px solid var(--line);
  margin-top: 0.6rem;
  padding-bottom: 0;
  font-size: 0.9rem;
}
.total-line .amount {
  text-align: right;
}
.snapshot > p {
  font-size: 0.88rem;
}
.snapshot-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-block: 1rem;
  border-bottom: 1px solid var(--line);
  gap: 0.5rem;
}
.snapshot-row > div {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.snapshot-row strong {
  font-size: 1.45rem;
  font-weight: 500;
}
.snapshot-row span {
  font-size: 0.85rem;
}
.snapshot-note {
  color: var(--muted);
  margin-top: 1.3rem;
  margin-bottom: 0;
}
.welcome .actions {
  justify-content: center;
}
.welcome-mark {
  display: grid;
  place-items: center;
  margin: 0 auto 1rem;
  height: 45px;
  width: 45px;
  background: var(--tint);
  border-radius: 50%;
  color: var(--brand);
  font-size: 1.5rem;
}
.warning ul {
  padding-left: 1.25rem;
}
@media (max-width: 820px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .net-worth {
    grid-column: 1 / -1;
  }
  .detail-grid {
    grid-template-columns: 1fr;
  }
  .summary {
    padding: 1.25rem;
  }
}
@media (max-width: 400px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }
  .summary {
    gap: 0.5rem;
  }
}
</style>

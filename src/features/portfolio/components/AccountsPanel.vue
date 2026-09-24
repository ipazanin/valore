<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { usePortfolioStore } from '../application/store'
import { holdingValue, latestObservation } from '../domain/calculations'
import { formatMoney, formatQuantity } from '../domain/format'
import type { Account, Holding } from '../domain/types'
import { displayDate } from './labels'
import AccountForm from './AccountForm.vue'
import HoldingForm from './HoldingForm.vue'

const store = usePortfolioStore()
const currency = computed(() => store.portfolio?.settings.reportingCurrency ?? '')
const editingAccount = ref<Account>()
const accountFormOpen = ref(false)
const holdingDraft = ref<{ accountId: string; holding?: Holding }>()
const message = ref('')
const heading = ref<HTMLElement>()
function openAccount(account?: Account) {
  editingAccount.value = account
  holdingDraft.value = undefined
  accountFormOpen.value = true
  message.value = ''
}
function openHolding(accountId: string, holding?: Holding) {
  accountFormOpen.value = false
  holdingDraft.value = { accountId, holding }
  message.value = ''
}
async function closeForm(saved = false) {
  accountFormOpen.value = false
  holdingDraft.value = undefined
  if (saved) message.value = 'Saved in this browser.'
  await nextTick()
  heading.value?.focus()
}
const accounts = computed(() =>
  (store.portfolio?.accounts ?? []).map((account) => ({
    ...account,
    summary: store.overview?.accounts.find((summary) => summary.accountId === account.id),
    cashObservation: store.portfolio
      ? latestObservation(store.portfolio, 'cash', account.id)
      : undefined,
    holdings: (store.portfolio?.holdings ?? [])
      .filter((holding) => holding.accountId === account.id)
      .map((holding) => {
        const listing = store.portfolio!.listings.find(
          (listing) => listing.id === holding.listingId,
        )!
        return {
          ...holding,
          listing,
          instrument: store.portfolio!.instruments.find(
            (instrument) => instrument.id === listing.instrumentId,
          )!,
          quantity: latestObservation(store.portfolio!, 'quantity', holding.id),
          price: latestObservation(store.portfolio!, 'price', listing.id),
          amount: holdingValue(store.portfolio!, holding.id),
        }
      }),
  })),
)
</script>

<template>
  <section aria-labelledby="accounts-title" class="stack">
    <div class="section-heading">
      <div>
        <h1 id="accounts-title" ref="heading" tabindex="-1">Your accounts</h1>
        <p class="muted">Cash and investments, kept together.</p>
      </div>
      <button v-if="!accountFormOpen && !holdingDraft" @click="openAccount()">+ Add account</button>
    </div>
    <p v-if="message" role="status" class="notice">{{ message }}</p>
    <AccountForm
      v-if="accountFormOpen"
      :key="editingAccount?.id ?? 'new'"
      :account="editingAccount"
      @done="closeForm(true)"
      @cancel="closeForm()"
    />
    <HoldingForm
      v-if="holdingDraft"
      :key="holdingDraft.holding?.id ?? holdingDraft.accountId"
      v-bind="holdingDraft"
      @done="closeForm(true)"
      @cancel="closeForm()"
    />
    <div v-if="!accounts.length && !accountFormOpen" class="empty">
      <h2>A home for your cash and investments</h2>
      <p>
        Add a named account, enter its cash balance, then add any stocks or ETFs you hold there.
      </p>
      <button class="secondary" @click="openAccount()">Add your first account</button>
    </div>
    <article v-for="account in accounts" :key="account.id" class="card account">
      <div class="account-heading">
        <div class="account-title">
          <span class="account-icon" aria-hidden="true">{{
            account.name.charAt(0).toUpperCase()
          }}</span>
          <div>
            <h2>{{ account.name }}</h2>
            <span class="muted">{{ currency }} account</span>
          </div>
        </div>
        <div class="account-total">
          <small>{{
            account.summary?.incomplete ? 'Known account total · Incomplete' : 'Account total'
          }}</small
          ><strong class="amount">{{
            formatMoney(account.summary?.total ?? '0', currency)
          }}</strong>
        </div>
      </div>
      <div class="cash-row">
        <div>
          <strong>Cash balance</strong
          ><small v-if="account.cashObservation"
            >As of {{ displayDate(account.cashObservation.effectiveDate) }}</small
          >
        </div>
        <div class="row-end">
          <span class="amount" :class="{ negative: account.summary?.cash.startsWith('-') }">{{
            formatMoney(account.summary?.cash ?? '0', currency)
          }}</span
          ><button
            class="quiet"
            :disabled="store.saving"
            :aria-label="`Update ${account.name} cash`"
            @click="openAccount(account)"
          >
            Update
          </button>
        </div>
      </div>
      <ul v-if="account.holdings.length" class="holdings">
        <li v-for="holding in account.holdings" :key="holding.id">
          <div class="holding-details">
            <strong>{{ holding.instrument.name }}</strong>
            <small
              >{{ holding.listing.symbol }} · {{ holding.listing.exchange }} ·
              {{ holding.listing.currency
              }}<span v-if="holding.instrument.isin"> · {{ holding.instrument.isin }}</span></small
            >
            <small
              >{{ formatQuantity(holding.quantity?.amount ?? '0') }} units<span
                v-if="holding.price"
              >
                × {{ `${currency} ${formatQuantity(holding.price.amount)}` }} / unit</span
              ></small
            >
            <small v-if="holding.quantity"
              >Quantity: {{ displayDate(holding.quantity.effectiveDate)
              }}<span v-if="holding.price">
                · Price: {{ displayDate(holding.price.effectiveDate) }}</span
              ></small
            >
          </div>
          <div class="row-end">
            <span v-if="holding.amount === null" class="badge warning"
              >Unvalued · Price needed</span
            >
            <span v-else class="amount">{{ formatMoney(holding.amount, currency) }}</span>
            <button
              class="quiet"
              :disabled="store.saving"
              :aria-label="`Update ${holding.instrument.name} in ${account.name}`"
              @click="openHolding(account.id, holding)"
            >
              Update
            </button>
          </div>
        </li>
      </ul>
      <div class="account-footer">
        <small
          >{{ account.holdings.length }}
          {{ account.holdings.length === 1 ? 'holding' : 'holdings' }}</small
        ><button
          class="secondary"
          :disabled="store.saving"
          :aria-label="`Add holding to ${account.name}`"
          @click="openHolding(account.id)"
        >
          + Add holding
        </button>
      </div>
    </article>
    <p v-if="accounts.length" class="muted footnote">
      Account totals group their contents. Only the underlying cash and holdings count toward net
      worth. Negative cash is included once in liabilities.
    </p>
  </section>
</template>

<style scoped>
.account {
  padding-bottom: 0;
}
.account-heading,
.cash-row,
.holdings li,
.account-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.account-heading {
  padding-bottom: 1.4rem;
  border-bottom: 1px solid var(--line);
}
.account-title {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
}
.account-title h2 {
  margin-bottom: 0.25rem;
  overflow-wrap: anywhere;
}
.account-title .muted {
  font-size: 0.8rem;
}
.account-icon {
  display: grid;
  place-items: center;
  background: var(--tint);
  color: var(--brand);
  border-radius: 12px;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  font-weight: 650;
}
.account-total {
  display: grid;
  gap: 0.35rem;
  text-align: right;
}
.account-total strong {
  font-size: 1.25rem;
}
.cash-row,
.holdings li {
  padding: 1rem 0;
}
.cash-row small,
.holding-details small {
  display: block;
  margin-top: 0.3rem;
}
.holdings {
  margin: 0;
  padding: 0;
  list-style: none;
}
.holdings li {
  border-top: 1px solid var(--line);
}
.holding-details {
  overflow-wrap: anywhere;
  min-width: 0;
}
.row-end {
  display: flex;
  align-items: center;
  gap: 1rem;
  text-align: right;
}
.row-end .amount {
  font-weight: 600;
}
.negative {
  color: var(--danger);
}
.account-footer {
  border-top: 1px solid var(--line);
  padding-block: 1rem;
}
.footnote {
  font-size: 0.85rem;
}
@media (max-width: 650px) {
  .account-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .account-total {
    text-align: left;
  }
  .holdings li {
    flex-wrap: wrap;
  }
  .holdings .row-end {
    width: 100%;
    justify-content: space-between;
  }
  .cash-row .row-end {
    gap: 0.3rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}
</style>

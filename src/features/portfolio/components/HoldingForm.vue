<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { usePortfolioStore } from '../application/store'
import type { Holding } from '../domain/types'
import { latestObservation } from '../domain/calculations'
import { formatQuantity } from '../domain/format'
import { localToday } from '../domain/dates'

const props = defineProps<{ accountId: string; holding?: Holding }>()
const emit = defineEmits<{ done: []; cancel: [] }>()
const store = usePortfolioStore()
const expectedPortfolioEpoch = store.portfolioEpoch ?? ''
const originalListing = store.portfolio?.listings.find(
  (listing) => listing.id === props.holding?.listingId,
)
const originalInstrument = store.portfolio?.instruments.find(
  (instrument) => instrument.id === originalListing?.instrumentId,
)
const listingId = ref(originalListing?.id ?? '')
const name = ref(originalInstrument?.name ?? '')
const kind = ref<'stock' | 'etf'>(originalInstrument?.kind ?? 'etf')
const isin = ref(originalInstrument?.isin ?? '')
const symbol = ref(originalListing?.symbol ?? '')
const exchange = ref(originalListing?.exchange ?? '')
const quantity = ref(
  props.holding && store.portfolio
    ? (latestObservation(store.portfolio, 'quantity', props.holding.id)?.amount ?? '')
    : '',
)
const price = ref('')
const effectiveDate = ref(localToday())
const error = ref('')
const form = ref<HTMLFormElement>()
const currency = computed(() => store.portfolio?.settings.reportingCurrency ?? '')
const availableListings = computed(
  () =>
    store.portfolio?.listings.filter(
      (listing) =>
        !store.portfolio?.holdings.some(
          (holding) => holding.accountId === props.accountId && holding.listingId === listing.id,
        ),
    ) ?? [],
)
const selectedListing = computed(() =>
  store.portfolio?.listings.find((listing) => listing.id === listingId.value),
)
const selectedInstrument = computed(() =>
  store.portfolio?.instruments.find(
    (instrument) => instrument.id === selectedListing.value?.instrumentId,
  ),
)
const existingPrice = computed(() =>
  store.portfolio && listingId.value
    ? latestObservation(store.portfolio, 'price', listingId.value, effectiveDate.value)
    : undefined,
)
onMounted(() =>
  form.value?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled)')?.focus(),
)
async function save() {
  error.value = ''
  try {
    await store.saveHolding({
      expectedPortfolioEpoch,
      id: props.holding?.id,
      accountId: props.accountId,
      listingId: listingId.value || undefined,
      name: selectedInstrument.value?.name ?? name.value,
      kind: selectedInstrument.value?.kind ?? kind.value,
      isin: selectedInstrument.value?.isin ?? (isin.value.trim().toUpperCase() || null),
      symbol: selectedListing.value?.symbol ?? symbol.value,
      exchange: selectedListing.value?.exchange ?? exchange.value,
      quantity: quantity.value,
      price: price.value,
      effectiveDate: effectiveDate.value,
    })
    emit('done')
  } catch (failure) {
    error.value =
      failure instanceof Error
        ? failure.message
        : 'The holding could not be saved. Please try again.'
  }
}
</script>

<template>
  <form ref="form" class="card editor" aria-labelledby="holding-form-title" @submit.prevent="save">
    <h2 id="holding-form-title">{{ holding ? 'Update holding' : 'Add an investment holding' }}</h2>
    <p class="muted">
      Enter your total quantity, including fractions. Only listings traded in {{ currency }} are
      supported in this version.
    </p>
    <div class="form-grid">
      <div v-if="!holding && availableListings.length" class="field full-width">
        <label for="holding-listing">Listing</label>
        <select id="holding-listing" v-model="listingId" @change="price = ''">
          <option value="">Add a new listing</option>
          <option v-for="listing in availableListings" :key="listing.id" :value="listing.id">
            {{ listing.symbol }} · {{ listing.exchange }} · {{ listing.currency }}
          </option>
        </select>
      </div>
      <p v-if="selectedListing" class="notice full-width identity">
        <strong>{{ selectedInstrument?.name }}</strong
        ><br />
        {{ selectedListing.symbol }} · {{ selectedListing.exchange }} · {{ selectedListing.currency
        }}<br v-if="selectedInstrument?.isin" />
        {{ selectedInstrument?.isin }}
      </p>
      <template v-else>
        <div class="field">
          <label for="holding-name">Investment name</label>
          <input
            id="holding-name"
            v-model="name"
            required
            maxlength="120"
            placeholder="e.g. Global equity ETF"
            autocomplete="off"
          />
        </div>
        <div class="field">
          <label for="holding-kind">Investment type</label>
          <select id="holding-kind" v-model="kind">
            <option value="etf">ETF</option>
            <option value="stock">Stock</option>
          </select>
        </div>
        <div class="field">
          <label for="holding-symbol">Listing symbol</label>
          <input
            id="holding-symbol"
            v-model="symbol"
            required
            maxlength="40"
            placeholder="Symbol on the selected exchange"
            autocapitalize="characters"
            autocomplete="off"
          />
        </div>
        <div class="field">
          <label for="holding-exchange">Exchange</label>
          <input
            id="holding-exchange"
            v-model="exchange"
            required
            maxlength="80"
            placeholder="e.g. Xetra (XETR)"
            autocomplete="off"
          />
        </div>
        <div class="field">
          <label for="holding-isin">ISIN (optional)</label>
          <input
            id="holding-isin"
            v-model="isin"
            maxlength="12"
            placeholder="12-character instrument identifier"
            autocapitalize="characters"
            autocomplete="off"
          />
        </div>
        <div class="field">
          <label for="holding-currency">Trading currency</label>
          <input
            id="holding-currency"
            :value="currency"
            disabled
            aria-describedby="holding-currency-hint"
          />
          <small id="holding-currency-hint"
            >Use the listing’s trading currency, not the fund’s base currency. No currency
            conversion is available.</small
          >
        </div>
      </template>
      <div class="field">
        <label for="holding-quantity">
          {{ effectiveDate === localToday() ? 'Total quantity today' : 'Total quantity on selected date' }}
        </label>
        <input
          id="holding-quantity"
          v-model="quantity"
          required
          inputmode="decimal"
          maxlength="31"
          placeholder="e.g. 12.5"
          aria-describedby="quantity-hint"
        />
        <small id="quantity-hint">Use a decimal point, without separators.</small>
      </div>
      <div class="field">
        <label for="holding-price">
          {{ effectiveDate === localToday() ? 'Unit price today' : 'Unit price on selected date' }}
          ({{ currency }}, optional)
        </label>
        <input
          id="holding-price"
          v-model="price"
          inputmode="decimal"
          maxlength="31"
          placeholder="Enter a price or leave blank"
          aria-describedby="price-hint"
        />
        <small id="price-hint"
          >{{
            existingPrice
              ? `Leave blank to keep ${`${currency} ${formatQuantity(existingPrice.amount)}`} from ${existingPrice.effectiveDate}.`
              : 'A positive quantity without a price will be marked unvalued.'
          }}
          Prices apply to this listing in every account.</small
        >
      </div>
      <div class="field">
        <label for="holding-effective-date">Quantity and price date</label>
        <input
          id="holding-effective-date"
          v-model="effectiveDate"
          type="date"
          required
          :max="localToday()"
        />
        <small>
          Both entered observations use this date. Leave price blank to keep the saved price.
        </small>
      </div>
    </div>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <div class="actions">
      <button :disabled="store.saving" type="submit">
        {{ store.saving ? 'Saving…' : 'Save holding' }}
      </button>
      <button :disabled="store.saving" type="button" class="secondary" @click="emit('cancel')">
        Cancel
      </button>
    </div>
  </form>
</template>

<style scoped>
.identity {
  background: white;
  margin: 0;
}
.error {
  margin-top: 1rem;
  margin-bottom: 0;
}
</style>

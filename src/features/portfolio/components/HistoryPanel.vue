<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { usePortfolioStore } from '../application/store'
import { latestObservation } from '../domain/calculations'
import { isLocalDate, localToday } from '../domain/dates'
import { formatQuantity } from '../domain/format'
import type { Observation, ObservationKind } from '../domain/types'
import { displayDate, recordCategories } from './labels'
import ObservationForm from './ObservationForm.vue'

interface HistorySubject {
  key: string
  kind: ObservationKind
  id: string
  label: string
}

const store = usePortfolioStore()
const selectedKey = ref('')
const asOfDate = ref(localToday())
const editing = ref<Observation | 'new' | null>(null)
const pendingDelete = ref<{ id: string; epoch: string } | null>(null)
const error = ref('')
const savedObservationsHeading = ref<HTMLHeadingElement>()
const currency = computed(() => store.portfolio?.settings.reportingCurrency ?? '')
const validAsOfDate = computed(
  () => isLocalDate(asOfDate.value) && asOfDate.value <= localToday(),
)

const subjects = computed<HistorySubject[]>(() => {
  const portfolio = store.portfolio
  if (!portfolio) return []

  const accounts: HistorySubject[] = portfolio.accounts.map((account) => ({
    key: `cash:${account.id}`,
    kind: 'cash',
    id: account.id,
    label: `Cash · ${account.name}`,
  }))
  const holdings: HistorySubject[] = portfolio.holdings.map((holding) => {
    const account = portfolio.accounts.find((candidate) => candidate.id === holding.accountId)
    const listing = portfolio.listings.find((candidate) => candidate.id === holding.listingId)
    const instrument = portfolio.instruments.find(
      (candidate) => candidate.id === listing?.instrumentId,
    )
    return {
      key: `quantity:${holding.id}`,
      kind: 'quantity',
      id: holding.id,
      label:
        `Quantity · ${instrument?.name ?? 'Investment'} ` +
        `(${listing?.symbol ?? 'Unknown listing'}) · ${account?.name ?? 'Unknown account'}`,
    }
  })
  const prices: HistorySubject[] = portfolio.listings.map((listing) => {
    const instrument = portfolio.instruments.find(
      (candidate) => candidate.id === listing.instrumentId,
    )
    return {
      key: `price:${listing.id}`,
      kind: 'price',
      id: listing.id,
      label:
        `Shared price · ${instrument?.name ?? 'Investment'} ` +
        `(${listing.symbol} · ${listing.exchange})`,
    }
  })
  const valuations: HistorySubject[] = portfolio.records.map((record) => ({
    key: `valuation:${record.id}`,
    kind: 'valuation',
    id: record.id,
    label: `Value · ${record.name} (${recordCategories[record.category]})`,
  }))
  return [...accounts, ...holdings, ...prices, ...valuations]
})

watch(
  subjects,
  (available) => {
    if (!available.some((subject) => subject.key === selectedKey.value)) {
      selectedKey.value = available[0]?.key ?? ''
    }
  },
  { immediate: true },
)

const selectedSubject = computed(() =>
  subjects.value.find((subject) => subject.key === selectedKey.value),
)
const closure = computed(() => {
  const subject = selectedSubject.value
  const portfolio = store.portfolio
  if (!subject || !portfolio) return null
  if (subject.kind === 'cash') {
    const account = portfolio.accounts.find((candidate) => candidate.id === subject.id)
    return account?.closedOn ? { date: account.closedOn, reason: 'This account' } : null
  }
  if (subject.kind === 'valuation') {
    const record = portfolio.records.find((candidate) => candidate.id === subject.id)
    return record?.closedOn ? { date: record.closedOn, reason: 'This record' } : null
  }
  if (subject.kind === 'quantity') {
    const holding = portfolio.holdings.find((candidate) => candidate.id === subject.id)
    const account = portfolio.accounts.find((candidate) => candidate.id === holding?.accountId)
    if (holding?.closedOn && (!account?.closedOn || holding.closedOn <= account.closedOn)) {
      return { date: holding.closedOn, reason: 'This holding' }
    }
    return account?.closedOn ? { date: account.closedOn, reason: 'Its account' } : null
  }
  return null
})
const excludedOnAsOfDate = computed(
  () => validAsOfDate.value && Boolean(closure.value && asOfDate.value >= closure.value.date),
)
const observations = computed(() => {
  const subject = selectedSubject.value
  if (!subject) return []
  return (store.portfolio?.observations ?? [])
    .filter(
      (observation) => observation.kind === subject.kind && observation.subjectId === subject.id,
    )
    .sort((first, second) => second.effectiveDate.localeCompare(first.effectiveDate))
})
const applicable = computed(() => {
  const subject = selectedSubject.value
  return subject && store.portfolio && validAsOfDate.value && !excludedOnAsOfDate.value
    ? latestObservation(store.portfolio, subject.kind, subject.id, asOfDate.value)
    : undefined
})

function dateMillis(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`)
}

const ageDays = computed(() =>
  applicable.value
    ? Math.round(
        (dateMillis(asOfDate.value) - dateMillis(applicable.value.effectiveDate)) / 86_400_000,
      )
    : null,
)

function formattedAmount(observation: Observation): string {
  if (observation.kind === 'quantity') {
    return formatQuantity(observation.amount)
  }
  const negative = observation.amount.startsWith('-')
  const magnitude = negative ? observation.amount.slice(1) : observation.amount
  return `${negative ? '-' : ''}${currency.value} ${formatQuantity(magnitude)}`
}

function clearActions() {
  editing.value = null
  pendingDelete.value = null
  error.value = ''
}

async function finishEditing() {
  clearActions()
  await nextTick()
  savedObservationsHeading.value?.focus()
}

function startEdit(observation: Observation) {
  pendingDelete.value = null
  editing.value = observation
  error.value = ''
}

function startDelete(observation: Observation) {
  editing.value = null
  pendingDelete.value = { id: observation.id, epoch: store.portfolioEpoch ?? '' }
  error.value = ''
}

async function cancelDelete() {
  pendingDelete.value = null
  await nextTick()
  savedObservationsHeading.value?.focus()
}

async function deleteObservation() {
  const confirmation = pendingDelete.value
  if (!confirmation) return
  error.value = ''
  try {
    await store.deleteObservation(confirmation.id, confirmation.epoch)
    pendingDelete.value = null
    await nextTick()
    savedObservationsHeading.value?.focus()
  } catch (failure) {
    error.value =
      failure instanceof Error ? failure.message : 'The observation could not be deleted.'
  }
}
</script>

<template>
  <section class="stack" aria-labelledby="history-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Your saved dates</p>
        <h1 id="history-title">History</h1>
        <p class="muted">
          Review the amount in effect on a date, then add or correct saved observations.
        </p>
      </div>
    </div>
    <div v-if="!subjects.length" class="empty">
      <h2>No records yet</h2>
      <p>Add an account, investment holding, asset, or debt to begin its history.</p>
    </div>
    <template v-else>
      <div class="card form-grid">
        <div class="field">
          <label for="history-subject">Record</label>
          <select id="history-subject" v-model="selectedKey" @change="clearActions">
            <option v-for="subject in subjects" :key="subject.key" :value="subject.key">
              {{ subject.label }}
            </option>
          </select>
        </div>
        <div class="field">
          <label for="history-as-of">As-of date</label>
          <input id="history-as-of" v-model="asOfDate" type="date" required :max="localToday()" />
        </div>
      </div>
      <article class="card" aria-labelledby="applicable-title">
        <h2 id="applicable-title">
          {{ validAsOfDate ? `Applicable on ${displayDate(asOfDate)}` : 'Choose an as-of date' }}
        </h2>
        <p v-if="applicable" class="applicable-value amount">{{ formattedAmount(applicable) }}</p>
        <p v-if="applicable" class="muted">
          Saved for {{ displayDate(applicable.effectiveDate) }} ·
          {{ ageDays === 0 ? 'Same day' : `${ageDays} ${ageDays === 1 ? 'day' : 'days'} old` }}
        </p>
        <p v-else-if="!validAsOfDate" class="muted">Enter a valid current or past date.</p>
        <p v-else-if="excludedOnAsOfDate" class="muted">
          No value applies on this date because this record is archived.
        </p>
        <p v-else class="muted">No observation applies on this date.</p>
        <p v-if="closure" class="notice archive-notice">
          {{ closure.reason }} is archived from {{ displayDate(closure.date) }}. Earlier saved
          observations remain below.
        </p>
        <p v-if="selectedSubject?.kind === 'price'" class="muted">
          This listing price is shared by holdings in every account.
        </p>
      </article>
      <div class="section-heading history-heading">
        <h2 ref="savedObservationsHeading" tabindex="-1">Saved observations</h2>
        <button
          v-if="!editing"
          type="button"
          @click="editing = 'new'; pendingDelete = null"
        >
          Add observation
        </button>
      </div>
      <ObservationForm
        v-if="selectedSubject && editing"
        :key="editing === 'new' ? `new-${selectedSubject.key}` : editing.id"
        :kind="selectedSubject.kind"
        :subject-id="selectedSubject.id"
        :subject-label="selectedSubject.label"
        :initial-date="validAsOfDate ? asOfDate : localToday()"
        :observation="editing === 'new' ? undefined : editing"
        @done="finishEditing"
        @cancel="finishEditing"
      />
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <div v-if="!observations.length" class="empty">No saved observations for this record.</div>
      <div v-else class="observation-list">
        <article
          v-for="observation in observations"
          :key="observation.id"
          class="card observation-row"
        >
          <div>
            <strong>{{ displayDate(observation.effectiveDate) }}</strong>
            <p class="amount">{{ formattedAmount(observation) }}</p>
          </div>
          <div
            v-if="pendingDelete?.id === observation.id"
            class="delete-confirmation"
            role="group"
            :aria-label="`Delete observation from ${displayDate(observation.effectiveDate)}?`"
          >
            <strong>Delete this observation?</strong>
            <span>
              Earlier values may carry forward, or this record may have no value on some dates.
            </span>
            <div class="actions">
              <button type="button" class="danger" :disabled="store.saving" @click="deleteObservation">
                Confirm delete
              </button>
              <button type="button" class="secondary" :disabled="store.saving" @click="cancelDelete">
                Cancel
              </button>
            </div>
          </div>
          <div v-else class="actions">
            <button
              type="button"
              class="secondary"
              :disabled="store.saving"
              :aria-label="`Edit observation from ${displayDate(observation.effectiveDate)}`"
              @click="startEdit(observation)"
            >
              Edit
            </button>
            <button
              type="button"
              class="secondary"
              :disabled="store.saving"
              :aria-label="`Delete observation from ${displayDate(observation.effectiveDate)}`"
              @click="startDelete(observation)"
            >
              Delete
            </button>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>

<style scoped>
.history-heading {
  margin-bottom: 0;
}
.applicable-value {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}
.archive-notice {
  margin-bottom: 0;
}
.observation-list {
  display: grid;
  gap: 0.75rem;
}
.observation-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
}
.observation-row p {
  margin: 0.35rem 0 0;
}
.delete-confirmation {
  display: grid;
  gap: 0.5rem;
  max-width: 24rem;
}
.delete-confirmation span {
  color: var(--muted);
  font-size: 0.88rem;
}
@media (max-width: 600px) {
  .observation-row,
  .delete-confirmation {
    width: 100%;
  }
}
</style>

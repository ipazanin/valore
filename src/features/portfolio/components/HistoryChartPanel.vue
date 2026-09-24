<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { buildHistory, type HistoryPoint, type HistorySource } from '../domain/history'
import { localToday } from '../domain/dates'
import type { Portfolio } from '../domain/types'
import { displayDate } from './labels'
import HistoryLineChart from './HistoryLineChart.vue'
import { calendarMonthsBefore, formatExactMoney, formatExactNumber } from './historyPresentation'

const props = defineProps<{ portfolio: Portfolio; currency: string }>()
type Range = 'all' | 'year' | 'quarter'
const range = ref<Range>('all')
const today = ref(localToday())
let dateRefreshTimer: number | undefined

function refreshToday() {
  today.value = localToday()
}

watch(() => props.portfolio, refreshToday)
onMounted(() => {
  document.addEventListener('visibilitychange', refreshToday)
  dateRefreshTimer = window.setInterval(refreshToday, 60_000)
})
onUnmounted(() => {
  document.removeEventListener('visibilitychange', refreshToday)
  if (dateRefreshTimer !== undefined) window.clearInterval(dateRefreshTimer)
})

const startDate = computed(() => {
  if (range.value === 'year') return calendarMonthsBefore(today.value, 12)
  if (range.value === 'quarter') return calendarMonthsBefore(today.value, 3)
  return undefined
})
const points = computed(() =>
  buildHistory(props.portfolio, { startDate: startDate.value, endDate: today.value }),
)
const newestFirst = computed(() => [...points.value].reverse())

function holdingName(holdingId: string): string {
  const holding = props.portfolio.holdings.find((candidate) => candidate.id === holdingId)
  const listing = props.portfolio.listings.find((candidate) => candidate.id === holding?.listingId)
  const instrument = props.portfolio.instruments.find(
    (candidate) => candidate.id === listing?.instrumentId,
  )
  const account = props.portfolio.accounts.find((candidate) => candidate.id === holding?.accountId)
  return (
    `${instrument?.name ?? 'Investment'} (${listing?.symbol ?? 'Unknown listing'})` +
    ` · ${account?.name ?? 'Unknown account'}`
  )
}

function sourceLabel(source: HistorySource): string {
  if (source.kind === 'cash') {
    const account = props.portfolio.accounts.find((candidate) => candidate.id === source.subjectId)
    return `Cash · ${account?.name ?? 'Unknown account'}`
  }
  if (source.kind === 'quantity') return `Quantity · ${holdingName(source.subjectId)}`
  if (source.kind === 'price') {
    const listing = props.portfolio.listings.find(
      (candidate) => candidate.id === source.subjectId,
    )
    const instrument = props.portfolio.instruments.find(
      (candidate) => candidate.id === listing?.instrumentId,
    )
    return (
      `Shared price · ${instrument?.name ?? 'Investment'}` +
      ` (${listing?.symbol ?? 'Unknown listing'})`
    )
  }
  const record = props.portfolio.records.find((candidate) => candidate.id === source.subjectId)
  return `Value · ${record?.name ?? 'Unknown record'}`
}

function sourceAmount(source: HistorySource): string {
  return source.kind === 'quantity'
    ? formatExactNumber(source.amount)
    : formatExactMoney(source.amount, props.currency)
}

function ageLabel(ageDays: number): string {
  return ageDays === 0 ? 'same day' : `${ageDays} ${ageDays === 1 ? 'day' : 'days'} old`
}

function incompleteLabel(point: HistoryPoint): string {
  const count = point.overview.unvaluedHoldings.length
  return `${count} ${count === 1 ? 'holding' : 'holdings'} without a price`
}
</script>

<template>
  <section class="card history-chart-panel" aria-labelledby="history-chart-title">
    <div class="section-heading">
      <div>
        <h2 id="history-chart-title">Dated balances</h2>
        <p class="muted">Saved amounts carry forward until their next dated change or closure.</p>
      </div>
      <span class="badge">{{ currency }}</span>
    </div>
    <fieldset class="range-controls">
      <legend>Time range</legend>
      <label><input v-model="range" type="radio" value="all" /> All</label>
      <label><input v-model="range" type="radio" value="year" /> 1 year</label>
      <label><input v-model="range" type="radio" value="quarter" /> 3 months</label>
    </fieldset>
    <div v-if="!points.length" class="empty">
      <p>No dated observations in this range.</p>
    </div>
    <template v-else>
      <p v-if="points.length === 1" class="muted">
        One dated value is available. Add another dated observation to see a change over time.
      </p>
      <HistoryLineChart :points="points" :currency="currency" />
      <div class="table-scroll" role="region" aria-label="Dated balances table" tabindex="0">
        <table>
          <caption>
            Exact dated assets, liabilities, net worth, and valuation sources
          </caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Assets</th>
              <th scope="col">Liabilities</th>
              <th scope="col">Net worth</th>
              <th scope="col">Completeness</th>
              <th scope="col">Valuation sources</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="point in newestFirst" :key="point.date">
              <th scope="row">{{ displayDate(point.date) }}</th>
              <td class="amount">
                {{ formatExactMoney(point.overview.assets, currency) }}
                <small v-if="point.overview.incomplete">Known amount</small>
              </td>
              <td class="amount">{{ formatExactMoney(point.overview.liabilities, currency) }}</td>
              <td class="amount">
                {{ formatExactMoney(point.overview.netWorth, currency) }}
                <small v-if="point.overview.incomplete">Known amount</small>
              </td>
              <td>
                <template v-if="point.overview.incomplete">
                  <span class="badge warning">Incomplete</span>
                  <span class="sr-only">{{ incompleteLabel(point) }}</span>
                  <ul class="unvalued-list">
                    <li v-for="holdingId in point.overview.unvaluedHoldings" :key="holdingId">
                      {{ holdingName(holdingId) }} · price needed
                    </li>
                  </ul>
                </template>
                <span v-else>Complete</span>
              </td>
              <td>
                <details v-if="point.sources.length">
                  <summary>{{ point.sources.length }} sources</summary>
                  <ul class="source-list">
                    <li v-for="source in point.sources" :key="`${source.kind}:${source.subjectId}`">
                      <strong>{{ sourceLabel(source) }}</strong>
                      <span class="amount">{{ sourceAmount(source) }}</span>
                      <small>
                        Saved {{ displayDate(source.sourceDate) }} · {{ ageLabel(source.ageDays) }}
                      </small>
                    </li>
                  </ul>
                </details>
                <span v-else>No saved source</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.history-chart-panel {
  display: grid;
  gap: 1.2rem;
}
.history-chart-panel .section-heading,
.history-chart-panel .section-heading p {
  margin-bottom: 0;
}
.range-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.2rem;
  padding: 0;
  border: 0;
}
.range-controls legend {
  margin-bottom: 0.4rem;
  font-weight: 600;
}
.range-controls label {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 44px;
  cursor: pointer;
}
.range-controls input {
  width: 18px;
  height: 18px;
  min-height: 18px;
}
.table-scroll {
  position: relative;
  max-width: 100%;
  overflow-x: auto;
}
table {
  width: 100%;
  min-width: 50rem;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.86rem;
}
caption {
  text-align: left;
  font-weight: 600;
  padding-bottom: 0.65rem;
}
th,
td {
  padding: 0.85rem 0.7rem;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}
th[scope='row'] {
  white-space: nowrap;
}
td.amount {
  white-space: nowrap;
}
td small {
  display: block;
  color: var(--muted);
}
.unvalued-list,
.source-list {
  padding-left: 1.1rem;
  margin: 0.4rem 0 0;
}
.source-list {
  min-width: 15rem;
}
.source-list li + li {
  margin-top: 0.6rem;
}
.source-list strong,
.source-list span,
.source-list small {
  display: block;
}
</style>

<script setup lang="ts">
import { ArcElement, Chart, DoughnutController, Tooltip } from 'chart.js'
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { resolvedTheme } from '../../appearance/theme'
import { calculateAllocation } from '../domain/allocation'
import { MoneyDecimal } from '../domain/decimal'
import { formatMoney } from '../domain/format'
import type { Overview } from '../domain/types'
import { categoryLabels } from './labels'

Chart.register(DoughnutController, ArcElement, Tooltip)

const props = defineProps<{
  overview: Overview
  currency: string
  unvaluedHoldings: string[]
}>()
const headingId = useId()
const tableId = useId()
const canvas = ref<HTMLCanvasElement>()
const allocation = computed(() => calculateAllocation(props.overview))
const hasAssets = computed(() => new MoneyDecimal(props.overview.assets).greaterThan(0))
const title = computed(() =>
  props.overview.incomplete ? 'Known asset allocation' : 'Asset allocation',
)
const categoryColors = computed(() => {
  resolvedTheme.value
  const styles = getComputedStyle(document.documentElement)
  return {
    cash: styles.getPropertyValue('--chart-cash').trim(),
    investments: styles.getPropertyValue('--chart-investments').trim(),
    property: styles.getPropertyValue('--chart-property').trim(),
    possessions: styles.getPropertyValue('--chart-possessions').trim(),
    other: styles.getPropertyValue('--chart-other').trim(),
    lent: styles.getPropertyValue('--chart-lent').trim(),
  }
})
let chart: Chart<'doughnut'> | undefined

function formatPercentage(percentage: string | null): string {
  if (percentage === null) return '—'
  const decimal = new MoneyDecimal(percentage)
  if (decimal.greaterThan(0) && decimal.lessThan('0.01')) return '<0.01%'
  return `${decimal.toFixed(2)}%`
}

function renderChart(): void {
  chart?.destroy()
  chart = undefined
  if (!canvas.value || !hasAssets.value) return
  const styles = getComputedStyle(canvas.value)
  chart = new Chart(canvas.value, {
    type: 'doughnut',
    data: {
      labels: allocation.value.map((category) => categoryLabels[category.category]),
      datasets: [
        {
          data: allocation.value.map((category) => Number(category.percentage ?? '0')),
          backgroundColor: allocation.value.map((category) => categoryColors.value[category.category]),
          borderColor: styles.getPropertyValue('--surface').trim(),
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: styles.getPropertyValue('--surface').trim(),
          titleColor: styles.getPropertyValue('--ink').trim(),
          bodyColor: styles.getPropertyValue('--ink').trim(),
          borderColor: styles.getPropertyValue('--line').trim(),
          borderWidth: 1,
          titleFont: { family: styles.fontFamily },
          bodyFont: { family: styles.fontFamily },
          callbacks: {
            label: (context) => {
              const category = allocation.value[context.dataIndex]!
              return `${formatMoney(category.amount, props.currency)} · ${
                formatPercentage(category.percentage)
              }`
            },
          },
        },
      },
    },
  })
}

watch([allocation, canvas, () => props.currency, resolvedTheme], renderChart, { flush: 'post' })
onBeforeUnmount(() => chart?.destroy())
</script>

<template>
  <article class="card allocation" :aria-labelledby="headingId">
    <div class="section-heading">
      <h2 :id="headingId">{{ title }}</h2>
      <span class="badge">{{ currency }}</span>
    </div>
    <div v-if="overview.incomplete" class="notice warning">
      <strong>Incomplete · Known values only.</strong>
      <p>Holdings without a price are excluded from the amounts and percentages.</p>
      <ul v-if="unvaluedHoldings.length">
        <li v-for="(holding, index) in unvaluedHoldings" :key="index">{{ holding }}</li>
      </ul>
    </div>
    <div v-if="hasAssets" class="chart-container">
      <canvas
        ref="canvas"
        role="img"
        :aria-label="title"
        :aria-describedby="tableId"
      ></canvas>
    </div>
    <p v-else class="empty-allocation">
      No known assets to allocate. Percentages are unavailable until an asset has a positive value.
    </p>
    <div class="allocation-table" role="region" aria-label="Asset allocation table" tabindex="0">
      <table :id="tableId">
        <caption>{{ title }} by category</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Amount</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="category in allocation" :key="category.category">
            <th scope="row">
              <span
                class="swatch"
                :style="{ backgroundColor: categoryColors[category.category] }"
                aria-hidden="true"
              ></span>
              {{ categoryLabels[category.category] }}
            </th>
            <td class="amount">{{ formatMoney(category.amount, currency) }}</td>
            <td class="amount">{{ formatPercentage(category.percentage) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{{ overview.incomplete ? 'Known assets' : 'Total assets' }}</th>
            <td class="amount">{{ formatMoney(overview.assets, currency) }}</td>
            <td class="amount">{{ hasAssets ? '100.00%' : '—' }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p class="allocation-note">
      Shares use {{ overview.incomplete ? 'known' : 'total' }} assets and are rounded to two decimal
      places. Debts and negative cash remain in liabilities.
    </p>
  </article>
</template>

<style scoped>
.allocation {
  min-width: 0;
}
.chart-container {
  position: relative;
  width: min(100%, 280px);
  height: 240px;
  margin: 1.5rem auto;
}
.allocation-table {
  width: 100%;
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}
caption {
  text-align: left;
  font-weight: 600;
  padding-bottom: 0.7rem;
}
th,
td {
  text-align: left;
  padding: 0.8rem 0.35rem;
  border-bottom: 1px solid var(--line);
}
thead th {
  color: var(--muted);
  font-size: 0.78rem;
}
tbody th {
  font-weight: 500;
}
th:first-child {
  padding-left: 0;
}
th:not(:first-child),
td {
  text-align: right;
}
td:last-child {
  white-space: nowrap;
  padding-right: 0;
}
tfoot th,
tfoot td {
  font-weight: 600;
  border-bottom: 0;
}
.swatch {
  display: inline-block;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  margin-right: 0.35rem;
}
.empty-allocation,
.allocation-note {
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--muted);
}
.empty-allocation {
  margin-block: 1.5rem;
}
.allocation-note {
  margin: 1rem 0 0;
}
.notice p {
  margin: 0.4rem 0 0;
}
.notice ul {
  margin-bottom: 0;
  padding-left: 1.25rem;
}
</style>

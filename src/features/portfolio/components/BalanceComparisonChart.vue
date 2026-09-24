<script setup lang="ts">
import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js'
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { resolvedTheme } from '../../appearance/theme'
import { MoneyDecimal } from '../domain/decimal'
import { formatMoney } from '../domain/format'
import type { Overview } from '../domain/types'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

const props = defineProps<{ overview: Overview; currency: string }>()
const headingId = useId()
const tableId = useId()
const canvas = ref<HTMLCanvasElement>()
const balances = computed(() => [
  { label: props.overview.incomplete ? 'Known assets' : 'Assets', amount: props.overview.assets },
  { label: 'Liabilities', amount: props.overview.liabilities },
])
const netWorthLabel = computed(() => props.overview.incomplete ? 'Known net worth' : 'Net worth')
const hasBalances = computed(() =>
  balances.value.some((balance) => new MoneyDecimal(balance.amount).greaterThan(0)),
)
const negativeNetWorth = computed(() => new MoneyDecimal(props.overview.netWorth).isNegative())
let chart: Chart<'bar'> | undefined

function renderChart(): void {
  chart?.destroy()
  chart = undefined
  if (!canvas.value || !hasBalances.value) return
  const styles = getComputedStyle(canvas.value)
  const assetColor = styles.getPropertyValue('--brand').trim()
  const liabilityColor = styles.getPropertyValue('--danger').trim()
  const textColor = styles.getPropertyValue('--muted').trim()
  const lineColor = styles.getPropertyValue('--line').trim()
  const axisColor = styles.getPropertyValue('--chart-axis').trim()
  chart = new Chart(canvas.value, {
    type: 'bar',
    data: {
      labels: balances.value.map((balance) => balance.label),
      datasets: [
        {
          data: balances.value.map((balance) => Number(balance.amount)),
          backgroundColor: [assetColor, styles.getPropertyValue('--surface').trim()],
          borderColor: [assetColor, liabilityColor],
          borderWidth: [0, 3],
          borderSkipped: false,
          maxBarThickness: 38,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          type: 'linear',
          beginAtZero: true,
          min: 0,
          grid: { color: lineColor },
          border: { color: axisColor },
          title: {
            display: true,
            text: props.currency,
            color: textColor,
            font: { family: styles.fontFamily },
          },
          ticks: {
            color: textColor,
            font: { family: styles.fontFamily },
            maxTicksLimit: 5,
            format: { notation: 'compact', maximumFractionDigits: 2 },
          },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: textColor, font: { family: styles.fontFamily } },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: styles.getPropertyValue('--surface').trim(),
          titleColor: styles.getPropertyValue('--ink').trim(),
          bodyColor: styles.getPropertyValue('--ink').trim(),
          borderColor: lineColor,
          borderWidth: 1,
          titleFont: { family: styles.fontFamily },
          bodyFont: { family: styles.fontFamily },
          callbacks: {
            label: (context) =>
              formatMoney(balances.value[context.dataIndex]!.amount, props.currency),
          },
        },
      },
    },
  })
}

watch([balances, canvas, () => props.currency, resolvedTheme], renderChart, { flush: 'post' })
onBeforeUnmount(() => chart?.destroy())
</script>

<template>
  <article class="card comparison" :aria-labelledby="headingId">
    <div class="section-heading">
      <h2 :id="headingId">Assets and liabilities</h2>
      <span class="badge">{{ currency }}</span>
    </div>
    <p v-if="overview.incomplete" class="notice warning">
      <strong>Incomplete · Known values only.</strong> Assets and net worth exclude holdings
      without a price. Liabilities include all recorded debts and negative cash.
    </p>
    <div v-if="hasBalances" class="chart-container">
      <canvas
        ref="canvas"
        role="img"
        aria-label="Assets and liabilities, on a common scale from zero. Values in the table."
        :aria-describedby="tableId"
      ></canvas>
    </div>
    <p v-else class="empty-comparison">
      {{ overview.incomplete
        ? 'Known assets and liabilities are both zero. Holdings without prices remain unvalued.'
        : 'No recorded assets or liabilities to compare. Both totals and net worth are zero.' }}
    </p>
    <div class="comparison-table" role="region" aria-label="Balance comparison table" tabindex="0">
      <table :id="tableId">
        <caption>Assets, liabilities and net worth</caption>
        <thead>
          <tr>
            <th scope="col">Balance</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(balance, index) in balances" :key="index">
            <th scope="row">
              <span class="swatch" :class="{ liability: index === 1 }" aria-hidden="true"></span>
              {{ balance.label }}
            </th>
            <td class="amount">{{ formatMoney(balance.amount, currency) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{{ netWorthLabel }}</th>
            <td class="amount" :class="{ negative: negativeNetWorth }">
              {{ formatMoney(overview.netWorth, currency) }}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p class="comparison-note">
      Net worth is assets minus liabilities. Liabilities are shown as the positive amount owed.
    </p>
  </article>
</template>

<style scoped>
.comparison {
  min-width: 0;
}
.chart-container {
  position: relative;
  width: 100%;
  height: 230px;
  margin-block: 1rem;
}
.comparison-table {
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
th:first-child {
  padding-left: 0;
}
th:last-child,
td {
  text-align: right;
  padding-right: 0;
}
thead th {
  color: var(--muted);
  font-size: 0.78rem;
}
tbody th {
  font-weight: 500;
}
tfoot th,
tfoot td {
  font-weight: 600;
  border-bottom: 0;
}
.swatch {
  display: inline-block;
  width: 0.9rem;
  height: 0.65rem;
  margin-right: 0.35rem;
  background: var(--brand);
}
.swatch.liability {
  border: 2px solid var(--danger);
  background: var(--surface);
}
.negative {
  color: var(--danger);
}
.empty-comparison,
.comparison-note {
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.5;
}
.empty-comparison {
  margin-block: 1.5rem;
}
.comparison-note {
  margin: 1rem 0 0;
}
</style>

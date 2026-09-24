<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Chart from 'chart.js/auto'
import 'chartjs-adapter-luxon'
import { resolvedTheme } from '../../appearance/theme'
import type { HistoryPoint } from '../domain/history'
import { displayDate } from './labels'
import {
  canvasHistorySeries,
  carriedStepMode,
  formatExactMoney,
  type CanvasHistoryPoint,
  type HistorySeries,
} from './historyPresentation'

const props = defineProps<{ points: HistoryPoint[]; currency: string }>()
const canvas = ref<HTMLCanvasElement>()
const visible = ref<Record<HistorySeries, boolean>>({
  netWorth: true,
  assets: true,
  liabilities: true,
})
const anyVisible = computed(() => Object.values(visible.value).some(Boolean))
let chart: Chart<'line'> | null = null

const seriesStyles: Record<HistorySeries, {
  label: string
  colorToken: string
  dash: number[]
  pointStyle: 'circle' | 'triangle' | 'rectRot'
}> = {
  netWorth: { label: 'Net worth', colorToken: '--chart-net-worth', dash: [], pointStyle: 'circle' },
  assets: { label: 'Assets', colorToken: '--chart-assets', dash: [7, 4], pointStyle: 'triangle' },
  liabilities: {
    label: 'Liabilities',
    colorToken: '--chart-liabilities',
    dash: [2, 4],
    pointStyle: 'rectRot',
  },
}

function datasets(styles: CSSStyleDeclaration) {
  return (Object.keys(seriesStyles) as HistorySeries[])
    .filter((series) => visible.value[series])
    .map((series) => {
      const style = seriesStyles[series]
      const color = styles.getPropertyValue(style.colorToken).trim()
      return {
        label: style.label,
        data: canvasHistorySeries(props.points, series),
        borderColor: color,
        backgroundColor: color,
        borderDash: style.dash,
        pointStyle: style.pointStyle,
        pointRadius: (context: { raw: unknown }) =>
          (context.raw as CanvasHistoryPoint)?.synthetic ? 0 : 3,
        pointHitRadius: (context: { raw: unknown }) =>
          (context.raw as CanvasHistoryPoint)?.synthetic ? 0 : 8,
        borderWidth: 2,
        stepped: carriedStepMode,
        spanGaps: false,
        fill: false,
      }
    })
}

function createChart() {
  if (!canvas.value || !anyVisible.value) return
  const styles = getComputedStyle(canvas.value)
  const textColor = styles.getPropertyValue('--muted').trim()
  const lineColor = styles.getPropertyValue('--line').trim()
  const axisColor = styles.getPropertyValue('--chart-axis').trim()
  chart = new Chart(canvas.value, {
    type: 'line',
    data: { datasets: datasets(styles) },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      interaction: { mode: 'nearest', intersect: false, axis: 'x' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: styles.getPropertyValue('--surface').trim(),
          titleColor: styles.getPropertyValue('--ink').trim(),
          bodyColor: styles.getPropertyValue('--ink').trim(),
          borderColor: lineColor,
          borderWidth: 1,
          filter: (context) => {
            const point = context.raw as CanvasHistoryPoint
            return !point.synthetic && point.exact !== null
          },
          callbacks: {
            title: (contexts) => {
              const point = contexts[0]?.raw as CanvasHistoryPoint | undefined
              return point ? displayDate(point.date) : ''
            },
            label: (context) => {
              const point = context.raw as CanvasHistoryPoint
              return `${context.dataset.label}: ${formatExactMoney(point.exact!, props.currency)}`
            },
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          adapters: { date: { zone: 'utc' } },
          time: { minUnit: 'day' },
          grid: { color: lineColor },
          border: { color: axisColor },
          ticks: { color: textColor },
          title: { display: true, text: 'Date', color: textColor },
        },
        y: {
          type: 'linear',
          grid: { color: lineColor },
          border: { color: axisColor },
          title: { display: true, text: props.currency, color: textColor },
          ticks: {
            color: textColor,
            callback: (tickValue) =>
              `${props.currency} ${new Intl.NumberFormat('en', {
                notation: 'compact',
                maximumFractionDigits: 1,
              }).format(Number(tickValue))}`,
          },
        },
      },
    },
  })
}

onMounted(createChart)
onUnmounted(() => {
  chart?.destroy()
  chart = null
})

watch(
  () => [
    props.points,
    props.currency,
    visible.value.netWorth,
    visible.value.assets,
    visible.value.liabilities,
    resolvedTheme.value,
  ],
  () => {
    if (!anyVisible.value) {
      chart?.destroy()
      chart = null
      return
    }
    chart?.destroy()
    chart = null
    createChart()
  },
  { flush: 'post' },
)
</script>

<template>
  <div class="line-chart">
    <fieldset class="series-controls">
      <legend>Show series</legend>
      <label v-for="(style, series) in seriesStyles" :key="series">
        <input v-model="visible[series]" type="checkbox" />
        <span class="series-mark" :class="series" aria-hidden="true"></span>
        {{ style.label }}
      </label>
    </fieldset>
    <div v-if="anyVisible" class="canvas-wrap">
      <canvas
        ref="canvas"
        role="img"
        aria-label="Dated net worth, assets and liabilities; exact values are in the table below."
      ></canvas>
    </div>
    <p v-else class="muted">Choose a series to display the chart.</p>
  </div>
</template>

<style scoped>
.series-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.2rem;
  padding: 0;
  border: 0;
}
.series-controls legend {
  font-weight: 600;
  margin-bottom: 0.45rem;
}
.series-controls label {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 44px;
  cursor: pointer;
}
.series-controls input {
  min-height: 18px;
  width: 18px;
  height: 18px;
}
.series-mark {
  display: inline-block;
  width: 1.4rem;
  border-top: 3px solid;
}
.series-mark.netWorth {
  border-color: var(--chart-net-worth);
}
.series-mark.assets {
  border-color: var(--chart-assets);
  border-top-style: dashed;
}
.series-mark.liabilities {
  border-color: var(--chart-liabilities);
  border-top-style: dotted;
}
.canvas-wrap {
  position: relative;
  height: 320px;
  min-width: 0;
}
@media (max-width: 600px) {
  .canvas-wrap {
    height: 270px;
  }
}
</style>

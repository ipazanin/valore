import { describe, expect, it } from 'vitest'
import { _steppedLineTo } from 'chart.js/helpers'
import {
  calendarMonthsBefore,
  canvasHistorySeries,
  carriedStepMode,
  dateToUtcMillis,
  formatExactMoney,
} from './historyPresentation'
import type { HistoryPoint } from '../domain/history'
import type { Overview } from '../domain/types'

function point(date: string, assets: string, liabilities: string, incomplete = false): HistoryPoint {
  const overview: Overview = {
    assets,
    liabilities,
    netWorth: (BigInt(assets) - BigInt(liabilities)).toString(),
    incomplete,
    categories: {},
    accounts: [],
    unvaluedHoldings: incomplete ? ['holding'] : [],
  }
  return { date, overview, sources: [] }
}

describe('history chart presentation', () => {
  it('clamps calendar ranges across short months and leap years', () => {
    expect(calendarMonthsBefore('2024-05-31', 3)).toBe('2024-02-29')
    expect(calendarMonthsBefore('2025-05-31', 3)).toBe('2025-02-28')
    expect(calendarMonthsBefore('2024-02-29', 12)).toBe('2023-02-28')
  })

  it('uses UTC dates independent of the viewer timezone', () => {
    expect(dateToUtcMillis('2024-03-10')).toBe(1_710_028_800_000)
    expect(dateToUtcMillis('2024-11-03') - dateToUtcMillis('2024-03-10'))
      .toBe(238 * 86_400_000)
  })

  it('keeps the last complete step until a gap and resumes only at the next complete date', () => {
    const points = [
      point('2024-01-01', '100', '20'),
      point('2024-01-03', '120', '20', true),
      point('2024-01-04', '120', '20', true),
      point('2024-01-08', '150', '30'),
    ]
    const assets = canvasHistorySeries(points, 'assets')
    expect(assets.map((point) => [point.date, point.y, point.synthetic])).toEqual([
      ['2024-01-01', 100, false],
      ['2024-01-03', 100, true],
      ['2024-01-03', null, false],
      ['2024-01-04', null, false],
      ['2024-01-08', 150, false],
    ])
    expect(assets[1].x).toBe(dateToUtcMillis('2024-01-03') - 1)
    expect(canvasHistorySeries(points, 'netWorth').map((point) => point.y)).toEqual([
      80, 80, null, null, 120,
    ])
    expect(canvasHistorySeries(points, 'liabilities').map((point) => point.y)).toEqual([
      20, 20, 20, 30,
    ])
  })

  it('uses Chart.js interpolation that holds a value until its next effective date', () => {
    const commands: [number, number][] = []
    const context = {
      lineTo: (x: number, y: number) => commands.push([x, y]),
    } as unknown as CanvasRenderingContext2D
    _steppedLineTo(context, { x: 1, y: 100 }, { x: 10, y: 200 }, false, carriedStepMode)
    expect(commands).toEqual([[10, 100], [10, 200]])
  })

  it('preserves exact decimal strings for the table and tooltip while canvas values are numeric', () => {
    const exact = '123456789012345678.123456789012345678901234'
    expect(formatExactMoney(exact, 'EUR'))
      .toBe('EUR 123,456,789,012,345,678.123456789012345678901234')
    const overview: Overview = {
      ...point('2024-01-01', '1', '0').overview,
      assets: exact,
      netWorth: exact,
    }
    const canvasPoint = canvasHistorySeries([{ date: '2024-01-01', overview, sources: [] }], 'assets')[0]
    expect(canvasPoint.exact).toBe(exact)
    expect(canvasPoint.y).toBe(Number(exact))
  })
})

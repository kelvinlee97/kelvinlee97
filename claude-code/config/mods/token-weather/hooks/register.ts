// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0
//
// Token Weather: a live forecast of the context window and the rate limits,
// above the prompt.
//
// session.start: take a first reading, so the band shows before any turn.
// session.measure: the engine pushes context, rate limits and cost after each
// main-thread turn and when a rate-limit window moves a whole point.
// ui.render (AbovePrompt): two lines.
//   1: icon, forecast word, percent, tokens used of the window, chart, trend.
//   2: the 5-hour window (bar, percent, reset countdown) and the 7-day window.
//
// Rate limits come from the headers of this session's last API response, so
// they move only when this session calls the API. Past `resetsAt` a window
// reads 0%; after STALE_MS without a reading the line says how old it is.
//
// The host reads on(...) and $.noun.method(...) from source, so they are
// spelled literally, and helpers that take $ are top-level functions.

import type { Register, SessionRateLimit, SessionUsage } from 'claude-code'

const HISTORY = 12
const BARS = '▁▂▃▄▅▆▇█'
const METER = 10
const STALE_MS = 5 * 60_000

// Forecast bands, by percent of the window used.
// Single-width text symbols, not emoji: they line up in every terminal font.
const FORECAST = [
  { upTo: 25, icon: '☀', word: 'Clear', color: 'yellow' },
  { upTo: 50, icon: '☁', word: 'Cloudy', color: 'cyan' },
  { upTo: 75, icon: '☂', word: 'Showers', color: 'blue' },
  { upTo: 90, icon: '☇', word: 'Storm', color: 'magenta' },
  { upTo: Infinity, icon: '↯', word: 'Compact soon', color: 'red' },
]

type Reading = { tokens: number; window: number; percent: number }

// Readings, oldest first. Module state: a reload starts the history over.
let readings: Reading[] = []
let limits: SessionRateLimit[] = []
let limitsAt = 0
let tick: { cancel: () => void } | undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    readings = []
    try {
      record(await $.session.usage(), true, await $.clock.now())
    } catch {
      // No reading yet; session.measure fills it in.
    }
    // The reset countdown counts minutes, so redraw once a minute.
    tick?.cancel()
    tick = $.clock.every(60_000, () => $.ui.invalidate('ui.render'))
    $.ui.invalidate('ui.render')
    return result
  })

  // Fires after each main-thread turn: a fresh API response, so fresh limits.
  on('session.measure', async ($, e, next) => {
    record(e, e.changed.includes('context'), await $.clock.now())
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (readings.length === 0 && limits.length === 0)) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const columns = e.props.bodyColumns
    const rows = []
    if (readings.length > 0) rows.push(contextLine(Box, Text, columns))
    if (limits.length > 0) rows.push(limitsLine(Box, Text, columns, now))
    return Box({ flexDirection: 'column', paddingX: 1, children: rows })
  })
}

function record(usage: Pick<SessionUsage, 'context' | 'rateLimits'>, hasNewContext: boolean, now: number) {
  limits = usage.rateLimits ?? []
  limitsAt = now
  const { context } = usage
  if (!hasNewContext || !context?.window) return
  const tokens = context.tokens ?? 0
  const percent = Math.round(context.percent ?? (tokens / context.window) * 100)
  // The session.start reading is 0 before any response; drop it once real readings arrive.
  readings = readings.filter(r => r.tokens > 0)
  readings.push({ tokens, window: context.window, percent })
  if (readings.length > HISTORY) readings = readings.slice(-HISTORY)
}

function contextLine(Box: any, Text: any, columns: number) {
  const now = readings[readings.length - 1]!
  const f = forecastFor(now.percent)
  const trend = trendWord()
  const parts = [
    Text({ color: f.color, bold: true, children: `${f.icon}  ${f.word}` }),
    Text({ children: `  ${now.percent}% of context` }),
    Text({ dimColor: true, children: `  ${short(now.tokens)} / ${short(now.window)}` }),
  ]
  if (columns >= 60) {
    parts.push(Text({ dimColor: true, children: '   last turns ' }))
    parts.push(Text({ color: f.color, children: chart() }))
    if (trend) parts.push(Text({ dimColor: true, children: `  ${trend}` }))
  }
  return Box({ flexDirection: 'row', children: parts })
}

// ⏱ 5h ▰▰▰▱▱▱▱▱▱▱ 32% · resets in 2h14m   7d 18% · 4d0h
function limitsLine(Box: any, Text: any, columns: number, now: number) {
  const parts = []
  const shown = limits.map(l => (isPastReset(l, now) ? { ...l, percentUsed: 0, resetsAt: undefined } : l))
  const five = shown.find(l => l.kind === 'five_hour')
  if (five) {
    const color = limitColor(five.percentUsed)
    parts.push(Text({ color, bold: true, children: '⏱ 5h ' }))
    if (columns >= 60) parts.push(Text({ color, children: `${meter(five.percentUsed)} ` }))
    parts.push(Text({ color, children: `${Math.round(five.percentUsed)}%` }))
    const left = untilReset(five, now)
    if (left) parts.push(Text({ dimColor: true, children: ` · resets in ${left}` }))
  }
  for (const l of shown) {
    if (l.kind === 'five_hour') continue
    const label = l.kind === 'seven_day' ? '7d' : l.kind.replace(/_/g, ' ')
    const left = untilReset(l, now)
    parts.push(Text({ dimColor: true, children: '   ' }))
    parts.push(Text({ color: limitColor(l.percentUsed), children: `${label} ${Math.round(l.percentUsed)}%` }))
    if (left) parts.push(Text({ dimColor: true, children: ` · ${left}` }))
  }
  if (now - limitsAt >= STALE_MS) {
    parts.push(Text({ dimColor: true, children: `   as of ${duration(now - limitsAt)} ago` }))
  }
  return Box({ flexDirection: 'row', children: parts })
}

function isPastReset(limit: SessionRateLimit, now: number) {
  return limit.resetsAt !== undefined && Date.parse(limit.resetsAt) <= now
}

function forecastFor(percent: number) {
  return FORECAST.find(band => percent < band.upTo) ?? FORECAST[FORECAST.length - 1]!
}

function limitColor(percent: number) {
  if (percent >= 90) return 'red'
  if (percent >= 70) return 'yellow'
  return 'green'
}

function meter(percent: number) {
  const filled = Math.max(0, Math.min(METER, Math.round((percent / 100) * METER)))
  return '▰'.repeat(filled) + '▱'.repeat(METER - filled)
}

// "2h14m", "45m", "3d4h"; "" when the window has no reset time.
export function untilReset(limit: SessionRateLimit, now: number) {
  if (!limit.resetsAt) return ''
  const ms = Date.parse(limit.resetsAt) - now
  return Number.isNaN(ms) ? '' : duration(ms)
}

function duration(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  if (d > 0) return `${d}d${h}h`
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`
  return `${m}m`
}

// Bars scale to the busiest reading shown, so growth shows at any fill level.
function chart() {
  const top = Math.max(...readings.map(r => r.tokens), 1)
  return readings.map(r => BARS[Math.min(BARS.length - 1, Math.floor((r.tokens / top) * (BARS.length - 1)))]).join('')
}

function trendWord() {
  if (readings.length < 2) return ''
  const delta = readings[readings.length - 1]!.tokens - readings[readings.length - 2]!.tokens
  if (delta > 0) return `▲ +${short(delta)} last turn`
  if (delta < 0) return `▼ ${short(-delta)} last turn`
  return 'steady'
}

function short(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`
  return String(n)
}

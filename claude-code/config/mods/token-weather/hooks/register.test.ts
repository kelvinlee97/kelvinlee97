import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.parse('2026-10-04T10:00:00Z')
const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

test('the band shows context, the 5-hour window with its reset, and 7d', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.measure', (_$, e) => ({ changed: e.changed }))

  await $.session.measure({
    context: { tokens: 50_000, window: 200_000, percent: 25 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 72.5, resetsAt: '2026-10-04T12:14:00Z' },
      { kind: 'seven_day', percentUsed: 18, resetsAt: '2026-10-08T10:00:00Z' },
    ],
    cost: { usd: 1.4 },
    changed: ['context', 'rateLimits', 'cost'],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'token-weather', surface, component: 'AbovePrompt', props: PROPS as never })
    expect(await ui.find({ text: '25% of context' })).toBeTruthy()
    expect(await ui.find({ text: '73%' })).toBeTruthy()
    expect(await ui.find({ text: 'resets in 2h14m' })).toBeTruthy()
    expect(await ui.find({ text: '7d 18%' })).toBeTruthy()
    expect(await ui.find({ text: 'session' })).toBeFalsy()
  }
})

test('past its reset a window reads 0%, and an old reading says its age', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  on('session.measure', (_$, e) => ({ changed: e.changed }))

  await $.session.measure({
    context: { tokens: 50_000, window: 200_000, percent: 25 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 72.5, resetsAt: '2026-10-04T10:30:00Z' }],
    changed: ['context', 'rateLimits'],
  })
  await clock.set(Date.parse('2026-10-04T10:40:00Z'))

  const ui = await $.ui.mount({ plugin: 'token-weather', surface: 'terminal', component: 'AbovePrompt', props: PROPS as never })
  expect(await ui.find({ text: '0%' })).toBeTruthy()
  expect(await ui.find({ text: 'resets in' })).toBeFalsy()
  expect(await ui.find({ text: 'as of 40m ago' })).toBeTruthy()
})

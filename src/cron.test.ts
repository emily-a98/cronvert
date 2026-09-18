import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatCron, parseCron } from './cron'

test('parses a plain unix expression', () => {
  const parsed = parseCron('30 4 * * 1-5', 'unix')
  assert.equal(parsed.format, 'unix')
  assert.deepEqual(parsed.minute, [{ kind: 'literal', value: 30 }])
  assert.deepEqual(parsed.hour, [{ kind: 'literal', value: 4 }])
  assert.deepEqual(parsed.dayOfMonth, [{ kind: 'any' }])
  assert.deepEqual(parsed.month, [{ kind: 'any' }])
  assert.deepEqual(parsed.dayOfWeek, [{ kind: 'range', start: 1, end: 5 }])
})

test('parses lists, steps and names', () => {
  const parsed = parseCron('0,15,30,45 */2 1-15/5 JAN,MAR SUN', 'unix')
  assert.deepEqual(parsed.minute, [
    { kind: 'literal', value: 0 },
    { kind: 'literal', value: 15 },
    { kind: 'literal', value: 30 },
    { kind: 'literal', value: 45 },
  ])
  assert.deepEqual(parsed.hour, [{ kind: 'step', start: 0, end: 23, step: 2 }])
  assert.deepEqual(parsed.dayOfMonth, [{ kind: 'step', start: 1, end: 15, step: 5 }])
  assert.deepEqual(parsed.month, [
    { kind: 'literal', value: 1 },
    { kind: 'literal', value: 3 },
  ])
  assert.deepEqual(parsed.dayOfWeek, [{ kind: 'literal', value: 0 }])
})

test('rejects the wrong field count for unix', () => {
  assert.throws(() => parseCron('* * * *', 'unix'), /5 fields/)
  assert.throws(() => parseCron('* * * * * *', 'unix'), /5 fields/)
})

test('rejects "?" in unix fields', () => {
  assert.throws(() => parseCron('* * ? * *', 'unix'), /"\?" is not valid/)
})

test('rejects out-of-range and non-numeric values', () => {
  assert.throws(() => parseCron('60 * * * *', 'unix'), /out of range/)
  assert.throws(() => parseCron('abc * * * *', 'unix'), /invalid value/)
})

test('rejects a backwards range', () => {
  assert.throws(() => parseCron('* 20-5 * * *', 'unix'), /start is after end/)
})

test('rejects an invalid step', () => {
  assert.throws(() => parseCron('*/0 * * * *', 'unix'), /invalid step/)
})

test('parses quartz with 6 fields and defaults year to undefined', () => {
  const parsed = parseCron('0 30 4 ? * MON-FRI', 'quartz')
  assert.equal(parsed.year, undefined)
  assert.deepEqual(parsed.dayOfMonth, [{ kind: 'unspecified' }])
  assert.deepEqual(parsed.dayOfWeek, [{ kind: 'range', start: 2, end: 6 }])
})

test('parses quartz with 7 fields including year', () => {
  const parsed = parseCron('0 0 0 1 1 ? 2030', 'quartz')
  assert.deepEqual(parsed.year, [{ kind: 'literal', value: 2030 }])
})

test('rejects quartz when neither dom nor dow is "?"', () => {
  assert.throws(() => parseCron('0 0 0 1 1 MON', 'quartz'), /exactly one of/)
})

test('rejects quartz when both dom and dow are "?"', () => {
  assert.throws(() => parseCron('0 0 0 ? 1 ?', 'quartz'), /exactly one of/)
})

test('rejects "?" in quartz fields where it is not allowed', () => {
  assert.throws(() => parseCron('? 0 0 ? 1 MON', 'quartz'), /"\?" is not valid/)
})

test('formatCron round-trips a unix expression', () => {
  const expression = '0,15,30,45 */2 1-15/5 1,3 0'
  assert.equal(formatCron(parseCron(expression, 'unix')), expression)
})

test('formatCron round-trips a quartz expression with year', () => {
  const expression = '0 30 4 ? * 2-6 2030'
  assert.equal(formatCron(parseCron(expression, 'quartz')), expression)
})

test('formatCron collapses a full-range step back to a star', () => {
  const expression = '*/15 * * * *'
  assert.equal(formatCron(parseCron(expression, 'unix')), expression)
})

test('parses quartz "L" and "L-n" in day-of-month', () => {
  assert.deepEqual(parseCron('0 0 0 L * ?', 'quartz').dayOfMonth, [{ kind: 'lastDayOfMonth' }])
  assert.deepEqual(parseCron('0 0 0 L-3 * ?', 'quartz').dayOfMonth, [{ kind: 'lastDayOfMonth', offset: 3 }])
})

test('parses quartz "LW" and "nW" in day-of-month', () => {
  assert.deepEqual(parseCron('0 0 0 LW * ?', 'quartz').dayOfMonth, [{ kind: 'lastWeekdayOfMonth' }])
  assert.deepEqual(parseCron('0 0 0 15W * ?', 'quartz').dayOfMonth, [{ kind: 'nearestWeekday', day: 15 }])
})

test('parses quartz "xL" and "x#n" in day-of-week', () => {
  assert.deepEqual(parseCron('0 0 0 ? * 6L', 'quartz').dayOfWeek, [{ kind: 'lastWeekdayInMonth', day: 6 }])
  assert.deepEqual(parseCron('0 0 0 ? * MON#2', 'quartz').dayOfWeek, [{ kind: 'nthWeekdayInMonth', day: 2, n: 2 }])
})

test('rejects an out-of-range "L-n" offset and "#n" occurrence', () => {
  assert.throws(() => parseCron('0 0 0 L-31 * ?', 'quartz'), /invalid "L-n" offset/)
  assert.throws(() => parseCron('0 0 0 ? * MON#6', 'quartz'), /invalid occurrence/)
})

test('rejects unix day-of-month/day-of-week modifiers, since they are quartz-only', () => {
  assert.throws(() => parseCron('* * L * *', 'unix'), /invalid value "L"/)
  assert.throws(() => parseCron('* * * * 6L', 'unix'), /invalid value "6L"/)
})

test('formatCron round-trips quartz day modifiers', () => {
  for (const expression of ['0 0 0 L * ?', '0 0 0 L-3 * ?', '0 0 0 LW * ?', '0 0 0 15W * ?', '0 0 0 ? * 6L', '0 0 0 ? * 2#3']) {
    assert.equal(formatCron(parseCron(expression, 'quartz')), expression)
  }
})

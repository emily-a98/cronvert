import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describe } from './describe'
import { parseCron } from './cron'

test('describes "every minute" when nothing is restricted', () => {
  assert.equal(describe(parseCron('* * * * *', 'unix')), 'Every minute.')
})

test('describes a fixed time of day', () => {
  assert.equal(describe(parseCron('30 4 * * *', 'unix')), 'At 04:30.')
})

test('describes a restricted minute within every hour', () => {
  assert.equal(describe(parseCron('15 * * * *', 'unix')), 'At minute 15 of every hour.')
})

test('describes a restricted hour with every minute', () => {
  assert.equal(describe(parseCron('* 9 * * *', 'unix')), 'Every minute during hour 9.')
})

test('describes a minute and hour that are both lists', () => {
  assert.equal(describe(parseCron('0,30 8,20 * * *', 'unix')), 'At minute 0 and 30 past hour 8 and 20.')
})

test('appends a day-of-week clause using unix day names', () => {
  assert.equal(describe(parseCron('30 4 * * 1-5', 'unix')), 'At 04:30, on MON through FRI.')
})

test('appends a month clause', () => {
  assert.equal(describe(parseCron('0 0 1 1,6 *', 'unix')), 'At 00:00, on day-of-month 1, in JAN and JUN.')
})

test('describes a non-zero seconds field as a prefix', () => {
  assert.equal(describe(parseCron('30 0 12 * * ?', 'quartz')), 'At second 30, at 12:00.')
})

test('omits the seconds prefix when seconds is a plain zero', () => {
  assert.equal(describe(parseCron('0 0 12 * * ?', 'quartz')), 'At 12:00.')
})

test('describes quartz day-of-week using quartz numbering', () => {
  assert.equal(describe(parseCron('0 0 12 ? * 1', 'quartz')), 'At 12:00, on SUN.')
})

test('describes a restricted, non-wildcard year field', () => {
  assert.equal(describe(parseCron('0 0 12 1 1 ? 2030', 'quartz')), 'At 12:00, on day-of-month 1, in JAN, in year 2030.')
})

test('omits the year clause when the year field is "*"', () => {
  assert.equal(describe(parseCron('0 0 12 1 1 ? *', 'quartz')), 'At 12:00, on day-of-month 1, in JAN.')
})

test('describes a step value', () => {
  assert.equal(describe(parseCron('*/15 * * * *', 'unix')), 'At minute every 15 of every hour.')
})

test('describes quartz day-of-month modifiers', () => {
  assert.equal(describe(parseCron('0 0 12 L * ?', 'quartz')), 'At 12:00, on the last day of the month.')
  assert.equal(describe(parseCron('0 0 12 L-3 * ?', 'quartz')), 'At 12:00, on 3 days before the last day of the month.')
  assert.equal(describe(parseCron('0 0 12 LW * ?', 'quartz')), 'At 12:00, on the last weekday of the month.')
  assert.equal(describe(parseCron('0 0 12 15W * ?', 'quartz')), 'At 12:00, on the weekday nearest day 15.')
})

test('describes quartz day-of-week modifiers', () => {
  assert.equal(describe(parseCron('0 0 12 ? * 6L', 'quartz')), 'At 12:00, on the last FRI of the month.')
  assert.equal(describe(parseCron('0 0 12 ? * 2#3', 'quartz')), 'At 12:00, on the 3rd MON of the month.')
})

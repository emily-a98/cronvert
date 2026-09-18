import assert from 'node:assert/strict'
import { test } from 'node:test'
import { quartzToUnix, unixToQuartz } from './convert'

test('unixToQuartz sets seconds to 0 and shifts a dow-only restriction', () => {
  assert.equal(unixToQuartz('30 4 * * 1-5'), '0 30 4 ? * 2-6')
})

test('unixToQuartz shifts a single named day and turns dom into "?"', () => {
  assert.equal(unixToQuartz('0 12 * * SUN'), '0 0 12 ? * 1')
})

test('unixToQuartz turns dow into "?" when only day-of-month is restricted', () => {
  assert.equal(unixToQuartz('0 9 1 * *'), '0 0 9 1 * ?')
})

test('unixToQuartz leaves day-of-month as "*" and marks dow "?" when neither is restricted', () => {
  assert.equal(unixToQuartz('* * * * *'), '0 * * * * ?')
})

test('unixToQuartz refuses to guess when both dom and dow are restricted', () => {
  assert.throws(() => unixToQuartz('0 9 1 * MON'), /requires exactly one/)
})

test('unixToQuartz maps the legacy "7 = Sunday" alias', () => {
  assert.equal(unixToQuartz('0 0 * * 7'), '0 0 0 ? * 1')
})

test('quartzToUnix is the inverse of unixToQuartz for dow-only schedules', () => {
  assert.equal(quartzToUnix('0 30 4 ? * 2-6'), '30 4 * * 1-5')
})

test('quartzToUnix is the inverse of unixToQuartz for dom-only schedules', () => {
  assert.equal(quartzToUnix('0 0 9 1 * ?'), '0 9 1 * *')
})

test('quartzToUnix turns "?" into "*" when neither day field is restricted', () => {
  assert.equal(quartzToUnix('0 * * * * ?'), '* * * * *')
})

test('quartzToUnix silently drops a fixed, non-zero seconds value', () => {
  assert.equal(quartzToUnix('30 0 9 1 * ?'), '0 9 1 * *')
})

test('quartzToUnix refuses a seconds field with more than one value', () => {
  assert.throws(() => quartzToUnix('0,30 0 9 1 * ?'), /no seconds field/)
})

test('quartzToUnix refuses a seconds field that fires on a repeating step', () => {
  assert.throws(() => quartzToUnix('*/15 0 9 1 * ?'), /no seconds field/)
})

test('quartzToUnix refuses a restricted year field', () => {
  assert.throws(() => quartzToUnix('0 0 9 1 * ? 2030'), /no year field/)
})

test('quartzToUnix accepts an unrestricted year field', () => {
  assert.equal(quartzToUnix('0 0 9 1 * ? *'), '0 9 1 * *')
})

test('quartzToUnix refuses a day-of-month "L"/"W" modifier', () => {
  assert.throws(() => quartzToUnix('0 0 9 L * ?'), /day-of-month modifiers/)
  assert.throws(() => quartzToUnix('0 0 9 15W * ?'), /day-of-month modifiers/)
})

test('quartzToUnix refuses a day-of-week "L"/"#" modifier', () => {
  assert.throws(() => quartzToUnix('0 0 9 ? * 6L'), /day modifiers/)
  assert.throws(() => quartzToUnix('0 0 9 ? * MON#2'), /day modifiers/)
})

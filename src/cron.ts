// Shared model for both cron dialects this tool understands:
//
//   unix   - 5 fields: minute hour day-of-month month day-of-week
//   quartz - 6 or 7 fields: second minute hour day-of-month month day-of-week [year]
//
// The two dialects disagree on more than field count: Quartz numbers
// Sunday as 1 (unix uses 0, with 7 as a legacy alias for Sunday), and
// Quartz forbids leaving both day-of-month and day-of-week unrestricted -
// exactly one of them must be "?". Getting those two details right is the
// whole point of this file.

export type CronFormat = 'unix' | 'quartz'

export type FieldValue =
  | { kind: 'any' }
  | { kind: 'unspecified' } // "?" - quartz only, day-of-month/day-of-week
  | { kind: 'literal'; value: number }
  | { kind: 'range'; start: number; end: number }
  | { kind: 'step'; start: number; end: number; step: number }
  | { kind: 'lastDayOfMonth'; offset?: number } // "L" or "L-n" - quartz day-of-month only
  | { kind: 'lastWeekdayOfMonth' } // "LW" - quartz day-of-month only
  | { kind: 'nearestWeekday'; day: number } // "nW" - quartz day-of-month only
  | { kind: 'lastWeekdayInMonth'; day: number } // "xL" - quartz day-of-week only
  | { kind: 'nthWeekdayInMonth'; day: number; n: number } // "x#n" - quartz day-of-week only

export interface ParsedCron {
  format: CronFormat
  second?: FieldValue[] // quartz only
  minute: FieldValue[]
  hour: FieldValue[]
  dayOfMonth: FieldValue[]
  month: FieldValue[]
  dayOfWeek: FieldValue[]
  year?: FieldValue[] // quartz only, optional even there
}

export const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const
export const DOW_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const

export function isAny(values: FieldValue[]): boolean {
  return values.length === 1 && values[0].kind === 'any'
}

export function isUnspecified(values: FieldValue[]): boolean {
  return values.length === 1 && values[0].kind === 'unspecified'
}

const DAY_MODIFIER_KINDS = new Set<FieldValue['kind']>([
  'lastDayOfMonth',
  'lastWeekdayOfMonth',
  'nearestWeekday',
  'lastWeekdayInMonth',
  'nthWeekdayInMonth',
])

// True if any value uses one of quartz's L/W/# day modifiers, which have no unix equivalent.
export function hasDayModifier(values: FieldValue[]): boolean {
  return values.some((v) => DAY_MODIFIER_KINDS.has(v.kind))
}

function resolveToken(token: string, fieldName: string, min: number, max: number, names?: readonly string[]): number {
  const upper = token.toUpperCase()
  if (names) {
    const index = names.indexOf(upper as (typeof names)[number])
    if (index >= 0) return min + index
  }
  if (!/^\d+$/.test(token)) {
    throw new Error(`invalid value "${token}" in ${fieldName} field`)
  }
  const value = Number(token)
  if (value < min || value > max) {
    throw new Error(`value ${value} out of range for ${fieldName} field (expected ${min}-${max})`)
  }
  return value
}

function parseRange(token: string, fieldName: string, min: number, max: number, names?: readonly string[]) {
  const dash = token.indexOf('-')
  const start = resolveToken(token.slice(0, dash), fieldName, min, max, names)
  const end = resolveToken(token.slice(dash + 1), fieldName, min, max, names)
  if (start > end) {
    throw new Error(`invalid range "${token}" in ${fieldName} field: start is after end`)
  }
  return { start, end }
}

type DayModifierField = 'dayOfMonth' | 'dayOfWeek'

// "L", "L-n" (n days before the last day), and "LW" (last weekday) - quartz day-of-month only.
function parseDayOfMonthModifier(part: string): FieldValue | undefined {
  if (part === 'L') return { kind: 'lastDayOfMonth' }
  if (part === 'LW') return { kind: 'lastWeekdayOfMonth' }

  const offsetMatch = part.match(/^L-(\d+)$/)
  if (offsetMatch) {
    const offset = Number(offsetMatch[1])
    if (offset < 1 || offset > 30) {
      throw new Error(`invalid "L-n" offset "${part}" in day-of-month field`)
    }
    return { kind: 'lastDayOfMonth', offset }
  }

  const nearestWeekdayMatch = part.match(/^(\d{1,2})W$/)
  if (nearestWeekdayMatch) {
    const day = Number(nearestWeekdayMatch[1])
    if (day < 1 || day > 31) {
      throw new Error(`invalid nearest-weekday value "${part}" in day-of-month field (expected 1-31)`)
    }
    return { kind: 'nearestWeekday', day }
  }

  return undefined
}

// "xL" (last occurrence of day x in the month) and "x#n" (nth occurrence of day x) - quartz day-of-week only.
function parseDayOfWeekModifier(part: string): FieldValue | undefined {
  const nthMatch = part.match(/^([A-Za-z]+|\d)#(\d+)$/)
  if (nthMatch) {
    const [, dayToken, nText] = nthMatch
    const day = resolveToken(dayToken, 'day-of-week', 1, 7, DOW_NAMES)
    const n = Number(nText)
    if (n < 1 || n > 5) {
      throw new Error(`invalid occurrence "${part}" in day-of-week field (expected #1-#5)`)
    }
    return { kind: 'nthWeekdayInMonth', day, n }
  }

  const lastMatch = part.match(/^([A-Za-z]+|\d)L$/)
  if (lastMatch) {
    const day = resolveToken(lastMatch[1], 'day-of-week', 1, 7, DOW_NAMES)
    return { kind: 'lastWeekdayInMonth', day }
  }

  return undefined
}

function parseFieldPart(
  part: string,
  fieldName: string,
  min: number,
  max: number,
  names?: readonly string[],
  dayModifierField?: DayModifierField,
): FieldValue {
  if (part === '*') return { kind: 'any' }
  if (part === '?') return { kind: 'unspecified' }

  if (dayModifierField === 'dayOfMonth') {
    const modifier = parseDayOfMonthModifier(part)
    if (modifier) return modifier
  }
  if (dayModifierField === 'dayOfWeek') {
    const modifier = parseDayOfWeekModifier(part)
    if (modifier) return modifier
  }

  const stepMatch = part.match(/^(.+)\/(\d+)$/)
  if (stepMatch) {
    const [, base, stepText] = stepMatch
    const step = Number(stepText)
    if (!Number.isInteger(step) || step <= 0) {
      throw new Error(`invalid step "${stepText}" in ${fieldName} field "${part}"`)
    }
    const { start, end } = base === '*' ? { start: min, end: max } : parseRange(base, fieldName, min, max, names)
    return { kind: 'step', start, end, step }
  }

  if (part.includes('-')) {
    const { start, end } = parseRange(part, fieldName, min, max, names)
    return { kind: 'range', start, end }
  }

  return { kind: 'literal', value: resolveToken(part, fieldName, min, max, names) }
}

export function parseField(
  raw: string,
  fieldName: string,
  min: number,
  max: number,
  names?: readonly string[],
  dayModifierField?: DayModifierField,
): FieldValue[] {
  if (raw.length === 0) {
    throw new Error(`${fieldName} field is empty`)
  }
  return raw.split(',').map((part) => parseFieldPart(part.trim(), fieldName, min, max, names, dayModifierField))
}

function assertNoUnspecified(fields: Array<[string, FieldValue[]]>) {
  for (const [name, values] of fields) {
    if (values.some((v) => v.kind === 'unspecified')) {
      throw new Error(`"?" is not valid in the ${name} field`)
    }
  }
}

export function parseCron(expression: string, format: CronFormat): ParsedCron {
  const parts = expression.trim().split(/\s+/).filter(Boolean)

  if (format === 'unix') {
    if (parts.length !== 5) {
      throw new Error(`unix cron expressions need 5 fields (minute hour day-of-month month day-of-week), got ${parts.length}`)
    }
    const [minuteRaw, hourRaw, domRaw, monthRaw, dowRaw] = parts
    const minute = parseField(minuteRaw, 'minute', 0, 59)
    const hour = parseField(hourRaw, 'hour', 0, 23)
    const dayOfMonth = parseField(domRaw, 'day-of-month', 1, 31)
    const month = parseField(monthRaw, 'month', 1, 12, MONTH_NAMES)
    const dayOfWeek = parseField(dowRaw, 'day-of-week', 0, 7, DOW_NAMES)

    assertNoUnspecified([
      ['minute', minute],
      ['hour', hour],
      ['day-of-month', dayOfMonth],
      ['month', month],
      ['day-of-week', dayOfWeek],
    ])

    return { format, minute, hour, dayOfMonth, month, dayOfWeek }
  }

  if (parts.length !== 6 && parts.length !== 7) {
    throw new Error(`quartz cron expressions need 6 or 7 fields (second minute hour day-of-month month day-of-week [year]), got ${parts.length}`)
  }
  const [secondRaw, minuteRaw, hourRaw, domRaw, monthRaw, dowRaw, yearRaw] = parts
  const second = parseField(secondRaw, 'second', 0, 59)
  const minute = parseField(minuteRaw, 'minute', 0, 59)
  const hour = parseField(hourRaw, 'hour', 0, 23)
  const dayOfMonth = parseField(domRaw, 'day-of-month', 1, 31, undefined, 'dayOfMonth')
  const month = parseField(monthRaw, 'month', 1, 12, MONTH_NAMES)
  const dayOfWeek = parseField(dowRaw, 'day-of-week', 1, 7, DOW_NAMES, 'dayOfWeek')
  const year = yearRaw !== undefined ? parseField(yearRaw, 'year', 1970, 2099) : undefined

  assertNoUnspecified([
    ['second', second],
    ['minute', minute],
    ['hour', hour],
    ['month', month],
    ...(year ? ([['year', year]] as Array<[string, FieldValue[]]>) : []),
  ])

  if (isUnspecified(dayOfMonth) === isUnspecified(dayOfWeek)) {
    throw new Error('quartz cron requires exactly one of day-of-month or day-of-week to be "?"')
  }

  return { format: 'quartz', second, minute, hour, dayOfMonth, month, dayOfWeek, year }
}

function formatValue(value: FieldValue, min: number, max: number): string {
  switch (value.kind) {
    case 'any':
      return '*'
    case 'unspecified':
      return '?'
    case 'literal':
      return String(value.value)
    case 'range':
      return `${value.start}-${value.end}`
    case 'step': {
      const base = value.start === min && value.end === max ? '*' : `${value.start}-${value.end}`
      return `${base}/${value.step}`
    }
    case 'lastDayOfMonth':
      return value.offset === undefined ? 'L' : `L-${value.offset}`
    case 'lastWeekdayOfMonth':
      return 'LW'
    case 'nearestWeekday':
      return `${value.day}W`
    case 'lastWeekdayInMonth':
      return `${value.day}L`
    case 'nthWeekdayInMonth':
      return `${value.day}#${value.n}`
  }
}

export function formatField(values: FieldValue[], min: number, max: number): string {
  return values.map((v) => formatValue(v, min, max)).join(',')
}

export function formatCron(parsed: ParsedCron): string {
  if (parsed.format === 'unix') {
    return [
      formatField(parsed.minute, 0, 59),
      formatField(parsed.hour, 0, 23),
      formatField(parsed.dayOfMonth, 1, 31),
      formatField(parsed.month, 1, 12),
      formatField(parsed.dayOfWeek, 0, 7),
    ].join(' ')
  }

  const parts = [
    formatField(parsed.second ?? [{ kind: 'literal', value: 0 }], 0, 59),
    formatField(parsed.minute, 0, 59),
    formatField(parsed.hour, 0, 23),
    formatField(parsed.dayOfMonth, 1, 31),
    formatField(parsed.month, 1, 12),
    formatField(parsed.dayOfWeek, 1, 7),
  ]
  if (parsed.year) parts.push(formatField(parsed.year, 1970, 2099))
  return parts.join(' ')
}

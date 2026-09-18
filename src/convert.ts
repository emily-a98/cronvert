import { FieldValue, ParsedCron, formatCron, hasDayModifier, isAny, parseCron } from './cron'

// Quartz numbers Sunday..Saturday as 1..7; unix numbers the same days 0..6,
// with 7 accepted as a legacy alias for Sunday.
function mapDow(values: FieldValue[], fn: (n: number) => number): FieldValue[] {
  return values.map((v) => {
    switch (v.kind) {
      case 'any':
      case 'unspecified':
        return v
      case 'literal':
        return { kind: 'literal', value: fn(v.value) }
      case 'range':
        return { kind: 'range', start: fn(v.start), end: fn(v.end) }
      case 'step':
        return { kind: 'step', start: fn(v.start), end: fn(v.end), step: v.step }
      case 'lastDayOfMonth':
      case 'lastWeekdayOfMonth':
      case 'nearestWeekday':
      case 'lastWeekdayInMonth':
      case 'nthWeekdayInMonth':
        throw new Error('cannot convert: unix cron has no equivalent of quartz\'s "L", "W" and "#" day modifiers')
    }
  })
}

function unixDowToQuartz(values: FieldValue[]): FieldValue[] {
  return mapDow(values, (n) => (n === 7 ? 1 : n + 1))
}

function quartzDowToUnix(values: FieldValue[]): FieldValue[] {
  return mapDow(values, (n) => n - 1)
}

export function unixToQuartz(expression: string): string {
  const parsed = parseCron(expression, 'unix')

  const domAny = isAny(parsed.dayOfMonth)
  const dowAny = isAny(parsed.dayOfWeek)

  let dayOfMonth: FieldValue[]
  let dayOfWeek: FieldValue[]

  if (domAny && dowAny) {
    dayOfMonth = parsed.dayOfMonth
    dayOfWeek = [{ kind: 'unspecified' }]
  } else if (!domAny && dowAny) {
    dayOfMonth = parsed.dayOfMonth
    dayOfWeek = [{ kind: 'unspecified' }]
  } else if (domAny && !dowAny) {
    dayOfMonth = [{ kind: 'unspecified' }]
    dayOfWeek = unixDowToQuartz(parsed.dayOfWeek)
  } else {
    throw new Error(
      'cannot convert: this expression restricts both day-of-month and day-of-week, but quartz cron requires exactly one of them to be unrestricted ("?")',
    )
  }

  const quartz: ParsedCron = {
    format: 'quartz',
    second: [{ kind: 'literal', value: 0 }],
    minute: parsed.minute,
    hour: parsed.hour,
    dayOfMonth,
    month: parsed.month,
    dayOfWeek,
  }
  return formatCron(quartz)
}

export function quartzToUnix(expression: string): string {
  const parsed = parseCron(expression, 'quartz')

  const second = parsed.second ?? [{ kind: 'literal', value: 0 }]
  if (second.length !== 1 || second[0].kind !== 'literal') {
    throw new Error('cannot convert: unix cron has no seconds field, and this expression fires more than once per minute or at a non-fixed second')
  }

  if (parsed.year && !isAny(parsed.year)) {
    throw new Error('cannot convert: unix cron has no year field; remove the year restriction to convert')
  }

  if (hasDayModifier(parsed.dayOfMonth)) {
    throw new Error('cannot convert: unix cron has no equivalent of quartz\'s "L" and "W" day-of-month modifiers')
  }

  const dayOfMonth: FieldValue[] = parsed.dayOfMonth[0].kind === 'unspecified' ? [{ kind: 'any' }] : parsed.dayOfMonth
  const dayOfWeekQuartz: FieldValue[] = parsed.dayOfWeek[0].kind === 'unspecified' ? [{ kind: 'any' }] : quartzDowToUnix(parsed.dayOfWeek)

  const unix: ParsedCron = {
    format: 'unix',
    minute: parsed.minute,
    hour: parsed.hour,
    dayOfMonth,
    month: parsed.month,
    dayOfWeek: dayOfWeekQuartz,
  }
  return formatCron(unix)
}

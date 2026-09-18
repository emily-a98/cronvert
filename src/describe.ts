import { DOW_NAMES, FieldValue, MONTH_NAMES, ParsedCron, hasDayModifier, isAny, isUnspecified } from './cron'

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th']

function describeField(values: FieldValue[], min: number, max: number, names?: readonly string[]): string {
  const render = (n: number) => (names ? names[(n - min) % names.length] : String(n))
  const parts = values.map((v) => {
    switch (v.kind) {
      case 'any':
        return 'every value'
      case 'unspecified':
        return 'any'
      case 'literal':
        return render(v.value)
      case 'range':
        return `${render(v.start)} through ${render(v.end)}`
      case 'step': {
        const isFullRange = v.start === min && v.end === max
        return isFullRange ? `every ${v.step}` : `every ${v.step} from ${render(v.start)} through ${render(v.end)}`
      }
      case 'lastDayOfMonth':
        return v.offset === undefined ? 'the last day of the month' : `${v.offset} days before the last day of the month`
      case 'lastWeekdayOfMonth':
        return 'the last weekday of the month'
      case 'nearestWeekday':
        return `the weekday nearest day ${v.day}`
      case 'lastWeekdayInMonth':
        return `the last ${render(v.day)} of the month`
      case 'nthWeekdayInMonth':
        return `the ${ORDINALS[v.n - 1] ?? `${v.n}th`} ${render(v.day)} of the month`
    }
  })
  return joinList(parts)
}

function isRestricted(values: FieldValue[]): boolean {
  return !isAny(values) && !isUnspecified(values)
}

export function describe(parsed: ParsedCron): string {
  const minuteAny = isAny(parsed.minute)
  const hourAny = isAny(parsed.hour)
  const minuteIsSingle = parsed.minute.length === 1 && parsed.minute[0].kind === 'literal'
  const hourIsSingle = parsed.hour.length === 1 && parsed.hour[0].kind === 'literal'

  let timeClause: string
  if (minuteAny && hourAny) {
    timeClause = 'every minute'
  } else if (minuteIsSingle && hourIsSingle) {
    const hh = String((parsed.hour[0] as { value: number }).value).padStart(2, '0')
    const mm = String((parsed.minute[0] as { value: number }).value).padStart(2, '0')
    timeClause = `at ${hh}:${mm}`
  } else if (hourAny) {
    timeClause = `at minute ${describeField(parsed.minute, 0, 59)} of every hour`
  } else if (minuteAny) {
    timeClause = `every minute during hour ${describeField(parsed.hour, 0, 23)}`
  } else {
    timeClause = `at minute ${describeField(parsed.minute, 0, 59)} past hour ${describeField(parsed.hour, 0, 23)}`
  }

  let prefix = ''
  if (parsed.second) {
    const isZero = parsed.second.length === 1 && parsed.second[0].kind === 'literal' && parsed.second[0].value === 0
    if (!isZero) prefix = `at second ${describeField(parsed.second, 0, 59)}, `
  }

  const clauses = [timeClause]
  if (isRestricted(parsed.dayOfMonth)) {
    const dayOfMonthLabel = hasDayModifier(parsed.dayOfMonth) ? 'on' : 'on day-of-month'
    clauses.push(`${dayOfMonthLabel} ${describeField(parsed.dayOfMonth, 1, 31)}`)
  }
  if (isRestricted(parsed.month)) clauses.push(`in ${describeField(parsed.month, 1, 12, MONTH_NAMES)}`)
  if (isRestricted(parsed.dayOfWeek)) {
    const min = parsed.format === 'quartz' ? 1 : 0
    const max = parsed.format === 'quartz' ? 7 : 7
    clauses.push(`on ${describeField(parsed.dayOfWeek, min, max, DOW_NAMES)}`)
  }
  if (parsed.year && isRestricted(parsed.year)) clauses.push(`in year ${describeField(parsed.year, 1970, 2099)}`)

  const sentence = `${prefix}${clauses.join(', ')}.`
  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}

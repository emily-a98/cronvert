#!/usr/bin/env node
import { CronFormat, parseCron } from './cron'
import { quartzToUnix, unixToQuartz } from './convert'
import { describe } from './describe'

const USAGE = `cronvert - convert between unix cron and quartz cron

Usage:
  cronvert <expression> --to <unix|quartz> [--from <unix|quartz>] [--json]

Examples:
  cronvert "30 4 * * 1-5" --to quartz
  cronvert "0 30 4 ? * 2-6" --to unix --json

If --from is omitted it is guessed from the number of fields
(5 fields = unix, 6 or 7 fields = quartz).`

interface Options {
  expression: string
  to: CronFormat
  from?: CronFormat
  json: boolean
}

function isFormat(value: string): value is CronFormat {
  return value === 'unix' || value === 'quartz'
}

function parseArgs(argv: string[]): Options {
  let expression: string | undefined
  let to: string | undefined
  let from: string | undefined
  let json = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--json') {
      json = true
    } else if (arg === '--to') {
      to = argv[++i]
    } else if (arg === '--from') {
      from = argv[++i]
    } else if (arg.startsWith('-')) {
      throw new Error(`unrecognized flag "${arg}"`)
    } else if (expression === undefined) {
      expression = arg
    } else {
      throw new Error(`unexpected extra argument "${arg}"`)
    }
  }

  if (expression === undefined) throw new Error('missing cron expression')
  if (to === undefined) throw new Error('missing required flag: --to <unix|quartz>')
  if (!isFormat(to)) throw new Error(`--to must be "unix" or "quartz", got "${to}"`)
  if (from !== undefined && !isFormat(from)) throw new Error(`--from must be "unix" or "quartz", got "${from}"`)

  return { expression, to, from, json }
}

function detectFormat(expression: string): CronFormat {
  const fieldCount = expression.trim().split(/\s+/).filter(Boolean).length
  if (fieldCount === 5) return 'unix'
  if (fieldCount === 6 || fieldCount === 7) return 'quartz'
  throw new Error(`cannot guess format from ${fieldCount} fields; pass --from unix or --from quartz explicitly`)
}

function run(argv: string[]): void {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE)
    process.exitCode = argv.length === 0 ? 1 : 0
    return
  }

  const options = parseArgs(argv)
  const from = options.from ?? detectFormat(options.expression)

  const parsedInput = parseCron(options.expression, from)
  const converted =
    from === options.to ? options.expression.trim().split(/\s+/).join(' ') : from === 'unix' ? unixToQuartz(options.expression) : quartzToUnix(options.expression)

  const meaning = describe(parsedInput)

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          input: { format: from, expression: options.expression.trim() },
          output: { format: options.to, expression: converted },
          description: meaning,
        },
        null,
        2,
      ),
    )
  } else {
    console.log(`input   (${from}):   ${options.expression.trim()}`)
    console.log(`output  (${options.to}): ${converted}`)
    console.log(`meaning:         ${meaning}`)
  }
}

try {
  run(process.argv.slice(2))
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ error: message }, null, 2))
  } else {
    console.error(`Error: ${message}`)
  }
  process.exitCode = 1
}

# cronvert

Cron syntax looks like one thing but it isn't. A Kubernetes CronJob or a
crontab line uses 5 fields (minute hour day-of-month month day-of-week).
Jenkins, Spring, and AWS EventBridge use "quartz" cron, which adds a seconds
field, numbers Sunday as 1 instead of 0, and requires that exactly one of
day-of-month / day-of-week be left as `?`. Copy a schedule from one system to
the other without adjusting for those differences and it silently runs at the
wrong time, or the target system rejects it outright.

cronvert converts between the two, and prints a plain-English description of
what the schedule actually does so you can sanity-check the result.

## Usage

```
cronvert <expression> --to <unix|quartz> [--from <unix|quartz>] [--json]
```

`--from` is optional; it's guessed from the field count (5 = unix, 6 or 7 =
quartz) when omitted.

Unix cron to quartz:

```
$ cronvert "30 4 * * 1-5" --to quartz
input   (unix):   30 4 * * 1-5
output  (quartz): 0 30 4 ? * 2-6
meaning:         At 04:30, on MON through FRI.
```

Quartz cron to unix:

```
$ cronvert "0 0 12 ? * FRI" --to unix
input   (quartz):   0 0 12 ? * FRI
output  (unix): 0 12 * * 5
meaning:         At 12:00, on FRI.
```

Same thing, machine-readable:

```
$ cronvert "30 4 * * 1-5" --to quartz --json
{
  "input": {
    "format": "unix",
    "expression": "30 4 * * 1-5"
  },
  "output": {
    "format": "quartz",
    "expression": "0 30 4 ? * 2-6"
  },
  "description": "At 04:30, on MON through FRI."
}
```

On invalid input, `--json` prints `{"error": "..."}` to stdout and exits
non-zero instead of throwing text at your terminal, so it's safe to pipe into
other tools.

## Supported syntax

Both dialects support `*`, single values, ranges (`1-5`), lists (`1,3,5`),
step values (`*/15`, `1-30/5`), and names for months and days of week
(`JAN`-`DEC`, `SUN`-`SAT`). Quartz's `?` is supported for day-of-month and
day-of-week.

## Known limitations (first pass)

- Quartz's `L`, `W`, and `#` modifiers (last day of month, nearest weekday,
  nth weekday) aren't parsed yet.
- If a unix expression restricts *both* day-of-month and day-of-week,
  conversion to quartz is refused rather than guessed at, since quartz has
  no direct equivalent of unix's "either" semantics once both fields are
  populated.
- Quartz's optional year field is understood but can't round-trip to unix,
  which has no year field.

## Building

No dependencies to install. Compile with any TypeScript compiler you have on
hand:

```
tsc
node dist/cli.js "30 4 * * 1-5" --to quartz
```

## Testing

Tests use Node's built-in test runner, so there's nothing extra to install:

```
npm test
```

which compiles the project and then runs every `*.test.js` file under `dist`.

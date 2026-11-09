# Level schedule component

## Purpose and facilities
Tournaments and timed games raise their stakes on a clock. This component turns an unpaused clock reading (milliseconds) into the level in force, its values, the next level and the time until it. A level is `{label, values}` where `values` is any set of named whole numbers (poker blinds are `{sb, bb}`); all levels share the same names. After the last listed level one of three rules applies: `double` multiplies every value by `multiplier` for each further level (the recipe's blinds rule), `repeat` keeps the last level's values going, `stop` freezes at the last level and reports it as final. The clock itself belongs to `game-clock`; this component only reads the number it is given.

Facilities: `level-schedule` (Level for a clock reading, values per level, time to the next level).

## User inputs
The installer collects three settings. `levelSeconds` is how long each level lasts (whole number of seconds; default 600). `afterLastLevel` is `double`, `repeat` or `stop` (default `double`). `multiplier` is the factor used by `double` (whole number, default 2). The levels themselves are data supplied by the recipe or the rules file, for example the `blinds.levels` section of the house rules.

- `levelSeconds` (integer; optional; default `600`)
- `afterLastLevel` (string, slug; optional; default `double`)
- `multiplier` (integer; optional; default `2`)

## Artefacts and dependencies
`component.json` maps every `implementation/` source into `components/level-schedule/`:

- `implementation/server/levels.ts` -> `components/level-schedule/server/levels.ts`

Dependencies: none.
`tools.lock.json` pins verification tools: node 26.5.0. Licence wording remains deferred.

## Provided interfaces
- `interfaces/level-schedule.json` defines `level-schedule` (ae/level-schedule) version 1.0.0.

## Required interfaces
None.

## Integration
The game keeps a level clock (from `game-clock`, which freezes it while paused) and calls `currentLevel(schedule, levelClockMs)` when a round starts, as the recipe's `levelFor` and `blindsFor` did, and `msUntilNext` for the on-screen countdown. `tournament` requires this interface. `createScheduleApi(schedule)` is the form a tournament calls: `levelAt(elapsedMs)` and `describe(elapsedMs)` (the level in force, the next level and the milliseconds until it), plus `levelInfo(level)` for a game that deals at a given level (the poker rules read `values.sb` and `values.bb`). `scheduleFromRules(rules)` builds the schedule from the house rules file: `blinds.levels` as `{sb, bb}` levels, `level_duration_seconds`, and the doubling from `after_last_level`; explicit settings override the rules. `examples/blinds.ts` is the same by hand. Single platform: server TypeScript; clients receive the already computed level and countdown in the game view.

## Visual definition and connected examples
`visual/definition.json` maps its ports to the provided and required interfaces. `visual/examples/connected.json` connects the component to an illustrative application consumer. Both image formats and a text description are retained under `visual/output/`.

## Infrastructure
No deployed service and no accounts; local library functions only.

## Verification
`tests/web.test.ts` builds the poker blinds schedule from `tests/fixtures/house-blinds.json` (the blinds section of the house rules, test data only) and checks every listed level, the level boundaries, the doubling rule for levels 17 to 19, plus `repeat` and `stop` with a small schedule, countdowns, validation errors, and the cap on very large values. It also checks `levelAt` and `describe` (boundaries, next level, the end of a stop schedule, past the last level, plain data) and of `levelsFromRules` and `scheduleFromRules` (the house rules, other sections and field names, refusal of missing or mixed values).

- `node --test tests/web.test.ts` (web, required-local; tools: node 26.5.0)

## Scenarios and presentation
A hold'em tournament with 16 listed blind levels, ten minutes each, doubling after. A turbo game with five-minute levels. A fixed-structure game that stops rising at the last level. A non-poker game stepping a target score with `values: {target}`.

## Updates and removal
Patch updates replace the files only. The component keeps no data. Changing the level list in a running game moves everyone's level the next time the level is read.

# Level schedule instructions

## For the agent
Select this component for any game whose stakes rise on a timer. Set `levelSeconds` from the recipe's level length answer, and `afterLastLevel` and `multiplier` from the house rules (hold'em: 600, double, 2). Supply the level list from the rules file. Connect the provided `level-schedule` to the tournament component.

- Select package `ourapps-ae/level-schedule` version `0.4.0`.
- Settings to configure:
  - `levelSeconds` (integer; optional; default `600`)
  - `afterLastLevel` (string, slug; optional; default `double`)
  - `multiplier` (integer; optional; default `2`)
- Connect the provided `level-schedule` (ae/level-schedule 1.0.0) to the consumer that needs it.
- No accounts or keys are needed.

## For the developer
Pass the unpaused level clock in milliseconds; do not pass wall-clock time or the schedule will advance while the game is paused. Keep labels short; they are shown to players. Values must be whole numbers and every level needs the same names. No accounts or keys.

## How to check
From the component directory:

- `node --test tests/web.test.ts` (web, required-local; tools: node 26.5)
- `python3 -m aepm review <digest> --store STORE --policy POLICY --trusted --allow-network` checks an archive fetched with `python3 -m aepm fetch ourapps-ae/level-schedule@VERSION --store STORE --from https://ourapps.app` and runs its suites.

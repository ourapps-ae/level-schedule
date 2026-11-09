import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createSchedule, createScheduleApi, currentLevel, levelsFromRules, scheduleFromRules, levelDurationMs, levelFor, levelInfo, msUntilNext, nextLevel, table, validateSettings} from "../implementation/server/levels.ts";
import {blindSchedule} from "../examples/blinds.ts";

const house = JSON.parse(readFileSync(new URL("fixtures/house-blinds.json", import.meta.url), "utf8"));
const poker = blindSchedule(house.blinds);
const simple = (afterLastLevel: "double" | "repeat" | "stop") => createSchedule(
  [{label: "A", values: {stake: 10}}, {label: "B", values: {stake: 20}}, {label: "C", values: {stake: 30}}],
  {levelSeconds: 60, afterLastLevel, multiplier: 2},
);

test("settings are defaulted and checked", () => {
  assert.deepEqual(validateSettings(), {levelSeconds: 600, afterLastLevel: "double", multiplier: 2});
  assert.throws(() => validateSettings({levelSeconds: 0}), RangeError);
  assert.throws(() => validateSettings({afterLastLevel: "sometimes" as never}), RangeError);
  assert.throws(() => validateSettings({multiplier: 0}), RangeError);
  assert.throws(() => validateSettings({multiplier: 1.5}), RangeError);
});

test("levels must be present, labelled and have the same numeric values", () => {
  assert.throws(() => createSchedule([]), /at least one level/);
  assert.throws(() => createSchedule([{label: "", values: {a: 1}}]), /needs a label/);
  assert.throws(() => createSchedule([{label: "x", values: {}}]), /no values/);
  assert.throws(() => createSchedule([{label: "x", values: {a: 1}}, {label: "y", values: {b: 1}}]), /different values/);
  assert.throws(() => createSchedule([{label: "x", values: {a: -1}}]), /0 or more/);
  assert.throws(() => createSchedule([{label: "x", values: {a: NaN}}]), /0 or more/);
});

test("the level follows the clock in whole level lengths", () => {
  assert.equal(levelDurationMs(poker), 600000);
  assert.equal(levelFor(poker, 0), 1);
  assert.equal(levelFor(poker, 599999), 1);
  assert.equal(levelFor(poker, 600000), 2);
  assert.equal(levelFor(poker, -5), 1);
  assert.equal(levelFor(poker, 15 * 600000), 16);
});

test("poker blinds as one configuration match the recipe's table and doubling rule", () => {
  const first = levelInfo(poker, 1);
  assert.deepEqual(first.values, {sb: 25, bb: 50});
  assert.equal(first.label, "Level 1");
  assert.deepEqual(levelInfo(poker, 3).values, {sb: 75, bb: 150});
  assert.deepEqual(levelInfo(poker, 16).values, {sb: 6000, bb: 12000});
  assert.deepEqual(levelInfo(poker, 17).values, {sb: 12000, bb: 24000});
  assert.deepEqual(levelInfo(poker, 19).values, {sb: 48000, bb: 96000});
  assert.equal(levelInfo(poker, 17).extended, true);
  assert.equal(levelInfo(poker, 16).extended, false);
  for (const row of house.blinds.levels) assert.deepEqual(levelInfo(poker, row.level).values, {sb: row.small_blind, bb: row.big_blind});
  assert.deepEqual(currentLevel(poker, 20 * 60000).values, {sb: 75, bb: 150});
});

test("after the last level: double scales every value, repeat holds, stop ends", () => {
  const d = simple("double");
  assert.deepEqual(levelInfo(d, 4).values, {stake: 60});
  assert.deepEqual(levelInfo(d, 5).values, {stake: 120});
  assert.equal(levelInfo(d, 4).label, "C+1");
  assert.equal(levelFor(d, 10 * 60000), 11);
  const r = simple("repeat");
  assert.deepEqual(levelInfo(r, 9).values, {stake: 30});
  assert.equal(levelFor(r, 10 * 60000), 11);
  assert.equal(levelInfo(r, 9).final, false);
  const s = simple("stop");
  assert.equal(levelFor(s, 10 * 60000), 3);
  assert.deepEqual(currentLevel(s, 10 * 60000).values, {stake: 30});
  assert.equal(currentLevel(s, 10 * 60000).final, true);
  assert.equal(currentLevel(s, 0).final, false);
});

test("time to the next level, including the end of a stop schedule", () => {
  const d = simple("double");
  assert.equal(msUntilNext(d, 0), 60000);
  assert.equal(msUntilNext(d, 45000), 15000);
  assert.equal(msUntilNext(d, 60000), 60000);
  assert.equal(msUntilNext(d, 500000), 40000);
  const s = simple("stop");
  assert.equal(msUntilNext(s, 100000), 20000);
  assert.equal(msUntilNext(s, 120000), null);
  assert.equal(nextLevel(s, 120000), null);
  assert.deepEqual(nextLevel(s, 0)?.values, {stake: 20});
  assert.deepEqual(nextLevel(simple("repeat"), 130000)?.values, {stake: 30});
});

test("values are capped at the largest exact whole number, zero stays zero", () => {
  const s = createSchedule([{label: "x", values: {a: 7, b: 0}}], {afterLastLevel: "double", multiplier: 10});
  const far = levelInfo(s, 400).values;
  assert.equal(far.a, Number.MAX_SAFE_INTEGER);
  assert.equal(far.b, 0);
});

test("table lists levels for a rules page; levelInfo rejects bad levels", () => {
  assert.equal(table(poker).length, 16);
  assert.equal(table(poker, 18).at(-1)!.values.bb, 48000);
  for (const bad of [0, -1, 1.5]) assert.throws(() => levelInfo(poker, bad), RangeError);
});

// ---- the tournament's view ----

test("levelAt and describe take only the level clock reading", () => {
  const api = createScheduleApi(poker);
  assert.equal(api.levelAt(0), 1);
  assert.equal(api.levelAt(599999), 1);
  assert.equal(api.levelAt(600000), 2);
  assert.equal(api.levelAt(-1), 1);
  assert.equal(api.levelAt(99 * 600000), 100);
  const d = api.describe(1500000);
  assert.deepEqual([d.level, d.label, d.values, d.extended, d.final], [3, "Level 3", {sb: 75, bb: 150}, false, false]);
  assert.deepEqual(d.next?.values, {sb: 100, bb: 200});
  assert.equal(d.next?.level, 4);
  assert.equal(d.msUntilNext, 300000);
  assert.deepEqual(api.levelInfo(5).values, {sb: 150, bb: 300});
  assert.deepEqual(JSON.parse(JSON.stringify(d)), d, "plain data a client can receive");
});

test("describe at the end of a stop schedule has no next level and no time left", () => {
  const api = createScheduleApi(simple("stop"));
  const d = api.describe(500000);
  assert.deepEqual([d.level, d.final, d.next, d.msUntilNext], [3, true, null, null]);
});

test("describe past the last level shows the doubled level and the next doubling", () => {
  const d = createScheduleApi(poker).describe(16 * 600000 + 100);
  assert.deepEqual([d.level, d.extended, d.values], [17, true, {sb: 12000, bb: 24000}]);
  assert.deepEqual(d.next?.values, {sb: 24000, bb: 48000});
  assert.equal(d.msUntilNext, 599900);
});

// ---- from the rules file ----

test("levelsFromRules reads the house rules' blinds as {sb, bb} levels", () => {
  const levels = levelsFromRules(house);
  assert.equal(levels.length, 16);
  assert.deepEqual(levels[0], {label: "Level 1", values: {sb: 25, bb: 50}});
  assert.deepEqual(levels[15].values, {sb: 6000, bb: 12000});
});

test("scheduleFromRules takes levels, level length and the doubling from the rules; explicit settings win", () => {
  const schedule = scheduleFromRules(house);
  assert.deepEqual(schedule.settings, {levelSeconds: 600, afterLastLevel: "double", multiplier: 2});
  assert.deepEqual(levelInfo(schedule, 17).values, {sb: 12000, bb: 24000});
  assert.deepEqual(table(schedule), table(poker));
  assert.equal(scheduleFromRules(house, {levelSeconds: 60}).settings.levelSeconds, 60);
  assert.equal(scheduleFromRules(house, {afterLastLevel: "stop"}).settings.afterLastLevel, "stop");
});

test("scheduleFromRules: other value names, another section, no doubling means repeat, and bad rules are refused", () => {
  const rules = {structure: {level_duration_seconds: 90, after_last_level: {}, levels: [{level: 1, ante: 1}, {level: 2, ante: 3}]}, other: {levels: [{x: 2}]}};
  const s = scheduleFromRules(rules, {}, {at: "structure", fields: {ante: "ante"}});
  assert.deepEqual(s.settings, {levelSeconds: 90, afterLastLevel: "double", multiplier: 2}, "an empty after_last_level object is not a rule: defaults stay");
  assert.deepEqual(levelInfo(s, 2).values, {ante: 3});
  const noAfter = {blinds: {levels: [{level: 1, small_blind: 1, big_blind: 2}]}};
  assert.equal(scheduleFromRules(noAfter).settings.levelSeconds, 600);
  assert.equal(scheduleFromRules({blinds: {...noAfter.blinds, after_last_level: null}}).settings.afterLastLevel, "repeat");
  assert.deepEqual(levelsFromRules(rules, {at: "other", fields: {x: "stake"}}), [{label: "Level 1", values: {stake: 2}}]);
  assert.throws(() => levelsFromRules({}), /no levels at blinds.levels/);
  assert.throws(() => levelsFromRules({blinds: {levels: []}}), /no levels/);
  assert.throws(() => levelsFromRules({blinds: {levels: [{level: 1, small_blind: 1}]}}), /no number big_blind/);
  assert.throws(() => levelsFromRules({blinds: {levels: [{small_blind: "1", big_blind: 2}]}}), /no number small_blind/);
  const mixed = {blinds: {levels: [{small_blind: 1, big_blind: 2}], after_last_level: {small_blind_multiplier_each_level: 2, big_blind_multiplier_each_level: 3}}};
  assert.throws(() => scheduleFromRules(mixed), /multipliers differ/);
  assert.equal(levelsFromRules({blinds: {levels: [{small_blind: 1, big_blind: 2}]}})[0].label, "Level 1", "position is used when a level has no number");
});

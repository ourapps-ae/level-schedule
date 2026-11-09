// Stakes that rise on a timer. A level is {label, values}: the values are whatever the game steps up
// (blinds, an ante, a target score). The component never looks inside them except to scale them.

export type LevelValues = Record<string, number>;

export type Level = { label: string; values: LevelValues };

export type AfterLast = "double" | "repeat" | "stop";

export type ScheduleSettings = {
  levelSeconds: number;
  // What happens when the clock passes the last listed level.
  //   double: every value is multiplied by `multiplier` for each further level
  //   repeat: the last level's values go on for ever (the level number still counts up)
  //   stop:   the level number stops at the last level and `final` is true
  afterLastLevel: AfterLast;
  multiplier: number;
};

export type Schedule = { levels: Level[]; settings: ScheduleSettings };

export type LevelInfo = {
  // 1-based number.
  level: number;
  label: string;
  values: LevelValues;
  // True for levels past the end of the list that `double` made up.
  extended: boolean;
  // True only under `stop`, at the last level: the schedule has run out and nothing will change.
  final: boolean;
};

export const DEFAULT_SETTINGS: ScheduleSettings = { levelSeconds: 600, afterLastLevel: "double", multiplier: 2 };

const AFTER_LAST: AfterLast[] = ["double", "repeat", "stop"];

export function validateSettings(settings: Partial<ScheduleSettings> = {}): ScheduleSettings {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  if (!Number.isSafeInteger(s.levelSeconds) || s.levelSeconds < 1) throw new RangeError("levelSeconds must be a whole number of at least 1");
  if (!AFTER_LAST.includes(s.afterLastLevel)) throw new RangeError(`afterLastLevel must be one of ${AFTER_LAST.join(", ")}`);
  if (!Number.isSafeInteger(s.multiplier) || s.multiplier < 1) throw new RangeError("multiplier must be a whole number of at least 1");
  return s;
}

// Throws when the levels are not usable: none, unlabelled, or values that are missing, differ between levels or are not finite numbers of 0 or more.
export function createSchedule(levels: Level[], settings: Partial<ScheduleSettings> = {}): Schedule {
  if (!Array.isArray(levels) || levels.length === 0) throw new Error("a schedule needs at least one level");
  const keys = Object.keys(levels[0].values ?? {}).sort().join(",");
  if (keys === "") throw new Error("level 1 has no values");
  levels.forEach((level, i) => {
    if (typeof level.label !== "string" || level.label === "") throw new Error(`level ${i + 1} needs a label`);
    if (Object.keys(level.values ?? {}).sort().join(",") !== keys) throw new Error(`level ${i + 1} has different values from level 1`);
    for (const [name, value] of Object.entries(level.values)) if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`level ${i + 1} value ${name} must be a number of 0 or more`);
  });
  return { levels: levels.map((l) => ({ label: l.label, values: { ...l.values } })), settings: validateSettings(settings) };
}

export function levelDurationMs(schedule: Schedule): number {
  return schedule.settings.levelSeconds * 1000;
}

// The level number for an unpaused clock reading in milliseconds (the first level is 1).
export function levelFor(schedule: Schedule, elapsedMs: number): number {
  const index = Math.floor(Math.max(0, elapsedMs) / levelDurationMs(schedule));
  const level = index + 1;
  return schedule.settings.afterLastLevel === "stop" ? Math.min(level, schedule.levels.length) : level;
}

// Values are capped at the largest whole number a double holds exactly.
function scaled(values: LevelValues, factor: number): LevelValues {
  const out: LevelValues = {};
  for (const [name, value] of Object.entries(values)) out[name] = value === 0 ? 0 : Math.min(Number.MAX_SAFE_INTEGER, value * factor);
  return out;
}

export function levelInfo(schedule: Schedule, level: number): LevelInfo {
  if (!Number.isInteger(level) || level < 1) throw new RangeError("level is a whole number from 1");
  const { levels, settings } = schedule;
  const count = levels.length;
  if (level <= count) return { level, label: levels[level - 1].label, values: { ...levels[level - 1].values }, extended: false, final: level === count && settings.afterLastLevel === "stop" };
  const last = levels[count - 1];
  const extra = level - count;
  if (settings.afterLastLevel === "double") return { level, label: `${last.label}+${extra}`, values: scaled(last.values, Math.pow(settings.multiplier, extra)), extended: true, final: false };
  return { level, label: last.label, values: { ...last.values }, extended: false, final: settings.afterLastLevel === "stop" };
}

// The level in force at a clock reading.
export function currentLevel(schedule: Schedule, elapsedMs: number): LevelInfo {
  return levelInfo(schedule, levelFor(schedule, elapsedMs));
}

// The level that follows the one in force, or null when the schedule has run out (`stop` at the last level).
export function nextLevel(schedule: Schedule, elapsedMs: number): LevelInfo | null {
  const level = levelFor(schedule, elapsedMs);
  if (schedule.settings.afterLastLevel === "stop" && level >= schedule.levels.length) return null;
  return levelInfo(schedule, level + 1);
}

// Milliseconds of unpaused clock until the next level, or null when there is none.
export function msUntilNext(schedule: Schedule, elapsedMs: number): number | null {
  if (nextLevel(schedule, elapsedMs) === null) return null;
  const duration = levelDurationMs(schedule);
  return duration - (Math.max(0, elapsedMs) % duration);
}

// The first `count` levels as rows, for a rules or schedule page.
export function table(schedule: Schedule, count = schedule.levels.length): LevelInfo[] {
  return Array.from({ length: count }, (_, i) => levelInfo(schedule, i + 1));
}

// ---- the tournament's view: a schedule with its clock reading as the only argument ----

// What a client shows: the level in force, the next one and the unpaused time until it.
export type LevelDescription = LevelInfo & { next: LevelInfo | null; msUntilNext: number | null };

export type ScheduleApi = {
  schedule: Schedule;
  // The level number (from 1) at a reading of the level clock.
  levelAt(elapsedMs: number): number;
  // The level in force with the next level and the time until it.
  describe(elapsedMs: number): LevelDescription;
  // The values of a level by number (the blinds of level 3), for a game that deals at a given level.
  levelInfo(level: number): LevelInfo;
};

export function createScheduleApi(schedule: Schedule): ScheduleApi {
  return {
    schedule,
    levelAt: (elapsedMs) => levelFor(schedule, elapsedMs),
    describe: (elapsedMs) => ({ ...currentLevel(schedule, elapsedMs), next: nextLevel(schedule, elapsedMs), msUntilNext: msUntilNext(schedule, elapsedMs) }),
    levelInfo: (level) => levelInfo(schedule, level),
  };
}

// ---- building a schedule from a rules file section ----

export type RulesLevelOptions = {
  // Dotted path of the section, default "blinds".
  at?: string;
  // Rule field -> value name, default the poker blinds { small_blind: "sb", big_blind: "bb" }. A field of a level that is not
  // listed here is ignored; a listed field that is missing or not a number is an error.
  fields?: Record<string, string>;
};

const POKER_FIELDS = { small_blind: "sb", big_blind: "bb" };

// The section's `levels` as schedule levels: label "Level <n>" from each level's `level` (or its position), values from the
// listed fields. Reads plain data: any parsed rules file will do.
export function levelsFromRules(rules: unknown, options: RulesLevelOptions = {}): Level[] {
  const section = pathValue(rules, options.at ?? "blinds");
  const list = (section as { levels?: unknown } | undefined)?.levels;
  if (!Array.isArray(list) || list.length === 0) throw new Error(`no levels at ${options.at ?? "blinds"}.levels`);
  const fields = options.fields ?? POKER_FIELDS;
  return list.map((row, i) => {
    const values: LevelValues = {};
    for (const [field, name] of Object.entries(fields)) {
      const v = (row as Record<string, unknown>)?.[field];
      if (typeof v !== "number") throw new Error(`level ${i + 1} has no number ${field}`);
      values[name] = v;
    }
    const number = (row as { level?: unknown }).level;
    return { label: `Level ${typeof number === "number" ? number : i + 1}`, values };
  });
}

// A whole schedule from the rules section: the levels, `level_duration_seconds`, and the doubling after the last level
// from `after_last_level.<field>_multiplier_each_level` (every field must agree; none means `repeat`). Explicit
// `settings` override what the rules say.
export function scheduleFromRules(rules: unknown, settings: Partial<ScheduleSettings> = {}, options: RulesLevelOptions = {}): Schedule {
  const section = pathValue(rules, options.at ?? "blinds") as Record<string, unknown> | undefined;
  const levels = levelsFromRules(rules, options);
  const fromRules: Partial<ScheduleSettings> = {};
  if (typeof section?.level_duration_seconds === "number") fromRules.levelSeconds = section.level_duration_seconds;
  const after = section?.after_last_level;
  if (after && typeof after === "object") {
    const factors = Object.entries(after).filter(([k]) => k.endsWith("_multiplier_each_level")).map(([, v]) => v);
    if (factors.length > 0) {
      if (!factors.every((f) => f === factors[0])) throw new Error("after_last_level multipliers differ between values; one schedule has one multiplier");
      fromRules.afterLastLevel = "double";
      fromRules.multiplier = factors[0] as number;
    }
  } else if (section && "after_last_level" in section) {
    fromRules.afterLastLevel = "repeat";
  }
  return createSchedule(levels, { ...fromRules, ...settings });
}

function pathValue(root: unknown, path: string): unknown {
  let at = root;
  for (const key of path.split(".")) {
    if (at === null || typeof at !== "object") return undefined;
    at = (at as Record<string, unknown>)[key];
  }
  return at;
}

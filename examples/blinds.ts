import {createSchedule, type Schedule} from "../implementation/server/levels.ts";

// The poker blinds are one configuration of the generic schedule: each level's values are {sb, bb}.
type HouseBlinds = {
  level_duration_seconds: number;
  levels: {level: number; small_blind: number; big_blind: number}[];
  after_last_level: {big_blind_multiplier_each_level: number};
};

export function blindSchedule(blinds: HouseBlinds): Schedule {
  return createSchedule(
    blinds.levels.map((l) => ({label: `Level ${l.level}`, values: {sb: l.small_blind, bb: l.big_blind}})),
    {levelSeconds: blinds.level_duration_seconds, afterLastLevel: "double", multiplier: blinds.after_last_level.big_blind_multiplier_each_level},
  );
}

import knowledgeJson from '../data/coach/knowledge.json';
import type { RuleId } from './types';

/** Typed access to `src/data/coach/knowledge.json`: thresholds, rule principles and sources. */

export interface ReturnTierDef {
  fromDays: number;
  loads: number[];
  setsDrop: number;
  rir?: number;
  noIncrease?: boolean;
  recalibrate?: boolean;
}

export interface Knowledge {
  thresholds: {
    confidence: { mediumExposures: number; highExposures: number; lowRatedShare: number; highRatedShare: number; staleDays: number };
    progression: {
      bigJump: number;
      stretchReps: number;
      easyMargin: number;
      maxJumpBeginnerOrLow: number;
      maxJumpOther: number;
      e1rmJump: number;
      smallMissTotal: number;
      fatigueDayShare: number;
      strengthNotch: number;
      minReps: number;
    };
    inSession: { harderDrop: number; easyMargin: number; expectedDropPerSet: number; restDropExtra: number };
    readiness: { wearableMinEntries: number; wearableLowShare: number };
    plateau: { exposures: number; sameRangeExposures: number; tolerance: number; beginnerTechniqueFirst: boolean };
    volume: { minProgramDays: number; maxSets: number; rampLimit: number; pushPullRatio: number; addSets: number };
    fatigue: {
      windowDays: number;
      effortCreepLifts: number;
      dipPercent: number;
      dipShare: number;
      dipMinLifts: number;
      readinessLowCount: number;
      readinessWindow: number;
      checkoutLowCount: number;
      checkoutWindow: number;
      painLifts: number;
      signalsForLighterWeek: number;
      minWeeksSinceLighter: number;
      minDataDays: number;
      minLifts: number;
    };
    lighterWeek: { setFactor: number; minSets: number; loadFactor: number; rir: number; maxPostponeWeeks: number };
    return: ReturnTierDef[];
    weight: {
      fastPerWeek: number;
      weeksFast: number;
      flatWeeks: number;
      flatPerWeek: number;
      minEntries: number;
      proteinGramsPerKg: number;
      proteinTipDays: number;
    };
    pain: { loadFactor: number; rir: number; repeatDays: number };
    memory: { suppressDays: number; suppressSessions: number; variantHistory: number; dismissalsToDemote: number; cueRepeatDays: number };
    wins: { trendMinExposures: number; trendMinGain: number; streakMinWeeks: number; comebackGapDays: number };
  };
  rules: Record<RuleId, { name: string; principle: string; sources: number[] }>;
  sources: Record<string, { short: string; cite: string; url?: string }>;
}

export const KNOWLEDGE = knowledgeJson as unknown as Knowledge;
export const T = KNOWLEDGE.thresholds;

export function ruleInfo(rule: RuleId): { name: string; principle: string; sources: { id: number; short: string; cite: string; url?: string }[] } {
  const info = KNOWLEDGE.rules[rule];
  return {
    name: info.name,
    principle: info.principle,
    sources: info.sources.map((id) => ({ id, ...KNOWLEDGE.sources[String(id)]! })),
  };
}

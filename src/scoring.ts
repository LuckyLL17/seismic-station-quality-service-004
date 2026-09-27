// 质量评分依据：观测接入与复盘快照共用同一份规则，保证评分口径可追溯
export const SCORING_BASIS = {
  version: 'v1',
  baseScore: 100,
  issuePenalty: 22,
  timingPenaltyCapMs: 20,
  minWindowSeconds: 30,
  clippingThreshold: 0.95,
  timingOffsetThresholdMs: 5,
  formula: 'qualityScore = max(0, round(100 - 22 * issues - min(abs(timingOffsetMs), 20)))'
} as const;
export type ScoringBasis = typeof SCORING_BASIS;

export function evaluateObservation(input: { samples: number; sampleRateHz: number; peakAmplitude: number; timingOffsetMs: number }): { issues: string[]; qualityScore: number } {
  const issues: string[] = [];
  if (input.samples < input.sampleRateHz * SCORING_BASIS.minWindowSeconds) issues.push('采样窗口不足');
  if (input.peakAmplitude > SCORING_BASIS.clippingThreshold) issues.push('波形削顶风险');
  if (Math.abs(input.timingOffsetMs) > SCORING_BASIS.timingOffsetThresholdMs) issues.push('时间同步偏差');
  const qualityScore = Math.max(0, Math.round(SCORING_BASIS.baseScore - issues.length * SCORING_BASIS.issuePenalty - Math.min(Math.abs(input.timingOffsetMs), SCORING_BASIS.timingPenaltyCapMs)));
  return { issues, qualityScore };
}

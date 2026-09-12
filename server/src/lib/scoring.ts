/**
 * Server-authoritative scoring. Correctness is worth a base amount of points
 * (set per-question by the teacher); speed scales the award between 50% and
 * 100% of that base so a last-second correct answer still counts, but an
 * instant one counts more. Wrong or missing answers always score 0.
 */
export function calculateScore(params: {
  basePoints: number;
  timeLimitMs: number;
  answerTimeMs: number;
  isCorrect: boolean;
}): number {
  const { basePoints, timeLimitMs, answerTimeMs, isCorrect } = params;
  if (!isCorrect) return 0;
  if (timeLimitMs <= 0) return basePoints;

  const clampedTime = Math.min(Math.max(answerTimeMs, 0), timeLimitMs);
  const speedRatio = 1 - clampedTime / timeLimitMs; // 1 = instant, 0 = at the wire
  const score = basePoints * (0.5 + 0.5 * speedRatio);
  return Math.round(score);
}

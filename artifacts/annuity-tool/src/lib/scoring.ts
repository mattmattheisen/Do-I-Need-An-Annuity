/**
 * Pure scoring engine for the annuity suitability tool.
 *
 * Extracted from AnnuityTool.tsx so that the calculation logic can be unit-tested
 * independently of the React component. The component calls calculateResults() by
 * passing its formData; this module owns all formula constants and rules.
 */

export interface ScoringInput {
  /** Client's current age */
  currentAge: number;
  /** Client's self-reported expected age (longevity horizon) */
  expectedAge: number;
  /** Social Security annual benefit */
  socialSecurityAnnual: number;
  /** Pension annual benefit */
  pensionAnnual: number;
  /** Other guaranteed income (annuity, rental, etc.) */
  otherGuaranteedIncome: number;
  /** Total investable assets */
  investableAssets: number;
  /** Annual spending goal in retirement */
  spendingGoal: number;
  /**
   * Market scenario comfort level (0–4).
   * 0 = "Sell most — couldn't sleep", 4 = "Buy more while prices are down"
   */
  marketComfort: number;
  /** Whether leaving money to heirs is important */
  heirsImportant: boolean;
  /** Whether healthcare / LTC cost is a concern */
  healthcareConcern: boolean;
}

export interface ScoringResult {
  suitabilityScore: number;
  longevityScore: number;
  incomeGapScore: number;
  flexibilityNeed: number;
  behavioralFitScore: number;
  gapTooSmallForContract: boolean;
  recommendedAmount: number;
  recommendedPct: number;
  estimatedIncome: number;
  payoutRate: number;
  ceilingAmount: number;
  gap: number;
  gapPct: number;
  totalGuaranteedIncome: number;
  remainingAssets: number;
}

/**
 * Returns the SPIA payout rate for the given age using linear interpolation
 * between market-rate breakpoints.
 *
 * The UI displays this rounded to one decimal place; all dollar calculations
 * use the full-precision value.
 */
export function getPayoutRate(age: number): number {
  // Breakpoints reflecting current SPIA market rates (reviewed Aug 2026).
  const breakpoints: [number, number][] = [
    [50, 0.045],
    [55, 0.062],
    [60, 0.070],
    [65, 0.077],
    [70, 0.092],
    [75, 0.110],
    [80, 0.135],
    [85, 0.175],
  ];
  if (age <= 50) return 0.045;
  if (age >= 85) return 0.175;
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const [a1, r1] = breakpoints[i];
    const [a2, r2] = breakpoints[i + 1];
    if (age >= a1 && age <= a2) {
      return r1 + ((age - a1) / (a2 - a1)) * (r2 - r1);
    }
  }
  return 0.064;
}

/** Minimum annuity purchase size most carriers will write. */
export const MIN_ANNUITY_PURCHASE = 25_000;

/**
 * Computes the full annuity suitability result from a set of client inputs.
 *
 * All four component scores are independent; the total is clamped to [0, 100].
 */
export function calculateResults(input: ScoringInput): ScoringResult {
  const {
    currentAge,
    expectedAge,
    socialSecurityAnnual,
    pensionAnnual,
    otherGuaranteedIncome,
    investableAssets,
    spendingGoal,
    marketComfort,
    heirsImportant,
    healthcareConcern,
  } = input;

  const totalGuaranteedIncome =
    socialSecurityAnnual + pensionAnnual + otherGuaranteedIncome;

  // Component 1: Longevity (0–25)
  // Anchors: zero at age 75, maximum at age 95.
  // Reviewed Aug 2026 — see AnnuityTool.tsx for anchor-shift rationale.
  const longevityScore = Math.min(25, Math.max(0, ((expectedAge - 75) / 20) * 25));

  // Component 2: Income Gap (0–25)
  const gap = Math.max(0, spendingGoal - totalGuaranteedIncome);
  const gapPct = spendingGoal > 0 ? gap / spendingGoal : 0;
  const incomeGapScore = Math.min(25, Math.max(0, (gapPct / 0.6) * 25));

  // Component 3: Flexibility Need (0–25)
  // Equal 10-point deductions for heirs preference and healthcare concern.
  // Reviewed Aug 2026 — equal weighting kept intentionally (see AnnuityTool.tsx).
  let flexibilityNeed = 25;
  if (heirsImportant) flexibilityNeed -= 10;
  if (healthcareConcern) flexibilityNeed -= 10;

  // Component 4: Behavioral Fit (0–25)
  // Lower slider value (more risk-averse) → higher score.
  const behavioralFitScore = (4 - marketComfort) * (25 / 4);

  // Total suitability score, clamped to [0, 100]
  const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const suitabilityScore = clampScore(
    longevityScore + incomeGapScore + flexibilityNeed + behavioralFitScore
  );

  const payoutRate = getPayoutRate(currentAge);
  const allocPct = (suitabilityScore / 100) * 0.5;
  const rawDollarAmount = allocPct * investableAssets;
  const rawAnnuityIncome = rawDollarAmount * payoutRate;

  // Cap annuity income at the income gap.
  let finalDollarAmount = rawDollarAmount;
  if (gap === 0) {
    finalDollarAmount = 0;
  } else if (rawAnnuityIncome > gap) {
    finalDollarAmount = gap / payoutRate;
  }

  // Zero out sub-minimum-contract recommendations.
  const gapTooSmallForContract =
    finalDollarAmount > 0 && finalDollarAmount < MIN_ANNUITY_PURCHASE;
  if (gapTooSmallForContract) {
    finalDollarAmount = 0;
  }

  const finalAllocPct = investableAssets > 0 ? finalDollarAmount / investableAssets : 0;
  const estimatedAnnualIncome = finalDollarAmount * payoutRate;
  const ceilingDollarAmount = investableAssets * 0.5;

  return {
    suitabilityScore,
    longevityScore,
    incomeGapScore,
    flexibilityNeed,
    behavioralFitScore,
    gapTooSmallForContract,
    recommendedAmount: finalDollarAmount,
    recommendedPct: finalAllocPct,
    estimatedIncome: estimatedAnnualIncome,
    payoutRate,
    ceilingAmount: ceilingDollarAmount,
    gap,
    gapPct,
    totalGuaranteedIncome,
    remainingAssets: investableAssets - finalDollarAmount,
  };
}

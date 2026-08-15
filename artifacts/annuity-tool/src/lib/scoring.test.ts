/**
 * Archetype regression tests for the annuity suitability scoring engine.
 *
 * Three archetypes cover the score space:
 *   1. Clear Yes  — all signals favor an annuity (score ≥ 75, band 4)
 *   2. Clear No   — all signals oppose an annuity  (score ≤ 25, band 1)
 *   3. Edge Case  — signals split exactly across the band-2/band-3 boundary
 *
 * If a formula change causes any of these to shift score band, the test will
 * catch it before it reaches a client. Each test also pins at least one
 * component score so a localized formula regression is diagnosable.
 */

import { describe, it, expect } from 'vitest';
import { calculateResults, type ScoringInput } from './scoring';

// ---------------------------------------------------------------------------
// Archetype 1: Clear Yes
// High longevity horizon, large income gap, no illiquidity flags, maximum
// risk-aversion → every component should score near its maximum.
// ---------------------------------------------------------------------------
describe('Archetype 1 — Clear Yes', () => {
  const input: ScoringInput = {
    currentAge: 65,
    expectedAge: 92,         // longevity: ((92-75)/20)*25 = 21.25
    socialSecurityAnnual: 12_000,
    pensionAnnual: 0,
    otherGuaranteedIncome: 0,
    investableAssets: 1_000_000,
    spendingGoal: 80_000,    // gap 68k/80k = 85% → incomeGapScore capped at 25
    marketComfort: 0,        // most risk-averse → behavioralFit = 25
    heirsImportant: false,   // no deduction → flexibilityNeed = 25
    healthcareConcern: false,
  };
  // Expected total: round(21.25 + 25 + 25 + 25) = 96 — well inside band 4 (>75)

  const result = calculateResults(input);

  it('total score is in band 4 (> 75)', () => {
    expect(result.suitabilityScore).toBeGreaterThan(75);
  });

  it('total score equals 96', () => {
    expect(result.suitabilityScore).toBe(96);
  });

  it('longevityScore is ~21.25', () => {
    expect(result.longevityScore).toBeCloseTo(21.25, 2);
  });

  it('incomeGapScore is capped at 25 (gap > 60% of spending)', () => {
    expect(result.incomeGapScore).toBe(25);
  });

  it('flexibilityNeed is 25 (no illiquidity flags)', () => {
    expect(result.flexibilityNeed).toBe(25);
  });

  it('behavioralFitScore is 25 (most risk-averse)', () => {
    expect(result.behavioralFitScore).toBe(25);
  });

  it('recommended amount is positive', () => {
    expect(result.recommendedAmount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Archetype 2: Clear No
// Short longevity horizon, guaranteed income already covers spending (gap = 0),
// both illiquidity flags set, highest market comfort → every component scores
// near its minimum and there is no income gap for an annuity to fill.
// ---------------------------------------------------------------------------
describe('Archetype 2 — Clear No', () => {
  const input: ScoringInput = {
    currentAge: 68,
    expectedAge: 76,           // longevity: ((76-75)/20)*25 = 1.25
    socialSecurityAnnual: 40_000,
    pensionAnnual: 30_000,
    otherGuaranteedIncome: 0,  // totalGuaranteedIncome: 70,000 — covers spending
    investableAssets: 800_000,
    spendingGoal: 60_000,      // gap = max(0, 60k − 70k) = 0 → incomeGapScore = 0
    marketComfort: 4,          // most comfortable → behavioralFit = 0
    heirsImportant: true,      // −10
    healthcareConcern: true,   // −10 → flexibilityNeed = 5
  };
  // Expected total: round(1.25 + 0 + 5 + 0) = round(6.25) = 6 — band 1 (≤ 25)
  // Recommended amount = $0 because gap = 0 (nothing for an annuity to fill).

  const result = calculateResults(input);

  it('total score is in band 1 (≤ 25)', () => {
    expect(result.suitabilityScore).toBeLessThanOrEqual(25);
  });

  it('total score equals 6', () => {
    expect(result.suitabilityScore).toBe(6);
  });

  it('longevityScore is ~1.25 (very short horizon)', () => {
    expect(result.longevityScore).toBeCloseTo(1.25, 2);
  });

  it('incomeGapScore is 0 (guaranteed income covers spending)', () => {
    expect(result.incomeGapScore).toBe(0);
  });

  it('flexibilityNeed is 5 (both flags deducted)', () => {
    expect(result.flexibilityNeed).toBe(5);
  });

  it('behavioralFitScore is 0 (market comfort = 4)', () => {
    expect(result.behavioralFitScore).toBe(0);
  });

  it('recommended amount is 0 (gap = 0 — nothing for annuity to fill)', () => {
    expect(result.recommendedAmount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Archetype 3: Edge Case — band 2 / band 3 boundary
// Inputs are calibrated so the raw sum lands just above 50, confirming the
// client falls into band 3 ("worth serious consideration") rather than band 2.
// Both flexibility flags are set, so this also validates the dual-flag floor.
// ---------------------------------------------------------------------------
describe('Archetype 3 — Edge Case (band 2/3 boundary)', () => {
  const input: ScoringInput = {
    currentAge: 70,
    expectedAge: 85,           // longevity: ((85-75)/20)*25 = 12.5
    socialSecurityAnnual: 20_000,
    pensionAnnual: 0,
    otherGuaranteedIncome: 10_000, // totalGuaranteedIncome: 30,000
    investableAssets: 500_000,
    spendingGoal: 60_000,      // gap 30k/60k = 50% → incomeGapScore = (0.5/0.6)*25 ≈ 20.83
    marketComfort: 2,          // neutral → behavioralFit = (4-2)*(25/4) = 12.5
    heirsImportant: true,      // −10
    healthcareConcern: true,   // −10 → flexibilityNeed = 5
  };
  // Expected total: round(12.5 + 20.83 + 5 + 12.5) = round(50.83) = 51 — band 3 (> 50)

  const result = calculateResults(input);

  it('total score equals 51 (just above the band-2/3 boundary)', () => {
    expect(result.suitabilityScore).toBe(51);
  });

  it('total score is in band 3 (> 50 and ≤ 75)', () => {
    expect(result.suitabilityScore).toBeGreaterThan(50);
    expect(result.suitabilityScore).toBeLessThanOrEqual(75);
  });

  it('longevityScore is 12.5 (midpoint horizon)', () => {
    expect(result.longevityScore).toBeCloseTo(12.5, 2);
  });

  it('incomeGapScore is ~20.83 (50% gap)', () => {
    expect(result.incomeGapScore).toBeCloseTo(20.83, 1);
  });

  it('flexibilityNeed is 5 (both illiquidity flags active — dual-flag floor)', () => {
    expect(result.flexibilityNeed).toBe(5);
  });

  it('behavioralFitScore is 12.5 (neutral market comfort)', () => {
    expect(result.behavioralFitScore).toBeCloseTo(12.5, 2);
  });
});

import { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface FormData {
  currentAge: string;
  expectedAge: string;
  // Employment income is collected for context but excluded from the annuity
  // income-gap calculation — it is typically non-recurring in retirement.
  employmentIncome: string;
  selfEmploymentIncome: string;
  // These three form the guaranteed income total used in the annuity analysis.
  socialSecurityAnnual: string;
  pensionAnnual: string;
  otherGuaranteedIncome: string;
  heirsImportant: boolean;
  healthcareConcern: boolean;
  investableAssets: string;
  spendingGoal: string;
  marketComfort: number;
}

const SCENARIO_OPTIONS = [
  { value: 0, label: 'Sell most of it — I couldn\'t sleep' },
  { value: 1, label: 'Sell some and move to cash' },
  { value: 2, label: 'Hold what I have and wait it out' },
  { value: 3, label: 'Hold and rebalance as planned' },
  { value: 4, label: 'Buy more while prices are down' },
];

export default function AnnuityTool() {
  const [step, setStep] = useState(0);

  // Scroll to top whenever the step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [step]);
  const [formData, setFormData] = useState<FormData>({
    currentAge: '',
    expectedAge: '90',
    employmentIncome: '',
    selfEmploymentIncome: '',
    socialSecurityAnnual: '',
    pensionAnnual: '',
    otherGuaranteedIncome: '',
    heirsImportant: false,
    healthcareConcern: false,
    investableAssets: '',
    spendingGoal: '',
    marketComfort: 2,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const validateStep1 = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    const currentAge = Number(formData.currentAge);
    const expectedAge = Number(formData.expectedAge);

    // Require a realistic retirement-planning age; reject values below 50
    if (!formData.currentAge || isNaN(currentAge) || currentAge < 50 || currentAge > 120) {
      newErrors.currentAge = 'Please enter a valid current age (50–120)';
    }
    if (!formData.expectedAge || isNaN(expectedAge) || expectedAge < 1 || expectedAge > 120) {
      newErrors.expectedAge = 'Please enter a valid expected age (1–120)';
    }
    // Check ordering only after both fields pass their own validation to avoid
    // misleading messages (and avoid short-circuiting on age === 0)
    if (!newErrors.currentAge && !newErrors.expectedAge && expectedAge <= currentAge) {
      newErrors.expectedAge = 'Expected age must be greater than current age';
    }
    // Income fields default to blank → treated as 0. No individual field is
    // required; an advisor may leave items blank for fields not applicable.

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (formData.investableAssets === '' || isNaN(Number(formData.investableAssets))) {
      newErrors.investableAssets = 'Please enter your total investable assets';
    } else if (Number(formData.investableAssets) < 0) {
      newErrors.investableAssets = 'Investable assets cannot be negative';
    }
    if (formData.spendingGoal === '' || isNaN(Number(formData.spendingGoal))) {
      newErrors.spendingGoal = 'Please enter your annual spending goal';
    } else if (Number(formData.spendingGoal) <= 0) {
      newErrors.spendingGoal = 'Spending goal must be greater than zero';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
  };

  const handleBack = () => {
    setStep((prev) => Math.max(0, prev - 1));
  };

  const handleStartOver = () => {
    setStep(0);
    setFormData({
      currentAge: '',
      expectedAge: '90',
      employmentIncome: '',
      selfEmploymentIncome: '',
      socialSecurityAnnual: '',
      pensionAnnual: '',
      otherGuaranteedIncome: '',
      heirsImportant: false,
      healthcareConcern: false,
      investableAssets: '',
      spendingGoal: '',
      marketComfort: 2,
    });
    setErrors({});
  };

  const calculateResults = () => {
    // Fallback to 0 for any field that somehow arrives as NaN (e.g. empty string
    // after a rapid Back → forward navigation before validation fires)
    const currentAge   = Number(formData.currentAge)    || 0;
    const expectedAge  = Number(formData.expectedAge)   || 0;
    // Guaranteed income for the annuity gap = SS + pension + other guaranteed.
    // Employment / self-employment income is collected for context only.
    const totalGuaranteedIncome =
      (Number(formData.socialSecurityAnnual)   || 0) +
      (Number(formData.pensionAnnual)          || 0) +
      (Number(formData.otherGuaranteedIncome)  || 0);
    const investableAssets = Number(formData.investableAssets) || 0;
    const spendingGoal = Number(formData.spendingGoal)  || 0;
    const sliderValue = formData.marketComfort;
    const heirsImportant = formData.heirsImportant;
    const healthcareConcern = formData.healthcareConcern;

    // Component 1: Longevity (0-25)
    // Anchors: zero at age 75, maximum at age 95 (capped).
    // Previous anchors (zero at 80, max at 100) placed age 90 at the exact
    // midpoint (12.5/25), which under-scored realistic longevity cases —
    // e.g. a 72-year-old expecting to live to 90 earned only 12.5/25 despite
    // being a textbook high-longevity profile. Shifting both anchors down by 5
    // years puts age 90 at 18.75/25 (well above midpoint) while keeping the
    // formula linear and preserving behaviour at the tails: anything ≤ 75 = 0,
    // anything ≥ 95 = 25. Reviewed Aug 2026.
    const longevityScore = Math.min(25, Math.max(0, ((expectedAge - 75) / 20) * 25));

    // Component 2: Income Gap (0-25)
    // gap is reused throughout the cap chain below
    const gap = Math.max(0, spendingGoal - totalGuaranteedIncome);
    const gapPct = spendingGoal > 0 ? gap / spendingGoal : 0;
    const incomeGapScore = Math.min(25, Math.max(0, (gapPct / 0.6) * 25));

    // Component 4: Behavioral Fit (0-25)
    const behavioralFitScore = (4 - sliderValue) * (25 / 4);

    // Payout rate — moved above the concentration check so the check can use it
    // as part of an exogenous (score-independent) test.
    // NOTE: getPayoutRate returns a full-precision interpolated value (e.g. 0.0676
    // for age 67). The UI displays it rounded to one decimal (6.8%) for readability,
    // but all income calculations use the unrounded value.
    const getPayoutRate = (age: number): number => {
      // Updated breakpoints reflecting current SPIA market rates.
      // Internal math uses full-precision interpolated values; display rounds
      // to one decimal.
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
    };
    const payoutRate = getPayoutRate(currentAge);

    // Component 3: Flexibility Need (0-25)
    // The 10-point deductions for heirsImportant and healthcareConcern are
    // equal-weighted by design. Reviewed Aug 2026: healthcare liquidity could
    // arguably be weighted heavier as a harder constraint than heirs preference,
    // but heirs vs. healthcare priority varies enough by client that equal
    // weighting was kept rather than assuming one universally outweighs the
    // other. No floor is enforced; both flags together yield a minimum of 5/25,
    // which was tested (see Archetype 3 test case) and found to move the score
    // a full band without being cosmetic.
    let flexibilityNeed = 25;
    if (heirsImportant) flexibilityNeed -= 10;
    if (healthcareConcern) flexibilityNeed -= 10;

    // Concentration was previously applied as a –5 to flexibility, first as a
    // circular score-derived check, then as an exogenous gap/payoutRate check.
    // Both approaches penalised the majority of clients with any meaningful gap
    // (20-profile sample: 55% at 35% threshold, 40% at 60%), making the
    // component nearly constant rather than discriminating. Concentration is
    // already addressed at the recommendation layer (50% cap) and in the
    // consideration block below — penalising it a third time inside the score
    // was redundant. Flexibility now reflects only illiquidity preference
    // (heirs and healthcare) as originally intended.

    // Suitability score — computed once, clamped to [0, 100]
    const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
    const suitabilityScore = clampScore(
      longevityScore + incomeGapScore + flexibilityNeed + behavioralFitScore
    );
    const allocPct = (suitabilityScore / 100) * 0.5;

    const rawDollarAmount = allocPct * investableAssets;
    const rawAnnuityIncome = rawDollarAmount * payoutRate;

    // Cap so annuity income doesn't exceed the income gap.
    // If guaranteed income already covers spending entirely (gap = 0),
    // there is nothing for an annuity to fill — recommend $0.
    let finalDollarAmount = rawDollarAmount;
    if (gap === 0) {
      finalDollarAmount = 0;
    } else if (rawAnnuityIncome > gap) {
      finalDollarAmount = gap / payoutRate;
    }

    // Minimum contract floor — most carriers will not write a contract below
    // ~$25,000. If the computed amount falls below this, flag it and zero the
    // recommendation so the UI can explain rather than name a meaningless figure.
    const MIN_ANNUITY_PURCHASE = 25000;
    const gapTooSmallForContract =
      finalDollarAmount > 0 && finalDollarAmount < MIN_ANNUITY_PURCHASE;
    if (gapTooSmallForContract) {
      finalDollarAmount = 0;
    }

    const finalAllocPct = investableAssets > 0 ? finalDollarAmount / investableAssets : 0;
    const estimatedAnnualIncome = finalDollarAmount * payoutRate;

    // 50% ceiling
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
  };

  const getSuitabilityBand = (score: number): string => {
    if (score <= 25) return 'An annuity is unlikely to be the right tool for your situation.';
    if (score <= 50) return 'An annuity may make sense for a small portion of your assets.';
    if (score <= 75) return 'An annuity is worth serious consideration as part of your income plan.';
    return 'An annuity aligns well with your priorities and goals.';
  };

  const getScoreColor = (score: number): string => {
    if (score > 75) return '#059669'; // band 4 — emerald, affirmative
    if (score > 50) return '#D97706'; // band 3 — amber, worth considering
    if (score > 25) return '#64748B'; // band 2 — slate, non-affirmative
    return '#475569';                 // band 1 — darker slate, clearly no
  };

  const downloadPDF = () => {
      const doc = new jsPDF();

      const results = calculateResults();
      const today = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      let y = 20;
      const leftMargin = 20;
      const rightMargin = 190;

      // Header
      doc.setFontSize(10);
      doc.text(today, leftMargin, y);
      doc.text('Gambit Capital Management, LLC', rightMargin, y, { align: 'right' });
      y += 10;
      doc.line(leftMargin, y, rightMargin, y);
      y += 15;

      // Client Inputs
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Client Inputs', leftMargin, y);
      y += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Current age: ${formData.currentAge}`, leftMargin, y);
      y += 6;
      doc.text(`Expected age: ${formData.expectedAge}`, leftMargin, y);
      y += 6;
      // Guaranteed income breakdown
      const ss    = Number(formData.socialSecurityAnnual)  || 0;
      const pen   = Number(formData.pensionAnnual)         || 0;
      const other = Number(formData.otherGuaranteedIncome) || 0;
      const emp   = (Number(formData.employmentIncome) || 0) + (Number(formData.selfEmploymentIncome) || 0);
      if (ss > 0) {
        doc.text(`Social Security: ${formatCurrency(ss)}/year`, leftMargin, y);
        y += 6;
      }
      if (pen > 0) {
        doc.text(`Pension: ${formatCurrency(pen)}/year`, leftMargin, y);
        y += 6;
      }
      if (other > 0) {
        doc.text(`Other guaranteed income: ${formatCurrency(other)}/year`, leftMargin, y);
        y += 6;
      }
      doc.text(
        `Total guaranteed income: ${formatCurrency(ss + pen + other)}/year`,
        leftMargin,
        y
      );
      y += 6;
      if (emp > 0) {
        doc.setFont('helvetica', 'italic');
        doc.text(
          `Employment income: ${formatCurrency(emp)}/year (context only — not used in analysis)`,
          leftMargin,
          y,
          { maxWidth: 170 }
        );
        doc.setFont('helvetica', 'normal');
        y += 8;
      }
      doc.text(`Leaving money to heirs: ${formData.heirsImportant ? 'Yes' : 'No'}`, leftMargin, y);
      y += 6;
      doc.text(
        `Healthcare/LTC concern: ${formData.healthcareConcern ? 'Yes' : 'No'}`,
        leftMargin,
        y
      );
      y += 6;
      doc.text(
        `Investable assets: ${formatCurrency(Number(formData.investableAssets))}`,
        leftMargin,
        y
      );
      y += 6;
      doc.text(
        `Annual spending goal: ${formatCurrency(Number(formData.spendingGoal))}/year`,
        leftMargin,
        y
      );
      y += 6;
      doc.text(
        `Market scenario response: ${SCENARIO_OPTIONS[formData.marketComfort]?.label ?? ''}`,
        leftMargin,
        y,
        { maxWidth: 170 }
      );
      y += 12;

      // Suitability Assessment
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Suitability Assessment', leftMargin, y);
      y += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Score: ${results.suitabilityScore}/100`, leftMargin, y);
      y += 6;
      doc.text(getSuitabilityBand(results.suitabilityScore), leftMargin, y, {
        maxWidth: 170,
      });
      y += 12;

      doc.text(`Longevity: ${Math.round(results.longevityScore)}/25`, leftMargin, y);
      y += 5;
      doc.setFont('helvetica', 'italic');
      const longevityNote = doc.splitTextToSize(
        `Your expected age of ${formData.expectedAge} is the number you told us, not a projection from a mortality table. We ask because a longer expected lifespan generally makes guaranteed income more valuable, since it has more years to pay out.`,
        170
      );
      doc.text(longevityNote, leftMargin, y);
      doc.setFont('helvetica', 'normal');
      y += longevityNote.length * 5 + 3;
      doc.text(
        `Income Gap: ${Math.round(results.incomeGapScore)}/25 (${(results.gapPct * 100).toFixed(0)}% gap)`,
        leftMargin,
        y
      );
      y += 6;
      doc.text(`Flexibility Need: ${Math.round(results.flexibilityNeed)}/25`, leftMargin, y);
      y += 6;
      doc.text(`Behavioral Fit: ${Math.round(results.behavioralFitScore)}/25`, leftMargin, y);
      y += 12;

      // Recommendation
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Recommendation', leftMargin, y);
      y += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Recommended amount: ${formatCurrency(results.recommendedAmount)}`,
        leftMargin,
        y
      );
      y += 6;
      doc.text(
        `As percentage of assets: ${(results.recommendedPct * 100).toFixed(1)}%`,
        leftMargin,
        y
      );
      y += 6;
      doc.text(
        `Estimated annual income: ${formatCurrency(results.estimatedIncome)}/year`,
        leftMargin,
        y
      );
      y += 6;
      doc.text(
        `50% ceiling (the most we'd ever point you toward): ${formatCurrency(results.ceilingAmount)}`,
        leftMargin,
        y
      );
      y += 6;

      // Zero-gap / gap-too-small notes inline with recommendation
      if (results.gap === 0) {
        doc.setFont('helvetica', 'italic');
        const noteLines = doc.splitTextToSize(
          'Note: Guaranteed income already covers the full spending goal \u2014 there is no income gap for an annuity to fill.',
          170
        );
        doc.text(noteLines, leftMargin, y);
        y += noteLines.length * 5 + 6;
        doc.setFont('helvetica', 'normal');
      } else if (results.gapTooSmallForContract) {
        doc.setFont('helvetica', 'italic');
        const noteLines = doc.splitTextToSize(
          'Note: The income gap would be fully covered by an annuity smaller than the typical minimum contract size (~$25,000). A standard annuity is not cost-effective for a gap this size.',
          170
        );
        doc.text(noteLines, leftMargin, y);
        y += noteLines.length * 5 + 6;
        doc.setFont('helvetica', 'normal');
      } else {
        y += 6;
      }

      // Alternatives
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Other ways to close this gap', leftMargin, y);
      y += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const alternatives = [
        { title: 'Delaying Social Security', text: "If you haven't claimed yet, every year you wait past full retirement age raises your benefit roughly 8% for life, and that higher amount keeps adjusting for inflation. It's usually the cheapest guaranteed income available." },
        { title: 'A bond or TIPS ladder', text: 'Individual bonds timed to mature in the years you need the money. Predictable, and TIPS keep pace with inflation. The limitation is that a ladder covers a set number of years, not your whole life.' },
        { title: 'Staying invested and withdrawing on a schedule', text: "Your money stays yours, stays reachable, and keeps growing. The income isn't guaranteed, and you carry the risk of a bad market stretch early on." },
        { title: 'A smaller annuity', text: "Cover only the spending you can't afford to miss, like housing, food, and insurance. Everything above that stays flexible." },
        { title: 'Waiting and buying later', text: 'Payout rates rise with age. The same income costs less at 75 than at 65, and the money stays available to you in the meantime.' },
      ];
      for (const alt of alternatives) {
        if (y > 255) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'bold');
        doc.text(alt.title, leftMargin, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        const altLines = doc.splitTextToSize(alt.text, 170);
        doc.text(altLines, leftMargin, y);
        y += altLines.length * 5 + 4;
      }
      y += 4;

      // Footer — add new page if too close to the bottom
      if (y > 260) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(9);
      doc.text(
        'Prepared using the Gambit Capital Management retirement income framework.',
        leftMargin,
        y
      );
      y += 6;
      doc.text(
        'This is an educational tool, not a recommendation or investment advice.',
        leftMargin,
        y
      );
      y += 4;
      doc.text('This report was generated on your own device.', leftMargin, y);
      y += 10;
      doc.text(
        'Advisor: ________________________________    Contact: ________________________________',
        leftMargin,
        y
      );

      doc.save('annuity-assessment.pdf');
  };

  const results = step === 3 ? calculateResults() : null;

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 lg:px-8">
          <img
            src="/gambit-logo.png"
            alt="Gambit Capital Management, LLC"
            className="h-12 w-auto"
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Progress — hidden on intro screen */}
        {step > 0 && (
          <div className="mb-8 text-center">
            <p className="text-sm font-medium text-muted-foreground">Step {step} of 3</p>
          </div>
        )}

        {/* Step 0: Intro */}
        {step === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <h2 className="text-3xl font-bold text-foreground">Do I Need An Annuity?</h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
              Not sure if an annuity is right for you? This tool gives you a real answer, including
              the downsides annuity salespeople don't volunteer.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">3 steps · takes about 2 minutes</p>
            <Button
              onClick={() => setStep(1)}
              className="mt-8"
              data-testid="button-start-assessment"
            >
              Start Assessment
            </Button>
            <p className="mt-6 text-xs text-muted-foreground">
              Everything you enter stays on your device. Nothing is sent anywhere.
            </p>
          </div>
        )}

        {/* Step 1: Your Situation */}
        {step === 1 && (
          <div className="space-y-8">
            {/* Privacy Notice */}
            <div
              className="rounded-md border-l-4 border-primary bg-muted p-4"
              data-testid="privacy-notice"
            >
              <p className="text-sm text-foreground">
                Everything you enter stays on your device. Nothing is sent to us, saved, or
                tracked. Close this page and it's gone.
              </p>
            </div>

            <div className="space-y-6">
              <div>
                <Label htmlFor="currentAge" className="text-base font-medium">
                  Current age
                </Label>
                <Input
                  id="currentAge"
                  type="number"
                  min="50"
                  max="120"
                  value={formData.currentAge}
                  onChange={(e) => updateField('currentAge', e.target.value)}
                  className="mt-2"
                  data-testid="input-current-age"
                />
                {errors.currentAge && (
                  <p className="mt-1 text-sm text-destructive">{errors.currentAge}</p>
                )}
              </div>

              <div>
                <Label htmlFor="expectedAge" className="text-base font-medium">
                  What age do you expect to live to?
                </Label>
                <Input
                  id="expectedAge"
                  type="number"
                  min="1"
                  max="120"
                  value={formData.expectedAge}
                  onChange={(e) => updateField('expectedAge', e.target.value)}
                  className="mt-2"
                  data-testid="input-expected-age"
                />
                <p className="mt-2 text-sm text-muted-foreground">
                  This is your own estimate, not a calculation. Think about your health, your family
                  history, and how long your parents or grandparents lived.
                </p>
                {errors.expectedAge && (
                  <p className="mt-1 text-sm text-destructive">{errors.expectedAge}</p>
                )}
              </div>

              {/* Income sources — split into employment (context only) and
                  guaranteed retirement income (used in the annuity analysis) */}
              <div className="space-y-4">
                <div>
                  <p className="text-base font-medium text-foreground">Income sources</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Only the guaranteed retirement income rows factor into the annuity analysis.
                    Employment income is collected for context.
                  </p>
                </div>

                {/* Employment income — context only */}
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Employment income (not used in annuity analysis)
                  </p>
                  <div>
                    <Label htmlFor="employmentIncome" className="text-sm font-medium">
                      W-2 employment income ($/year)
                    </Label>
                    <div className="relative mt-2">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        id="employmentIncome"
                        type="text"
                        inputMode="numeric"
                        value={formData.employmentIncome}
                        onChange={(e) => updateField('employmentIncome', e.target.value)}
                        className="pl-7"
                        data-testid="input-employment-income"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="selfEmploymentIncome" className="text-sm font-medium">
                      Self-employment income ($/year)
                    </Label>
                    <div className="relative mt-2">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        id="selfEmploymentIncome"
                        type="text"
                        inputMode="numeric"
                        value={formData.selfEmploymentIncome}
                        onChange={(e) => updateField('selfEmploymentIncome', e.target.value)}
                        className="pl-7"
                        data-testid="input-self-employment-income"
                      />
                    </div>
                  </div>
                </div>

                {/* Guaranteed retirement income — used in annuity analysis */}
                <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Guaranteed retirement income (used in annuity analysis)
                  </p>
                  <div>
                    <Label htmlFor="socialSecurityAnnual" className="text-sm font-medium">
                      Social Security annual benefit ($/year)
                    </Label>
                    <div className="relative mt-2">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        id="socialSecurityAnnual"
                        type="text"
                        inputMode="numeric"
                        value={formData.socialSecurityAnnual}
                        onChange={(e) => updateField('socialSecurityAnnual', e.target.value)}
                        className="pl-7"
                        data-testid="input-social-security"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="pensionAnnual" className="text-sm font-medium">
                      Pension or other guaranteed income ($/year)
                    </Label>
                    <div className="relative mt-2">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        id="pensionAnnual"
                        type="text"
                        inputMode="numeric"
                        value={formData.pensionAnnual}
                        onChange={(e) => updateField('pensionAnnual', e.target.value)}
                        className="pl-7"
                        data-testid="input-pension"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="otherGuaranteedIncome" className="text-sm font-medium">
                      Other guaranteed income — annuities, rental, etc. ($/year)
                    </Label>
                    <div className="relative mt-2">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        id="otherGuaranteedIncome"
                        type="text"
                        inputMode="numeric"
                        value={formData.otherGuaranteedIncome}
                        onChange={(e) => updateField('otherGuaranteedIncome', e.target.value)}
                        className="pl-7"
                        data-testid="input-other-income"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="heirsImportant" className="text-base font-medium">
                    Is leaving money to heirs important to you?
                  </Label>
                  <Switch
                    id="heirsImportant"
                    checked={formData.heirsImportant}
                    onCheckedChange={(checked) => updateField('heirsImportant', checked)}
                    data-testid="switch-heirs-important"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="healthcareConcern" className="text-base font-medium">
                    Are you concerned about future healthcare or long-term care costs?
                  </Label>
                  <Switch
                    id="healthcareConcern"
                    checked={formData.healthcareConcern}
                    onCheckedChange={(checked) => updateField('healthcareConcern', checked)}
                    data-testid="switch-healthcare-concern"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                onClick={handleNext}
                className="w-full sm:w-auto"
                data-testid="button-next-step1"
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Your Finances */}
        {step === 2 && (
          <div className="space-y-8">
            <button
              onClick={handleBack}
              className="text-sm text-muted-foreground hover:text-foreground"
              data-testid="button-back-step2"
            >
              ← Back
            </button>

            <div className="space-y-6">
              <div>
                <Label htmlFor="investableAssets" className="text-base font-medium">
                  Total investable assets
                </Label>
                <div className="relative mt-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="investableAssets"
                    type="text"
                    inputMode="numeric"
                    value={formData.investableAssets}
                    onChange={(e) => updateField('investableAssets', e.target.value)}
                    className="pl-7"
                    data-testid="input-investable-assets"
                  />
                </div>
                {errors.investableAssets && (
                  <p className="mt-1 text-sm text-destructive">{errors.investableAssets}</p>
                )}
              </div>

              <div>
                <Label htmlFor="spendingGoal" className="text-base font-medium">
                  Annual spending you want to support in retirement
                </Label>
                <div className="relative mt-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="spendingGoal"
                    type="text"
                    inputMode="numeric"
                    value={formData.spendingGoal}
                    onChange={(e) => updateField('spendingGoal', e.target.value)}
                    className="pl-7"
                    data-testid="input-spending-goal"
                  />
                </div>
                {errors.spendingGoal && (
                  <p className="mt-1 text-sm text-destructive">{errors.spendingGoal}</p>
                )}
              </div>

              <div className="pt-4">
                <Label className="text-base font-medium">
                  Your investments drop 25% in a single year. What would you most likely do?
                </Label>
                <RadioGroup
                  value={String(formData.marketComfort)}
                  onValueChange={(val) => updateField('marketComfort', Number(val))}
                  className="mt-4 space-y-2"
                  data-testid="radio-market-scenario"
                >
                  {SCENARIO_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-sm transition-colors ${
                        formData.marketComfort === opt.value
                          ? 'border-primary bg-accent/40 text-foreground'
                          : 'border-border bg-card text-foreground hover:bg-muted/50'
                      }`}
                      data-testid={`radio-scenario-${opt.value}`}
                    >
                      <RadioGroupItem value={String(opt.value)} id={`scenario-${opt.value}`} />
                      {opt.label}
                    </label>
                  ))}
                </RadioGroup>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                onClick={handleNext}
                className="w-full sm:w-auto"
                data-testid="button-next-step2"
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Results */}
        {step === 3 && results && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <button
                onClick={handleBack}
                className="text-sm text-muted-foreground hover:text-foreground"
                data-testid="button-back-step3"
              >
                ← Back
              </button>
              <button
                onClick={handleStartOver}
                className="text-sm text-muted-foreground hover:text-foreground"
                data-testid="button-start-over"
              >
                Start over
              </button>
            </div>

            {/* Suitability Score */}
            <div className="text-center">
              <div className="mb-2 flex items-baseline justify-center gap-1" data-testid="text-suitability-score">
                <span
                  className="text-6xl font-bold"
                  style={{ color: getScoreColor(results.suitabilityScore) }}
                >
                  {results.suitabilityScore}
                </span>
                <span className="text-3xl font-normal text-muted-foreground">/ 100</span>
              </div>
              <div className="text-lg font-medium text-muted-foreground">Suitability Score</div>
              <p className="mx-auto mt-4 max-w-2xl text-base text-foreground" data-testid="text-suitability-band">
                {getSuitabilityBand(results.suitabilityScore)}
              </p>
              <button
                type="button"
                onClick={() => document.getElementById('score-breakdown')?.scrollIntoView({ behavior: 'smooth' })}
                className="mt-3 text-sm text-muted-foreground hover:text-foreground"
              >
                ↓ See what drove this score
              </button>
            </div>

            {/* Scoring Methodology Explainer */}
            <div id="score-breakdown">
              <h2 className="mb-4 text-xl font-semibold text-foreground">
                How your score was calculated
              </h2>
              <p className="mb-5 text-sm text-muted-foreground">
                Your score comes from four things, each worth 25 points. Any one of them can rule
                an annuity out on its own, so none of them outweighs the others.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {([
                  {
                    name: 'Longevity',
                    subtitle: 'How long the money has to last',
                    description: 'The longer your retirement, the more valuable a check that never stops. A shorter horizon favors keeping money flexible and invested.',
                    score: Math.round(results.longevityScore),
                    detail: `Your expected age of ${Number(formData.expectedAge)} is the number you told us, not a projection from a mortality table. We ask because a longer expected lifespan generally makes guaranteed income more valuable, since it has more years to pay out.`,
                  },
                  {
                    name: 'Income Gap',
                    subtitle: "How much of your spending isn't covered yet",
                    description: 'Social Security and pensions cover part of what you spend. The rest comes out of savings. The bigger that gap, the more an annuity can do for you.',
                    score: Math.round(results.incomeGapScore),
                    detail: (() => {
                      const pct = Math.round(results.gapPct * 100);
                      if (results.gap === 0) return "Social Security and pension income already cover your spending goal. There's no gap for an annuity to fill.";
                      return `Social Security and pension income cover ${100 - pct}% of what you plan to spend. The other ${pct}%, about ${formatCurrency(results.gap)} a year, has to come out of savings.`;
                    })(),
                  },
                  {
                    name: 'Flexibility Need',
                    subtitle: 'How much has to stay within reach',
                    description: "Once you hand money to an insurance company, it's gone for good. If you want to leave something to family or expect significant healthcare costs, more of your savings needs to stay reachable.",
                    score: Math.round(results.flexibilityNeed),
                    detail: (() => {
                      if (formData.heirsImportant && formData.healthcareConcern) return "You told us leaving money to family and covering healthcare costs both matter, so most of your savings needs to stay accessible.";
                      if (formData.heirsImportant) return "You want to leave money to family. An annuity pays you, not your heirs, so that limits how much belongs in one.";
                      if (formData.healthcareConcern) return "You expect meaningful healthcare costs. Money in an annuity can't be pulled out for a large medical bill, so more needs to stay liquid.";
                      return "You don't have competing claims on this money, so more of it can go toward guaranteed income.";
                    })(),
                  },
                  {
                    name: 'Behavioral Fit',
                    subtitle: 'What you actually do when markets drop',
                    description: "Selling in a downturn does more damage than the downturn. If that's a real risk for you, guaranteed income takes the decision off the table.",
                    score: Math.round(results.behavioralFitScore),
                    detail: `You said: "${SCENARIO_OPTIONS[formData.marketComfort]?.label}."${formData.marketComfort <= 1 ? ' Investors who would reduce exposure in a downturn often benefit from guaranteed income that removes the decision entirely.' : formData.marketComfort >= 3 ? ' Investors comfortable staying invested or buying in a downturn typically have less need for guaranteed income to manage volatility.' : ' A hold-and-wait response suggests moderate tolerance — guaranteed income may reduce pressure to act during downturns.'}`,
                  },
                ] as { name: string; subtitle: string; description: string; score: number; detail: string }[]).map((c) => (
                  <div key={c.name} className="rounded-lg border-l-4 border-primary bg-card p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{c.name}</p>
                      <span className="text-sm font-semibold tabular-nums text-primary">{c.score}/25</span>
                    </div>
                    <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.subtitle}</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.description}</p>
                    <p className="mt-3 rounded border border-border bg-muted/50 px-3 py-2 text-sm text-foreground">{c.detail}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg border-l-4 border-amber-400 bg-amber-50 p-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  <strong className="text-foreground">Why all four count equally. </strong>
                  A large income gap doesn't matter much if you need the money available for medical
                  bills. Staying calm in a selloff doesn't matter if Social Security already covers
                  your spending. Each one can independently make an annuity a bad fit.
                </p>
              </div>
            </div>

            {/* Recommendation */}
            <div>
              <h2 className="mb-4 text-xl font-semibold text-foreground">
                Right-Sized Recommendation
              </h2>
              <div className="rounded-lg border-2 border-primary bg-accent/30 p-6">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-foreground">Recommended annuity amount:</span>
                    <span className="font-semibold text-foreground" data-testid="text-recommended-amount">
                      {formatCurrency(results.recommendedAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground">As percentage of investable assets:</span>
                    <span className="font-semibold text-foreground" data-testid="text-recommended-pct">
                      {(results.recommendedPct * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground">Estimated annual income it would produce:</span>
                    <span className="font-semibold text-foreground" data-testid="text-estimated-income">
                      {formatCurrency(results.estimatedIncome)}/year
                    </span>
                  </div>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  This estimate uses an annuity payout rate of{' '}
                  {(results.payoutRate * 100).toFixed(1)}% for someone purchasing at age{' '}
                  {formData.currentAge}. Income calculations use the full-precision interpolated
                  rate; the percentage shown above is rounded for display only.
                </p>
                {results.gap === 0 && (
                  <p className="mt-3 rounded-md border border-border bg-muted/50 p-3 text-sm text-foreground">
                    Your guaranteed income already covers your full spending goal — there is no
                    income gap for an annuity to fill.
                  </p>
                )}
                {results.gapTooSmallForContract && (
                  <p className="mt-3 rounded-md border border-border bg-muted/50 p-3 text-sm text-foreground">
                    Your income gap would be fully covered by an annuity smaller than the typical
                    minimum contract size (~$25,000). Most carriers will not write a contract below
                    this threshold. A standard annuity is not cost-effective for a gap this size —
                    consider other income strategies.
                  </p>
                )}
              </div>

              <div className="mt-4 rounded-lg border border-border bg-card p-4">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm font-medium text-foreground">The most we'd ever point you toward</span>
                  <span className="text-lg font-semibold tabular-nums text-foreground" data-testid="text-ceiling-amount">
                    {formatCurrency(results.ceilingAmount)}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Half your investable savings should stay liquid and invested no matter how strong
                  the case for an annuity looks. That money covers emergencies, one-time expenses,
                  inflation you didn't plan for, and anything you want to leave behind. This is a
                  ceiling, not a goal. The number above it is what actually fits your situation.
                </p>
              </div>
            </div>

            {/* Alternatives */}
            <div>
              <h2 className="mb-2 text-xl font-semibold text-foreground">Other ways to close this gap</h2>
              <p className="mb-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {results.gap > 0
                  ? `An annuity is one way to cover the ${formatCurrency(results.gap)} a year your guaranteed income doesn't reach. It isn't the only way, and it's worth knowing what you're choosing between.`
                  : 'An annuity is one option among several. It\'s worth knowing what you\'re choosing between.'}
              </p>
              <div className="divide-y divide-border border-y border-border">
                {([
                  { title: 'Delaying Social Security', text: "If you haven't claimed yet, every year you wait past full retirement age raises your benefit roughly 8% for life, and that higher amount keeps adjusting for inflation. It's usually the cheapest guaranteed income available." },
                  { title: 'A bond or TIPS ladder', text: 'Individual bonds timed to mature in the years you need the money. Predictable, and TIPS keep pace with inflation. The limitation is that a ladder covers a set number of years, not your whole life.' },
                  { title: 'Staying invested and withdrawing on a schedule', text: "Your money stays yours, stays reachable, and keeps growing. The income isn't guaranteed, and you carry the risk of a bad market stretch early on." },
                  { title: 'A smaller annuity', text: "Cover only the spending you can't afford to miss, like housing, food, and insurance. Everything above that stays flexible." },
                  { title: 'Waiting and buying later', text: 'Payout rates rise with age. The same income costs less at 75 than at 65, and the money stays available to you in the meantime.' },
                ] as { title: string; text: string }[]).map((alt) => (
                  <div key={alt.title} className="py-4">
                    <h3 className="text-sm font-semibold text-foreground">{alt.title}</h3>
                    <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{alt.text}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                These aren't mutually exclusive. Most people who should own an annuity should own one alongside these, not instead of them.
              </p>
            </div>

            {/* Considerations */}
            <div className="space-y-8" data-testid="section-considerations">

              {/* What this tool doesn't account for */}
              <div>
                <h2 className="mb-5 text-xl font-semibold text-foreground">What this tool doesn't account for</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                  <div
                    style={{ borderLeft: '3px solid #D4D4D4', padding: '20px', fontSize: '15px', lineHeight: '1.7', color: '#1A1A1A' }}
                    data-testid="limitation-insurer"
                  >
                    <span style={{ fontWeight: 700 }}>The insurer.</span>{' '}
                    Payments depend on a single company's ability to pay for decades. This analysis
                    does not evaluate credit quality, claims history, or default risk. Research the
                    insurer's ratings (AM Best, Moody's, S&P) before any purchase.
                  </div>

                  <div
                    style={{ borderLeft: '3px solid #D4D4D4', padding: '20px', fontSize: '15px', lineHeight: '1.7', color: '#1A1A1A' }}
                    data-testid="limitation-tax"
                  >
                    <span style={{ fontWeight: 700 }}>Tax treatment.</span>{' '}
                    The tool does not incorporate tax efficiency, which varies by annuity type,
                    funding source, and individual circumstances. Annuity income is generally taxed
                    as ordinary income — net income after tax may be meaningfully lower than the
                    figure shown here. Consult a tax advisor.
                  </div>

                  <div
                    style={{ borderLeft: '3px solid #D4D4D4', padding: '20px', fontSize: '15px', lineHeight: '1.7', color: '#1A1A1A' }}
                    data-testid="limitation-inflation"
                  >
                    <span style={{ fontWeight: 700 }}>Inflation.</span>{' '}
                    Fixed annuity payouts do not adjust for inflation. A payout that covers your
                    spending today loses roughly half its purchasing power over 25 years at 3%
                    inflation. Some annuities offer inflation escalators, which reduce the starting
                    payout in exchange for growth.
                  </div>

                  <div
                    style={{ borderLeft: '3px solid #D4D4D4', padding: '20px', fontSize: '15px', lineHeight: '1.7', color: '#1A1A1A' }}
                    data-testid="limitation-life-expectancy"
                  >
                    <span style={{ fontWeight: 700 }}>Life expectancy.</span>{' '}
                    The longevity score uses the age you entered, not a projection from a mortality
                    table. If you underestimate how long you'll live, the score will understate the
                    value of guaranteed income. If you overestimate, it will overstate it.
                  </div>

                  <div
                    style={{ borderLeft: '3px solid #D4D4D4', padding: '20px', fontSize: '15px', lineHeight: '1.7', color: '#1A1A1A' }}
                    data-testid="limitation-sequence"
                  >
                    <span style={{ fontWeight: 700 }}>Sequence of returns.</span>{' '}
                    The tool does not run multi-decade simulations comparing an annuity path against
                    a portfolio withdrawal strategy under varying market conditions. That comparison
                    requires a full financial plan.
                  </div>

                  <div
                    style={{ borderLeft: '3px solid #D4D4D4', padding: '20px', fontSize: '15px', lineHeight: '1.7', color: '#1A1A1A' }}
                    data-testid="limitation-payout-rates"
                  >
                    <span style={{ fontWeight: 700 }}>Actual payout rates.</span>{' '}
                    The income estimates here use approximate market rates and will differ from any
                    real quote. Rates vary by insurer, state, and the exact date of purchase. Obtain
                    a firm quote before making any decision.
                  </div>

                </div>
              </div>
            </div>

            {/* Download Button */}
            <div className="flex justify-center pt-4">
              <Button onClick={downloadPDF} data-testid="button-download-pdf">
                Download Summary
              </Button>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 border-t border-border pt-8">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Gambit Capital Management, LLC is an Investment Adviser registered with the SEC. All
            views, expressions, and opinions included in this communication are subject to change.
            This communication is not intended as an offer or solicitation to buy, hold or sell any
            financial instrument or investment advisory services. Any information provided has been
            obtained from sources considered reliable, but we do not guarantee the accuracy or the
            completeness of any description of securities, markets or developments mentioned. We
            may, from time to time, have a position in the securities mentioned and may execute
            transactions that may not be consistent with this communication's conclusions. Please
            contact us at (651) 427-9001 if there is any change in your financial situation, needs,
            goals or objectives, or if you wish to initiate any restrictions on the management of
            the account or modify existing restrictions. Additionally, we recommend you compare any
            account reports from GCM with the account statements from your Custodian. Please notify
            us if you do not receive statements from your Custodian on at least a quarterly basis.
            Our current disclosure brochure, Form ADV Part 2, is available for your review upon
            request, and on our website,{' '}
            <a
              href="https://www.gambitcm.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              www.gambitcm.com
            </a>
            . This disclosure brochure, or a summary of material changes made, is also provided to
            our clients on an annual basis.
          </p>
        </footer>
      </main>
    </div>
  );
}

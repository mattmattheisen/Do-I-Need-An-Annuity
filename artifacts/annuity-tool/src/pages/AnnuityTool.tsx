import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface FormData {
  currentAge: string;
  expectedAge: string;
  guaranteedIncome: string;
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
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    currentAge: '',
    expectedAge: '90',
    guaranteedIncome: '',
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
    // Guaranteed income: required field; 0 is a legitimate value
    if (formData.guaranteedIncome === '') {
      newErrors.guaranteedIncome = 'Please enter your guaranteed annual income (enter 0 if none)';
    } else if (isNaN(Number(formData.guaranteedIncome)) || Number(formData.guaranteedIncome) < 0) {
      newErrors.guaranteedIncome = 'Please enter a valid amount (0 or greater)';
    }

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
    setStep((prev) => prev - 1);
  };

  const handleStartOver = () => {
    setStep(1);
    setFormData({
      currentAge: '',
      expectedAge: '90',
      guaranteedIncome: '',
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
    const guaranteedIncome = Number(formData.guaranteedIncome) || 0;
    const investableAssets = Number(formData.investableAssets) || 0;
    const spendingGoal = Number(formData.spendingGoal)  || 0;
    const sliderValue = formData.marketComfort;
    const heirsImportant = formData.heirsImportant;
    const healthcareConcern = formData.healthcareConcern;

    // Component 1: Longevity (0-25)
    const longevityScore = Math.min(25, Math.max(0, ((expectedAge - 80) / 20) * 25));

    // Component 2: Income Gap (0-25)
    // gap is reused throughout the cap chain below
    const gap = Math.max(0, spendingGoal - guaranteedIncome);
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
      const breakpoints: [number, number][] = [
        [60, 0.058],
        [65, 0.064],
        [70, 0.073],
        [75, 0.085],
        [80, 0.102],
      ];
      if (age <= 60) return 0.058;
      if (age >= 80) return 0.102;
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
    let flexibilityNeed = 25;
    if (heirsImportant) flexibilityNeed -= 10;
    if (healthcareConcern) flexibilityNeed -= 10;

    // Exogenous concentration check: apply –5 only if fully closing the income
    // gap (gap ÷ payoutRate gives the purchase amount needed) would place more
    // than 35% of investable assets in an annuity.
    //
    // The previous test checked (score × 0.5 > 0.35), which is circular — the
    // score depends on flexibility, flexibility depends on the penalty, and the
    // penalty depends on the score. That made pre-penalty scores 71–75
    // non-monotonic: score 70 → final 70, score 71 → final 66. The gap-closing
    // amount is computed entirely from inputs, not from the score being derived.
    const gapClosingAmount = gap > 0 && payoutRate > 0 ? gap / payoutRate : 0;
    const concentrationPenaltyFired =
      investableAssets > 0 && gapClosingAmount > 0.35 * investableAssets;
    if (concentrationPenaltyFired) {
      flexibilityNeed = Math.max(0, flexibilityNeed - 5);
    }

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
      concentrationPenaltyFired,
      gapTooSmallForContract,
      recommendedAmount: finalDollarAmount,
      recommendedPct: finalAllocPct,
      estimatedIncome: estimatedAnnualIncome,
      payoutRate,
      ceilingAmount: ceilingDollarAmount,
      gap,
      gapPct,
      remainingAssets: investableAssets - finalDollarAmount,
    };
  };

  const getSuitabilityBand = (score: number): string => {
    if (score <= 25) return 'An annuity is unlikely to be the right tool for your situation.';
    if (score <= 50) return 'An annuity may make sense for a small portion of your assets.';
    if (score <= 75) return 'An annuity is worth serious consideration as part of your income plan.';
    return 'An annuity aligns well with your priorities and goals.';
  };

  const downloadPDF = () => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = () => {
      // @ts-expect-error - jsPDF loaded from CDN
      const { jsPDF } = window.jspdf;
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
      doc.text(
        `Guaranteed income: ${formatCurrency(Number(formData.guaranteedIncome))}/year`,
        leftMargin,
        y
      );
      y += 6;
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
      y += 6;
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
        `50% regulatory ceiling: ${formatCurrency(results.ceilingAmount)}`,
        leftMargin,
        y
      );
      y += 12;

      // Footer
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
    document.head.appendChild(script);
  };

  const results = step === 3 ? calculateResults() : null;

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Gambit Capital Management
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Progress */}
        <div className="mb-8 text-center">
          <p className="text-sm font-medium text-muted-foreground">Step {step} of 3</p>
        </div>

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
                  Age you expect to live to
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
                  Most people underestimate this. The average 65-year-old lives to about 85; half
                  live longer.
                </p>
                {errors.expectedAge && (
                  <p className="mt-1 text-sm text-destructive">{errors.expectedAge}</p>
                )}
              </div>

              <div>
                <Label htmlFor="guaranteedIncome" className="text-base font-medium">
                  Annual income from Social Security and any pension ($/year)
                </Label>
                <div className="relative mt-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="guaranteedIncome"
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={formData.guaranteedIncome}
                    onChange={(e) => updateField('guaranteedIncome', e.target.value)}
                    className="pl-7"
                    data-testid="input-guaranteed-income"
                  />
                </div>
                {errors.guaranteedIncome && (
                  <p className="mt-1 text-sm text-destructive">{errors.guaranteedIncome}</p>
                )}
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
                    type="number"
                    min="0"
                    inputMode="decimal"
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
                    type="number"
                    min="1"
                    inputMode="decimal"
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
              <div className="mb-2 text-6xl font-bold text-primary" data-testid="text-suitability-score">
                {results.suitabilityScore}
              </div>
              <div className="text-lg font-medium text-muted-foreground">Suitability Score</div>
              <p className="mx-auto mt-4 max-w-2xl text-base text-foreground" data-testid="text-suitability-band">
                {getSuitabilityBand(results.suitabilityScore)}
              </p>
            </div>

            {/* Score Breakdown */}
            <div>
              <h2 className="mb-4 text-xl font-semibold text-foreground">Score Breakdown</h2>
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">Longevity</span>
                    <span className="text-sm font-semibold text-primary" data-testid="text-longevity-score">
                      {Math.round(results.longevityScore)}/25
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Based on your expected age of {formData.expectedAge}, you have a{' '}
                    {Number(formData.expectedAge) >= 95
                      ? 'long'
                      : Number(formData.expectedAge) >= 85
                        ? 'moderate'
                        : 'shorter'}{' '}
                    planning horizon.
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">Income Gap</span>
                    <span className="text-sm font-semibold text-primary" data-testid="text-income-gap-score">
                      {Math.round(results.incomeGapScore)}/25
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Your existing guaranteed income covers{' '}
                    {((1 - results.gapPct) * 100).toFixed(0)}% of your spending goal, leaving a{' '}
                    {(results.gapPct * 100).toFixed(0)}% gap to fill.
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">Flexibility Need</span>
                    <span className="text-sm font-semibold text-primary" data-testid="text-flexibility-score">
                      {Math.round(results.flexibilityNeed)}/25
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {formData.heirsImportant && formData.healthcareConcern
                      ? '–10 for heirs priority, –10 for healthcare concern'
                      : formData.heirsImportant
                        ? '–10 for heirs priority'
                        : formData.healthcareConcern
                          ? '–10 for healthcare concern'
                          : !results.concentrationPenaltyFired
                            ? 'No flexibility deductions applied'
                            : null}
                    {results.concentrationPenaltyFired &&
                      `${formData.heirsImportant || formData.healthcareConcern ? ', ' : ''}–5 for concentration risk (closing this gap would exceed 35% of assets)`}
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">Behavioral Fit</span>
                    <span className="text-sm font-semibold text-primary" data-testid="text-behavioral-score">
                      {Math.round(results.behavioralFitScore)}/25
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    You said: "{SCENARIO_OPTIONS[formData.marketComfort]?.label}."
                    {' '}
                    {formData.marketComfort <= 1
                      ? 'Investors who would reduce exposure in a downturn often benefit from guaranteed income that removes the decision entirely.'
                      : formData.marketComfort >= 3
                        ? 'Investors comfortable staying invested or buying in a downturn typically have less need for guaranteed income to manage volatility.'
                        : 'A hold-and-wait response suggests moderate tolerance — guaranteed income may reduce pressure to act during downturns.'}
                  </p>
                </div>
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
                <div className="flex justify-between">
                  <span className="text-foreground">50% regulatory ceiling:</span>
                  <span className="font-semibold text-foreground" data-testid="text-ceiling-amount">
                    {formatCurrency(results.ceilingAmount)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  The 50% ceiling is a regulatory maximum — not a target or recommendation.
                </p>
              </div>
            </div>

            {/* Trade-off Comparison */}
            <div>
              <h2 className="mb-4 text-xl font-semibold text-foreground">Trade-off Comparison</h2>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="border-r border-border p-4 text-left font-medium text-foreground">
                        What the annuity gives up
                      </th>
                      <th className="p-4 text-left font-medium text-foreground">
                        What stays flexible
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-card">
                    <tr className="border-t border-border">
                      <td className="border-r border-border p-4 text-sm text-foreground">
                        Liquidity on the annuitized portion
                      </td>
                      <td className="p-4 text-sm text-foreground">
                        Remaining {formatCurrency(results.remainingAssets)} in investable assets
                      </td>
                    </tr>
                    <tr className="border-t border-border">
                      <td className="border-r border-border p-4 text-sm text-foreground">
                        Market participation on that portion
                      </td>
                      <td className="p-4 text-sm text-foreground">Still invested and accessible</td>
                    </tr>
                    <tr className="border-t border-border">
                      <td className="border-r border-border p-4 text-sm text-foreground">
                        Assets left to heirs on that portion
                      </td>
                      <td className="p-4 text-sm text-foreground">
                        Available for heirs, healthcare, or other needs
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Considerations */}
            <div className="space-y-8" data-testid="section-considerations">

              {/* Subsection 1: What this means for you */}
              <div>
                <h2 className="mb-5 text-xl font-semibold text-foreground">What this means for you</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                  {/* Always shown: Permanent */}
                  <div
                    style={{
                      backgroundColor: '#F7F8F7',
                      borderLeft: '3px solid #059669',
                      padding: '20px',
                      fontSize: '15px',
                      lineHeight: '1.7',
                      color: '#1A1A1A',
                    }}
                    data-testid="consideration-permanent"
                  >
                    <span style={{ fontWeight: 700 }}>Permanent.</span>{' '}
                    This purchase cannot be reversed, reallocated, or partially withdrawn once made.
                  </div>

                  {/* Always shown: Inflation */}
                  {(() => {
                    const years = Number(formData.expectedAge) - Number(formData.currentAge);
                    const inflationAdjusted = years > 0
                      ? results.estimatedIncome / Math.pow(1.03, years)
                      : results.estimatedIncome;
                    return (
                      <div
                        style={{
                          backgroundColor: '#F7F8F7',
                          borderLeft: '3px solid #059669',
                          padding: '20px',
                          fontSize: '15px',
                          lineHeight: '1.7',
                          color: '#1A1A1A',
                        }}
                        data-testid="consideration-inflation"
                      >
                        <span style={{ fontWeight: 700 }}>Inflation.</span>{' '}
                        The {formatCurrency(results.estimatedIncome)} annual income shown here would buy
                        roughly {formatCurrency(inflationAdjusted)} of today's goods by age {formData.expectedAge}.
                      </div>
                    );
                  })()}

                  {/* Conditional: Heirs */}
                  {formData.heirsImportant && (
                    <div
                      style={{
                        backgroundColor: '#F7F8F7',
                        borderLeft: '3px solid #059669',
                        padding: '20px',
                        fontSize: '15px',
                        lineHeight: '1.7',
                        color: '#1A1A1A',
                      }}
                      data-testid="consideration-heirs"
                    >
                      <span style={{ fontWeight: 700 }}>Your heirs.</span>{' '}
                      You told us leaving money to heirs is important. The {formatCurrency(results.recommendedAmount)} in
                      this recommendation passes nothing to them unless you add a refund provision, and that
                      provision typically reduces income by 15–25%.
                    </div>
                  )}

                  {/* Conditional: Healthcare */}
                  {formData.healthcareConcern && (
                    <div
                      style={{
                        backgroundColor: '#F7F8F7',
                        borderLeft: '3px solid #059669',
                        padding: '20px',
                        fontSize: '15px',
                        lineHeight: '1.7',
                        color: '#1A1A1A',
                      }}
                      data-testid="consideration-healthcare"
                    >
                      <span style={{ fontWeight: 700 }}>Long-term care.</span>{' '}
                      You flagged healthcare costs as a concern. The {formatCurrency(results.recommendedAmount)} in
                      this recommendation could not be accessed for those costs at any point after purchase.
                    </div>
                  )}

                  {/* Conditional: Concentration > 35% */}
                  {results.recommendedPct > 0.35 && (
                    <div
                      style={{
                        backgroundColor: '#F7F8F7',
                        borderLeft: '3px solid #059669',
                        padding: '20px',
                        fontSize: '15px',
                        lineHeight: '1.7',
                        color: '#1A1A1A',
                      }}
                      data-testid="consideration-concentration"
                    >
                      <span style={{ fontWeight: 700 }}>Concentration.</span>{' '}
                      This recommendation commits more than a third of your investable assets to a single insurer.
                    </div>
                  )}
                </div>
              </div>

              {/* Subsection 2: What this tool doesn't account for */}
              <div>
                <h2 className="mb-5 text-xl font-semibold text-foreground">What this tool doesn't account for</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                  <div
                    style={{
                      borderLeft: '3px solid #D4D4D4',
                      padding: '20px',
                      fontSize: '15px',
                      lineHeight: '1.7',
                      color: '#1A1A1A',
                    }}
                    data-testid="limitation-insurer"
                  >
                    <span style={{ fontWeight: 700 }}>The insurer.</span>{' '}
                    Payments depend on a single company's ability to pay for decades.
                  </div>

                  <div
                    style={{
                      borderLeft: '3px solid #D4D4D4',
                      padding: '20px',
                      fontSize: '15px',
                      lineHeight: '1.7',
                      color: '#1A1A1A',
                    }}
                    data-testid="limitation-tax"
                  >
                    <span style={{ fontWeight: 700 }}>Tax treatment.</span>{' '}
                    Annuity income is taxed as ordinary income. Depending on your bracket, net income after tax
                    may be meaningfully lower than the figure shown here.
                  </div>

                  <div
                    style={{
                      borderLeft: '3px solid #D4D4D4',
                      padding: '20px',
                      fontSize: '15px',
                      lineHeight: '1.7',
                      color: '#1A1A1A',
                    }}
                    data-testid="limitation-payout-rates"
                  >
                    <span style={{ fontWeight: 700 }}>Actual payout rates.</span>{' '}
                    The income estimates here use approximate market rates and will differ from any real quote.
                    Rates vary by insurer, state, and the exact date of purchase.
                  </div>

                  <div
                    style={{
                      borderLeft: '3px solid #D4D4D4',
                      padding: '20px',
                      fontSize: '15px',
                      lineHeight: '1.7',
                      color: '#1A1A1A',
                    }}
                    data-testid="limitation-portfolio"
                  >
                    <span style={{ fontWeight: 700 }}>Your full picture.</span>{' '}
                    This tool does not know your complete financial situation — other assets, liabilities,
                    tax accounts, or existing annuities. A licensed advisor should review any decision before you act.
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
          <p className="text-center text-sm text-muted-foreground">
            Everything you enter stays on your device. Nothing is sent to us, saved, or tracked.
            Close this page and it's gone.
          </p>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            This is an educational tool only, not investment advice. Individual circumstances vary.
            Consult a licensed financial professional.
          </p>
        </footer>
      </main>
    </div>
  );
}

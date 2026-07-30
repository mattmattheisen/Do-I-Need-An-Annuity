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

    if (!formData.currentAge || isNaN(currentAge) || currentAge < 0 || currentAge > 120) {
      newErrors.currentAge = 'Please enter a valid current age';
    }
    if (!formData.expectedAge || isNaN(expectedAge) || expectedAge < 0 || expectedAge > 120) {
      newErrors.expectedAge = 'Please enter a valid expected age';
    }
    if (currentAge && expectedAge && expectedAge <= currentAge) {
      newErrors.expectedAge = 'Expected age must be greater than current age';
    }
    if (!formData.guaranteedIncome) {
      newErrors.guaranteedIncome = 'Please enter your guaranteed annual income';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.investableAssets) {
      newErrors.investableAssets = 'Please enter your total investable assets';
    }
    if (!formData.spendingGoal) {
      newErrors.spendingGoal = 'Please enter your annual spending goal';
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
    const currentAge = Number(formData.currentAge);
    const expectedAge = Number(formData.expectedAge);
    const guaranteedIncome = Number(formData.guaranteedIncome);
    const investableAssets = Number(formData.investableAssets);
    const spendingGoal = Number(formData.spendingGoal);
    const sliderValue = formData.marketComfort;
    const heirsImportant = formData.heirsImportant;
    const healthcareConcern = formData.healthcareConcern;

    // Component 1: Longevity (0-25)
    const longevityScore = Math.min(25, Math.max(0, ((expectedAge - 80) / 20) * 25));

    // Component 2: Income Gap (0-25)
    const gap = Math.max(0, spendingGoal - guaranteedIncome);
    const gapPct = spendingGoal > 0 ? gap / spendingGoal : 0;
    const incomeGapScore = Math.min(25, Math.max(0, (gapPct / 0.6) * 25));

    // Component 4: Behavioral Fit (0-25)
    const behavioralFitScore = (4 - sliderValue) * (25 / 4);

    // Component 3: Flexibility Need (0-25) - initially without the 35% check
    let flexibilityNeed = 25;
    if (heirsImportant) flexibilityNeed -= 10;
    if (healthcareConcern) flexibilityNeed -= 10;

    // Initial suitability score
    let suitabilityScore = Math.round(longevityScore + incomeGapScore + flexibilityNeed + behavioralFitScore);

    // Check if allocation exceeds 35%
    let allocPct = (suitabilityScore / 100) * 0.5;
    if (investableAssets > 0 && allocPct > 0.35) {
      flexibilityNeed = Math.max(0, flexibilityNeed - 5);
      suitabilityScore = Math.round(longevityScore + incomeGapScore + flexibilityNeed + behavioralFitScore);
      allocPct = (suitabilityScore / 100) * 0.5;
    }

    // Payout rate calculation
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
    let rawDollarAmount = allocPct * investableAssets;
    const rawAnnuityIncome = rawDollarAmount * payoutRate;

    // Cap so annuity income doesn't exceed income gap
    const incomeGapDollars = Math.max(0, spendingGoal - guaranteedIncome);
    let finalDollarAmount = rawDollarAmount;
    if (incomeGapDollars > 0 && rawAnnuityIncome > incomeGapDollars) {
      finalDollarAmount = incomeGapDollars / payoutRate;
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
        `Market scenario response: ${SCENARIO_OPTIONS[formData.marketComfort]?.label}`,
        leftMargin,
        y
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
            <button
              onClick={handleStartOver}
              className="text-sm text-muted-foreground hover:text-foreground"
              data-testid="button-start-over"
            >
              ← Start over
            </button>

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
                          : 'No flexibility deductions applied'}
                    {results.flexibilityNeed < 15 &&
                      (formData.heirsImportant || formData.healthcareConcern) &&
                      ', –5 for allocation exceeding 35%'}
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
                  This estimate uses an annuity payout rate of {(results.payoutRate * 100).toFixed(1)}%
                  for someone purchasing at age {formData.currentAge}.
                </p>
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

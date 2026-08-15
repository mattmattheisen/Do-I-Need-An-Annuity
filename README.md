# Do I Need An Annuity?

A client-facing annuity suitability tool. It asks a short set of questions about longevity expectations, guaranteed income, flexibility needs, and risk comfort, then produces a 0–100 suitability score and a capped purchase recommendation. Everything runs in the browser. Nothing entered in the tool is sent anywhere, saved, or tracked.

The tool is built by Matt Mattheisen (CFP, Gambit Capital Management) under the Shomer Analytics brand. Its stated purpose is education first: the goal is people making a more informed decision about annuities, with lead generation as a byproduct rather than the point.

---

## What it does

The tool scores four equally weighted components, 25 points each:

- **Longevity** — based on a self-reported expected age (not an actuarial table lookup)
- **Income Gap** — the share of spending goal not covered by guaranteed income (Social Security, pension, other guaranteed sources)
- **Flexibility Need** — reduced for heirs-priority and healthcare-liquidity concerns
- **Behavioral Fit** — derived from a market-downturn comfort question

The four scores sum to a 0–100 suitability score. Any recommended annuity purchase is capped at 50% of investable assets, described in the tool as a design discipline rather than a regulatory requirement.

---

## Project structure

```
artifacts/annuity-tool/       The React app (Vite + TypeScript)
  src/pages/AnnuityTool.tsx     Main flow: form steps, PDF export, results display
  src/lib/scoring.ts            Pure suitability-scoring engine (no React, no side effects)
  src/lib/scoring.test.ts       Archetype regression tests for the scoring engine
scripts/                      Workspace-level utility scripts
lib/                          Shared workspace packages
```

The scoring logic lives in its own module specifically so it can be tested without rendering the component. If you're changing a scoring formula, `scoring.ts` and `scoring.test.ts` are the files to touch.

---

## Development

This is a pnpm workspace.

```bash
pnpm install
pnpm --filter @workspace/annuity-tool run dev       # local dev server
pnpm --filter @workspace/annuity-tool run test      # run scoring tests
pnpm --filter @workspace/annuity-tool run typecheck
pnpm --filter @workspace/annuity-tool run build     # production build
```

From the repo root, `pnpm run build` runs a typecheck, then the test suite, then the build for every package. This is the pipeline a deploy should go through: a broken scoring test stops the build before a wrong recommendation reaches a client.

---

## Testing the scoring engine

`src/lib/scoring.test.ts` encodes three archetype profiles as regression tests:

- **Clear Yes** — long life expectancy, large income gap, no flexibility constraints, market-cautious. Should score 100.
- **Clear No** — short life expectancy, guaranteed income already covers spending, market-aggressive. Should score 25, with a $0 recommendation since there's no income gap for an annuity to fill.
- **Edge case** — both flexibility flags set (heirs priority and healthcare liquidity). Confirms the flexibility floor of 5/25 moves the total score a full band, per the weighting rationale documented in `scoring.ts`.

Any change to a scoring formula (longevity anchors, income gap threshold, flexibility weighting, behavioral fit curve) should be checked against these three cases before merging. If the change is intentional, update the expected values and add a code comment explaining why, following the pattern already in `scoring.ts`.

---

## Deployment

The app is a static site. Production build output goes to `artifacts/annuity-tool/dist/public`.

---

## Design principles worth knowing before changing anything

**The privacy claim is literal, not approximate.** The tool tells users nothing they enter is sent anywhere. That means no runtime network calls of any kind, including to AI agents, analytics, or CDNs. A Content Security Policy (`connect-src 'none'`) and a build-time network scanner enforce this. Any new dependency that phones home breaks the product's core promise.

**The longevity component is self-reported, not actuarial.** It runs a linear formula on a user-entered expected age. Copy throughout the tool (input field, results, limitations section, PDF output) says this plainly. Don't reintroduce language implying a mortality table is involved unless one is actually implemented.

**The 50% allocation cap is a design choice, not a regulation.** Describe it that way in any new copy.

**Compliance registration is tied to the advisor, not the brand.** Shomer Analytics must be registered with Matt's compliance contact regardless of what name appears on the tool.

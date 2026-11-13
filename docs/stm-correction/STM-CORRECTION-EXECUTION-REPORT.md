# STM correction: execution report

Date: 2026-11-09. Scope: the strut-and-tie tool (Design → Substructures → Strut-and-Tie Model) and
the six-girder hammerhead cap model reviewed in the five comments (crowded column region, shallow
struts, top-tie anchorage, the three column supports, envelope display). Desktop copy only; nothing
committed, pushed or published. The saved designs in the local database were read, not changed.

## 1. The model

The six-girder hammerhead arrangement is the saved design **"Strut-and-Tie Model 1"**
(`6f71455b-d8a2-401e-bc54-474c2af8c415`, last saved 2026-11-10 02:43 UTC). Its companion,
**"Strut-and-Tie Model 1 (turning left)"** (`507d6f24-…`), carries the cases that turn the column
the other way. Snapshots, read-only, are in `docs/stm-correction/models/*.original.json`.

Exact match established:
- Geometry: hammerhead template, 43 ft cap, 7 ft deep at the column and 4 ft at the ends, 6 ft
  column at x = 20 ft, 72 in cap width; nodes T1–T8, M1–M4, C1, C2, S1–S3 as in the plots.
- Loads: girder link to "LRFD Bridge Design Check 1" (6 girders at 8 ft, 120 ft span), bridge
  centerline at cap x = 21.5 ft. Recomputed reactions G1 = G6 = 321.4 kip and G2–G5 = 332.0 kip
  (DC 110.8 or 115.3, DW 11.0, LL+IM 95.0 or 97.9 kip), the values on the reviewed sketch.
- Topology: 28 members as listed in the snapshot; 7 Strength I cases in this model (cases turning
  the column toward the right), 4 more in the companion. 11 cases in all, each in exactly one model.

## 2. Audit against the priorities

| Priority | Before | After |
|---|---|---|
| Individual-case force plots, equilibrium verification | Envelope plot only; equilibrium checked only inside the solver | Plot of any one case (forces, loads, reactions, its equilibrium); each case's nodal residual, ΣFx, ΣFy and ΣM checked apart from the solver |
| Nonsimultaneous envelope, clearly labeled | Labeled "largest over the load cases" | Titled and explained as nonsimultaneous ("not one equilibrium state") in the plot, editor and calc package |
| Governing case IDs; separate T and C envelopes | One number per member (the larger) | Largest tension and largest compression per member, each with its case |
| Support restraints and reactions | Not reported | Each support's restrained direction and its reaction in every case |
| Case-by-case angle checks | Checked over all cases, reported once | Smallest strut-tie angle and pass/fail for each case |
| Crossing, stability, finite geometry status | Warnings only; finite geometry silent | Model status card: equilibrium, angles, crossings, mechanisms, and "finite geometry: not evaluated" |
| Missing-input status for physical checks | Banner "All 24 checks pass"; missing checks listed only as warnings | Check coverage list: every tie, anchorage end, node face, strut and the geometry items, each pass / fail / missing input / not checked / not evaluated; banner adds "N items not checked"; calc package section "Checks not completed" |
| Traceable reinforcement, anchorage, strut, node results | Checks table | Each coverage line gives the value, capacity, governing case and AASHTO article, or exactly what's missing |
| Column boundary alternatives | None | Option: reactions from statics (default, unchanged) or held near the column's linear stress |

## 3. Changes

Software defects corrected now (no change to how forces are found for a saved model):
- `src/lib/design/stm/strut-tie.ts`: per-case results with an independent equilibrium check;
  governing cases for tension and compression; support report; per-case angles; check coverage;
  model status; optional column boundary.
- `src/lib/design/stm/optimizer.ts`: optional target reactions, solved in two stages (least total
  departure from the targets, then least volume with that departure held); departure reported.
- `src/components/design/stm-sketch.tsx`: one-case view (forces, its loads, reactions,
  equilibrium in the title) and a labeled nonsimultaneous envelope view (T and C with their cases).
- `src/components/design/stm-status.tsx` (new): model status, per-case equilibrium and angle
  table, supports and reactions, check coverage.
- `src/components/design/stm-editor.tsx`: case selector for the plot and the forces table;
  governing-case columns; the status cards; "Column boundary" choice for template hammerheads;
  banner counts unchecked items.
- `src/lib/design/stm/strut-tie-calc.ts`: governing cases, per-case equilibrium, supports, and a
  "Checks not completed" section listing every unchecked item.
- Tests: `src/lib/design/stm/case-results.test.ts` (9 new tests); report generator
  `src/lib/design/stm/stm-correction-report.test.ts` (runs only when pointed at a snapshot).

Model files: the saved designs are unchanged. The alternatives below were run on copies.

## 4. Column supports (comment 4) and other alternatives

The three supports idealize the column where the disturbed region ends, one column width below the
cap: S1 and S2 under the two compression struts, S3 under the tie at the left face's bars (FHWA
Design Example 2's model). They restrain vertical movement only, plus S1 horizontally; the loads
are vertical, so S1's horizontal reaction is zero in every case. Statics leaves one vertical
reaction free; the solver picks it. Physical basis for an alternative: FHWA places the column
members from the column's linear stress at that boundary, so variant B holds the reactions as near
as statics allows to that stress lumped over each support's tributary width.

Variants (both designs, all cases re-run): A as saved; B linear-stress boundary; C self-weight
above the cap's soffit only; D = B + C. Results: `docs/stm-correction/model-1/results.json` and
`…/model-1-turning-left/results.json`.

Model 1 (7 cases):

| | A | B | C | D |
|---|---|---|---|---|
| Failing checks | none | none | none | none |
| Largest nodal residual, kip | 2.7e-13 | 4.6e-12 | 4.6e-13 | 4.6e-12 |
| Top tie T3–T4, kip (case) | 1869 (5) | 1869 (5) | 1863 (5) | 1863 (5) |
| Column strut C1–S1, kip | 1719 (5) | 1719 (5) | 1711 (5) | 1711 (5) |
| Column strut C2–S2 = node C2 demand, kip | 1042 (capacity 1784) | 1042 | 1029 | 1029 |
| Column tie M1–S3: T / C, kip | 1103 / 848 | 1103 / 721 | 1117 / 829 | 1117 / 707 |
| X strut T4–C1, kip | 36 | 445 | 36 | 429 |
| S1 reaction, case 1 / case 6, kip | 425 / 170 | 744 / 627 | 417 / 161 | 727 / 601 |
| Departure from linear stress, kip (all cases) | — | 2930 | — | 2998 |
| Cap self-weight, kip | 253.5 | 253.5 | 221.0 | 221.0 |

Model 1, turning left (4 cases): no failing check in any variant; node C1 demand 939 / 713 kip
(A / B, capacity 1975), node C2 demand 541 / 886 kip (capacity 8079); departure 662 kip in B.

Sensitivity: the governing (envelope) demands in model 1 don't change with the boundary, since
the governing case's reactions are fixed by statics; individual cases redistribute by up to about
400 kip at a support. In the left model the boundary moves the governing column-node demands
(C2: 541 → 886 kip). In the governing cases the model can't reach the lumped linear stress (about
300 kip off at each strut support in model 1, case 5): the struts are at the stress diagram's part
centroids, not at tributary midpoints. The supports were not changed: the saved model keeps the
"solver" boundary; which assumption governs design is the engineer's decision (Section 6).

Self-weight (variant C): the saved girder link counts concrete above y = −10 ft, below the column
stub's bottom (−6 ft), so 32.5 kip of column concrete is applied at the cap's bearing nodes. This is
an input inconsistency (an older default). Correcting it changes forces by under 2%; the saved model
was not changed.

## 5. Topology

No check fails in any variant, no crossing exists, and every case is in equilibrium, so the
topology was not revised and no member was removed. Every case's smallest strut-tie angle is 25.2°,
0.2° above the 25° limit of AASHTO 5.8.2.2: compliant but marginal.

## 6. Status of each item

Software defects corrected now: everything in Section 3.

Model changes supported by the available inputs (not applied to the saved designs):
- Self-weight soffit: set the girder link's soffit to the cap's soffit (0 ft), variant C.

Engineering decisions and inputs blocked by missing project information:
- Column boundary assumption (A "solver" or B "linear stress"), and whether the governing design
  takes the larger of the two; it matters for the left model's node demands.
- Values in the model that are the tool's template defaults, not project data, and need
  confirmation: cap width 72 in; depth 7 ft and 4 ft at the ends; column width 6 ft (in plane) and
  its out-of-plane size (nodes over the column take the cap width, 72 in); top-bar centroid 6 in
  and bottom chord 8 in; column bars 8 in from the face; bearing pads 24 × 30 in; top bars 26 #11;
  stirrups #5, 4 legs at 6 in; crack-control grid; fy 60 ksi.
- Anchorage (comment 3): the top bars at T1 and T6, the stirrup ties, the column tie into the
  column, tie T3–M1 at M1: needs the bars' end details (straight or hooked, available length from
  the extended nodal zone, cover, spacing). 19 items are "missing input" in model 1 (19 in the left).
- Strut-to-node face widths at the column nodes and bearing nodes (comment 1): the faces where
  struts enter C1, C2, M1 and the bearing nodes aren't checked without them.
- Diagonal-cracking screen: the service shear, shear span and depth aren't given.

Not evaluated by the software (comments 1 and 2): finite nodal zones (extent, overlap, fit), strut
widths and their fit within the outline (including the sloped soffit), and reinforcement fit and
congestion. They are listed as "not evaluated" (20 items in each model), never as passing.

## 7. Commands run and results

| Command | Result |
|---|---|
| `node scratchpad/read-designs.mjs` (read-only query, no secrets printed) | 3 designs read |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint src` | exit 0, no warnings |
| `npx vitest run` | 86 files passed, 1 skipped (the report generator); 1,216 tests passed |
| `STM_SNAPSHOT=… STM_REPORT_DIR=docs/stm-correction/model-1 npx vitest run stm-correction-report` | 4 variants, every case in equilibrium; plots and `results.json` written |
| same for `model-1-turning-left` | as above |
| `ALLCON_LOCAL=1 npx next build`; relaunch | build exit 0; app up. Opened "Strut-and-Tie Model 1" (view only, not saved): case selector, case 5 plot (residual 2.7e-13 kip, 25.2°), model status, supports and coverage cards match the numbers above |

## 8. Plots

`docs/stm-correction/model-1/plots/`: `A-case-01.svg` … `A-case-07.svg` (each case on its own),
`A-envelope.svg` (nonsimultaneous envelope), the same for B, and `C-envelope.svg`, `D-envelope.svg`.
The same set for the left model in `docs/stm-correction/model-1-turning-left/plots/`. In the app the
plot's "Show" selector gives the envelope or any one case.

## 9. Remaining failures and open items

- Failing checks: none in either model, in any variant.
- Not completed (not passes): model 1 has 19 missing-input, 6 not-checked and 20 not-evaluated items;
  the left model 19, 7 and 20. The editor's Check coverage card and the calc package list each one.
- Code compliance is not claimed: equilibrium and the implemented checks pass, but the finite
  geometry, anchorage and node-interface checks above remain open.

## 10. Follow-up, same day: geometry, anchorage, load cases, benchmark

Approved by the owner as items 1–4. For models built from a standard cap the open items in Section 6
are now worked out from the cap's dimensions (details in `docs/strut-and-tie-model.md`):

1. **Nodal geometry and node faces** (`src/lib/design/stm/nodal-zones.ts`): zones at bearings,
   column nodes and the tie-line node; every strut's interface lb sin θ + ha cos θ, case by case;
   m at bearings from Article 5.6.5; struts' fit within the concrete; zones within the concrete and
   clear of each other; smeared and curved-bar nodes exempt with the reason (C5.8.2.2).
2. **Anchorage** where chord bars stop, from the extended nodal zone's critical section to the
   bar's end; the bars' fit across the section (5.10.3.1).
3. **Load cases**: Strength IV added; Service I shear on each arm feeds the diagonal-cracking
   screen.
4. **Benchmark**: FHWA Design Example 1 (deep beam) through the bent-cap template
   (`fhwa-deep-beam.test.ts`); forces, node faces, the back-face shortfall and the anchorage's
   available length match the example.

Results on the saved designs (unchanged; run on copies):

| | Model 1 (8 cases now) | Model 1, turning left (4) |
|---|---|---|
| Failing checks | 2: the top bars' hooks at T1 and T6 | the same 2 |
| Hook needed / available | 44.8 / 36.7 in (T1), 44.8 / 37.1 in (T6) | the same |
| Node faces | all pass (worst: C2's T4–C2 interface 417 / 607 kip) | all pass |
| Struts within the concrete | 17 of 17 | all |
| Nodal zones | within the concrete, no overlaps | the same |
| Top bars' fit | 26 #11 in 2 layers of 13, 4.0 in clear, centroid 4.7 in (model 6 in) | the same |
| Diagonal cracking (Service I) | left arm 490 / 753 kip, right arm 712 / 753 kip | from the girders |
| Items needing input | none | none |

New engineering finding: the outer girders sit 1.5 ft from the cap's ends, so the top bars can't
develop their yield at T1 and T6 with standard hooks (10th Edition unified length, λer = 1). The
options are the engineer's: a longer cap end, headed bars, smaller bars in more layers (a shorter
development length), or crediting excess steel (λer), which this design basis doesn't.

## 11. Second follow-up: corner bend, anchorage fixes, bent spans, wind

- **Column bars into the cap (a correction).** Section 10 listed the column bars' top end at T3 as
  stirrups needing no check. Wrong: model 1's cap continues past the column, so the column bars (the
  tie T3–M1, 1,444 kip in case 5) must develop up into the cap. They need 36.1 in and have 27.3 in:
  a third failing check. At a true corner (column face at the cap's end) the bars bend into the top
  bars instead: a curved-bar node with the least bend of Table 5.10.2.3-1, no stress check.
- **Fix options** on every short anchorage: headed bars (fail 5.10.8.2.7's 3 db head spacing at
  model 1's 4.0 in clear), smaller bars of the same area (68 #7 for the column bars would develop in
  27.3 in), or the extra length.
- **Bent spans:** Service I shear at each column face from simple-span statics between centerlines.
- **Wind** (Strength III and V, both ways, in the cap's plane): optional, needing the site's speed;
  model 1 lists it as needing input. On a cap like model 1 at 115 mph, exposure C, it governs no
  member. Hammerhead templates now restrain the column horizontally where it meets the cap (gravity
  results unchanged). Braking is out of the cap's plane and outside this model. The wind provisions
  were coded from the cited 10th Edition articles without the specification at hand: verify them.
- Validation: tsc 0, eslint 0, vitest 1,231 passed and 1 skipped; ALLCON rebuilt; model 1 shows
  "3 of 54 checks fail" and "1 item needs input" (the wind).

## 12. Third follow-up: verified against the 10th Edition; wind and braking to the girder tool; continuity; inverted-T and abutment caps

- **Verified against the 10th Edition text in ALLCON's library** (the articles are listed in
  `docs/strut-and-tie-model.md`). Corrections found and made: Strength V and Service I wind take
  Kz = 1.0 and there is no 0.30 klf minimum; Service I includes wind (70 mph) and WL; a CCC node's
  back face is the flexural compression block, augmentable by compression bars in it (5.8.2.5.1);
  curved-bar nodes aren't in the specification (C5.8.2.2), so a corner node stays open for review;
  headed bars' 3 db is center-to-center; #6–#8 stirrups need the 5.10.8.2.6b embedment.
- **Wind and braking moved to the girder design check** ("Loads to the substructure"), where the
  superstructure's depth, spans and lanes are; the cap's link reads them.
- **Continuous girders:** reactions at an interior pier from the girder check's continuous beam.
- **Inverted-T** (ledges checked by 5.8.4.3 at every bearing) and **abutment-on-piles** templates.
- **Model 1:** 3 of 54 checks fail, all anchorage (as in Section 11); the column nodes' back faces,
  which failed on the corrected 8.8 in compression block, pass with the bottom bars' credit (8 #9, a
  template default to confirm). Wind needs the site's speed in the girder design.
- **Anchorage options** on a copy: `docs/stm-correction/anchorage-options.md`. 68 #7 (the same area
  as 26 #11) clears all three; longer ends alone don't.
- Validation: tsc 0, eslint 0, vitest 1,242 passed and 1 skipped; ALLCON rebuilt; model 1 and the
  girder design checked in the app (view only).

Benchmark difference by edition: the example's hook needs 20 in (8th Edition, λer = 0.92); the
10th Edition at full yield needs 25.9 in against 25.4 in available, so the tool reports it 0.5 in
short. Validation: `npx tsc --noEmit` 0, `npx eslint src` 0, `npx vitest run` 1,225 passed and 1
skipped; ALLCON rebuilt and model 1 opened in it (view only).

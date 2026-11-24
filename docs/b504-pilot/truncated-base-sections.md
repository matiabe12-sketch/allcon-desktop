# Truncated-base typical sections (¾:1 soil and ½:1 rock): pilot content (draft 2026-11-24)

Sheet-ready content for two new sheets with the same layout as the core-wall sheet (`core-wall-section.md`). Each
replaces nine current sheets:

|  | Rail anchor slab | Roadway guardrail | Backslope |
|---|---|---|---|
| **¾:1 soil cut** (proposed B-504-B2) | A2 (block), D2 (panel), L2 (GRS) | B2, E2, M2 | C2, F2, N2 |
| **½:1 rock cut** (proposed B-504-B3) | A4 (block), D4 (panel), L4 (GRS) | B3, E3, M3 | C3, F3, N3 |

The micropile A-frame sheets (A3, A5, D3, D5, L3, L5) are the fourth base type (proposed B-504-B4), not included
here.

**What's shared with the core-wall sheet:**
- the drawing conventions, the top-of-wall and facing insets (A–C and block, panel, GRS);
- both option tables;
- Notes 1, 3–8.

**What's below:** only what differs for a truncated base, the two quantity tables and the fixes. `[Decide]` and
`[Verify]` as before.

---

## 1. The drawing: what differs from the core wall

- **Reinforced zone (a trapezoid):**
  - bottom length RL(min) = the larger of 0.45 DH and 4'-0";
  - each layer longer by the cut's slope above it, up to RL(max) at the top: 0.75 DH (soil) or 0.50 DH (rock) longer
    than the bottom;
  - dimension the bottom, the top and the "0.375 DH" (soil) or "0.25 DH" (rock) half-height offset that the current
    sheets show;
  - the top two layers at 2.0 × RL(max).
- **Excavation:**
  - **soil:** a ¾:1 cut from the back of the bottom layer, with the existing slope;
  - **rock:** a ½:1 cut, labeled "Existing rock slope";
  - the toe cover template has 1'-6" minimum toe cover, per B-504-Q4 (soil) or Q3 (rock).
- **Geomembrane** over the reinforced zone, to the slope break point.
  - `[Verify]`: A2 labels a slope of "20 (Max) : 1" and "10 (Min) : 1" here, where B2 and the core sheets label
    "10% (Max)" and "5% (Min)". These may be the same limits written two ways (5% = 20:1, 10% = 10:1), but the max/min
    labels are reversed between them.
- **No change from the core wall:** leveling pad, bench, drains, surcharge, clear-zone barrier and insets.

## 2. Notes: replace or add to the core-wall sheet's notes

**Note 2 (bearing), replacing the core wall's.** The factored bearing pressure BP on the design table sheet is
computed with the average reinforcement length: 0.825 DH (soil) or 0.70 DH (rock), but at least the values for the
4 ft bottom length. The foundation's factored bearing resistance shall meet or exceed BP.

**Note 9 (new): global stability.**
- The overall and compound stability of a truncated-base wall shall be evaluated by the geotechnical engineer (design
  basis Note 10; AASHTO 11.6.3.7).
- The bottom length of 0.45 DH or 4 ft (design basis Note 9) is a minimum, valid only where that evaluation passes.

**Note 10 (new): the cut.**
- The ¾:1 soil (or ½:1 rock) cut is part of the wall design. If the cut can't be made at this slope (unstable soil,
  or rock that isn't competent), contact the Engineer.
- Shoring per B-504-S1 or the A-frame section may be needed instead.
- Rock: the cut face shall be competent rock as the geotechnical report defines it.

**Note 11 (new): excavation template.**
- Structure excavation EM1 follows B-504-Q4 (soil) or Q3 (rock).
- These apply when the excavation height at the layout line H ≥ 1.5 + 4 tan θ. Otherwise use the A-frame/low-H
  templates (Q5, Q6).

## 3. Option tables

These are the same as the core wall, with these differences:
- the design table references (current: H1–H4 / O1–O4, with the BP columns based on the average length);
- for a backslope, the top-two-layer rule is the one decided for the core wall (decision S2): "2 × RL(max) for a
  roadway", "RL = PLG for a 2:1 infinite slope".

---

## 4. Table: ¾:1 soil cut, quantities per foot of wall (B-504-Q4)

**Formulas:**
- RL(min) = max(0.45 DH, 4 ft);
- RL(avg) = RL(min) + 0.375 DH;
- RL(max) = RL(min) + 0.75 DH;
- MRS = DH × RL(avg) / 27;
- BM1 = (3.375 + RL(avg) × DH) / 27;
- PLG = RL(max).

**Checked:** these reproduce the printed tables on A2, B2, C2, D2, E2, F2, L2, M2 and N2 for all 58 rows, to within
rounding (0.0011). The sheets' notes say "0.83 DH"; the tables use 0.825 DH, as these formulas do.

| DH | RL bottom (ft) | RL average (ft) | RL top (ft) | MRS (CY/LF) | BM1 (CY/LF) | PLG (ft/LF) |
|---|---|---|---|---|---|---|
| 40'-0" | 18.000 | 33.000 | 48.000 | 48.889 | 49.014 | 48.000 |
| 39'-4" | 17.700 | 32.450 | 47.200 | 47.273 | 47.398 | 47.200 |
| 38'-8" | 17.400 | 31.900 | 46.400 | 45.684 | 45.809 | 46.400 |
| 38'-0" | 17.100 | 31.350 | 45.600 | 44.122 | 44.247 | 45.600 |
| 37'-4" | 16.800 | 30.800 | 44.800 | 42.588 | 42.713 | 44.800 |
| 36'-8" | 16.500 | 30.250 | 44.000 | 41.080 | 41.205 | 44.000 |
| 36'-0" | 16.200 | 29.700 | 43.200 | 39.600 | 39.725 | 43.200 |
| 35'-4" | 15.900 | 29.150 | 42.400 | 38.147 | 38.272 | 42.400 |
| 34'-8" | 15.600 | 28.600 | 41.600 | 36.721 | 36.846 | 41.600 |
| 34'-0" | 15.300 | 28.050 | 40.800 | 35.322 | 35.447 | 40.800 |
| 33'-4" | 15.000 | 27.500 | 40.000 | 33.951 | 34.076 | 40.000 |
| 32'-8" | 14.700 | 26.950 | 39.200 | 32.606 | 32.731 | 39.200 |
| 32'-0" | 14.400 | 26.400 | 38.400 | 31.289 | 31.414 | 38.400 |
| 31'-4" | 14.100 | 25.850 | 37.600 | 29.999 | 30.124 | 37.600 |
| 30'-8" | 13.800 | 25.300 | 36.800 | 28.736 | 28.861 | 36.800 |
| 30'-0" | 13.500 | 24.750 | 36.000 | 27.500 | 27.625 | 36.000 |
| 29'-4" | 13.200 | 24.200 | 35.200 | 26.291 | 26.416 | 35.200 |
| 28'-8" | 12.900 | 23.650 | 34.400 | 25.110 | 25.235 | 34.400 |
| 28'-0" | 12.600 | 23.100 | 33.600 | 23.956 | 24.081 | 33.600 |
| 27'-4" | 12.300 | 22.550 | 32.800 | 22.828 | 22.953 | 32.800 |
| 26'-8" | 12.000 | 22.000 | 32.000 | 21.728 | 21.853 | 32.000 |
| 26'-0" | 11.700 | 21.450 | 31.200 | 20.656 | 20.781 | 31.200 |
| 25'-4" | 11.400 | 20.900 | 30.400 | 19.610 | 19.735 | 30.400 |
| 24'-8" | 11.100 | 20.350 | 29.600 | 18.591 | 18.716 | 29.600 |
| 24'-0" | 10.800 | 19.800 | 28.800 | 17.600 | 17.725 | 28.800 |
| 23'-4" | 10.500 | 19.250 | 28.000 | 16.636 | 16.761 | 28.000 |
| 22'-8" | 10.200 | 18.700 | 27.200 | 15.699 | 15.824 | 27.200 |
| 22'-0" | 9.900 | 18.150 | 26.400 | 14.789 | 14.914 | 26.400 |
| 21'-4" | 9.600 | 17.600 | 25.600 | 13.906 | 14.031 | 25.600 |
| 20'-8" | 9.300 | 17.050 | 24.800 | 13.051 | 13.176 | 24.800 |
| 20'-0" | 9.000 | 16.500 | 24.000 | 12.222 | 12.347 | 24.000 |
| 19'-4" | 8.700 | 15.950 | 23.200 | 11.421 | 11.546 | 23.200 |
| 18'-8" | 8.400 | 15.400 | 22.400 | 10.647 | 10.772 | 22.400 |
| 18'-0" | 8.100 | 14.850 | 21.600 | 9.900 | 10.025 | 21.600 |
| 17'-4" | 7.800 | 14.300 | 20.800 | 9.180 | 9.305 | 20.800 |
| 16'-8" | 7.500 | 13.750 | 20.000 | 8.488 | 8.613 | 20.000 |
| 16'-0" | 7.200 | 13.200 | 19.200 | 7.822 | 7.947 | 19.200 |
| 15'-4" | 6.900 | 12.650 | 18.400 | 7.184 | 7.309 | 18.400 |
| 14'-8" | 6.600 | 12.100 | 17.600 | 6.573 | 6.698 | 17.600 |
| 14'-0" | 6.300 | 11.550 | 16.800 | 5.989 | 6.114 | 16.800 |
| 13'-4" | 6.000 | 11.000 | 16.000 | 5.432 | 5.557 | 16.000 |
| 12'-8" | 5.700 | 10.450 | 15.200 | 4.902 | 5.027 | 15.200 |
| 12'-0" | 5.400 | 9.900 | 14.400 | 4.400 | 4.525 | 14.400 |
| 11'-4" | 5.100 | 9.350 | 13.600 | 3.925 | 4.050 | 13.600 |
| 10'-8" | 4.800 | 8.800 | 12.800 | 3.477 | 3.602 | 12.800 |
| 10'-0" | 4.500 | 8.250 | 12.000 | 3.056 | 3.181 | 12.000 |
| 9'-4" | 4.200 | 7.700 | 11.200 | 2.662 | 2.787 | 11.200 |
| 8'-8" | 4.000 | 7.250 | 10.500 | 2.327 | 2.452 | 10.500 |
| 8'-0" | 4.000 | 7.000 | 10.000 | 2.074 | 2.199 | 10.000 |
| 7'-4" | 4.000 | 6.750 | 9.500 | 1.833 | 1.958 | 9.500 |
| 6'-8" | 4.000 | 6.500 | 9.000 | 1.605 | 1.730 | 9.000 |
| 6'-0" | 4.000 | 6.250 | 8.500 | 1.389 | 1.514 | 8.500 |
| 5'-4" | 4.000 | 6.000 | 8.000 | 1.185 | 1.310 | 8.000 |
| 4'-8" | 4.000 | 5.750 | 7.500 | 0.994 | 1.119 | 7.500 |
| 4'-0" | 4.000 | 5.500 | 7.000 | 0.815 | 0.940 | 7.000 |
| 3'-4" | 4.000 | 5.250 | 6.500 | 0.648 | 0.773 | 6.500 |
| 2'-8" | 4.000 | 5.000 | 6.000 | 0.494 | 0.619 | 6.000 |
| 2'-0" | 4.000 | 4.750 | 5.500 | 0.352 | 0.477 | 5.500 |

## 5. Table: ½:1 rock cut, quantities per foot of wall (B-504-Q3)

**Formulas:**
- RL(min) = max(0.45 DH, 4 ft);
- RL(avg) = RL(min) + 0.25 DH;
- RL(max) = RL(min) + 0.50 DH;
- MRS, BM1 and PLG as for the soil cut.

**Checked:**
- These reproduce A4, B3, C3, D4 and E3 for all 58 rows (to 0.0010).
- They also reproduce F3, L4, M3 and N3 in every column but RL(min) (see fix T1).

| DH | RL bottom (ft) | RL average (ft) | RL top (ft) | MRS (CY/LF) | BM1 (CY/LF) | PLG (ft/LF) |
|---|---|---|---|---|---|---|
| 40'-0" | 18.000 | 28.000 | 38.000 | 41.481 | 41.606 | 38.000 |
| 39'-4" | 17.700 | 27.533 | 37.367 | 40.110 | 40.235 | 37.367 |
| 38'-8" | 17.400 | 27.067 | 36.733 | 38.762 | 38.887 | 36.733 |
| 38'-0" | 17.100 | 26.600 | 36.100 | 37.437 | 37.562 | 36.100 |
| 37'-4" | 16.800 | 26.133 | 35.467 | 36.135 | 36.260 | 35.467 |
| 36'-8" | 16.500 | 25.667 | 34.833 | 34.856 | 34.981 | 34.833 |
| 36'-0" | 16.200 | 25.200 | 34.200 | 33.600 | 33.725 | 34.200 |
| 35'-4" | 15.900 | 24.733 | 33.567 | 32.367 | 32.492 | 33.567 |
| 34'-8" | 15.600 | 24.267 | 32.933 | 31.157 | 31.282 | 32.933 |
| 34'-0" | 15.300 | 23.800 | 32.300 | 29.970 | 30.095 | 32.300 |
| 33'-4" | 15.000 | 23.333 | 31.667 | 28.807 | 28.932 | 31.667 |
| 32'-8" | 14.700 | 22.867 | 31.033 | 27.666 | 27.791 | 31.033 |
| 32'-0" | 14.400 | 22.400 | 30.400 | 26.548 | 26.673 | 30.400 |
| 31'-4" | 14.100 | 21.933 | 29.767 | 25.453 | 25.578 | 29.767 |
| 30'-8" | 13.800 | 21.467 | 29.133 | 24.382 | 24.507 | 29.133 |
| 30'-0" | 13.500 | 21.000 | 28.500 | 23.333 | 23.458 | 28.500 |
| 29'-4" | 13.200 | 20.533 | 27.867 | 22.308 | 22.433 | 27.867 |
| 28'-8" | 12.900 | 20.067 | 27.233 | 21.305 | 21.430 | 27.233 |
| 28'-0" | 12.600 | 19.600 | 26.600 | 20.326 | 20.451 | 26.600 |
| 27'-4" | 12.300 | 19.133 | 25.967 | 19.370 | 19.495 | 25.967 |
| 26'-8" | 12.000 | 18.667 | 25.333 | 18.436 | 18.561 | 25.333 |
| 26'-0" | 11.700 | 18.200 | 24.700 | 17.526 | 17.651 | 24.700 |
| 25'-4" | 11.400 | 17.733 | 24.067 | 16.639 | 16.764 | 24.067 |
| 24'-8" | 11.100 | 17.267 | 23.433 | 15.774 | 15.899 | 23.433 |
| 24'-0" | 10.800 | 16.800 | 22.800 | 14.933 | 15.058 | 22.800 |
| 23'-4" | 10.500 | 16.333 | 22.167 | 14.115 | 14.240 | 22.167 |
| 22'-8" | 10.200 | 15.867 | 21.533 | 13.320 | 13.445 | 21.533 |
| 22'-0" | 9.900 | 15.400 | 20.900 | 12.548 | 12.673 | 20.900 |
| 21'-4" | 9.600 | 14.933 | 20.267 | 11.799 | 11.924 | 20.267 |
| 20'-8" | 9.300 | 14.467 | 19.633 | 11.073 | 11.198 | 19.633 |
| 20'-0" | 9.000 | 14.000 | 19.000 | 10.370 | 10.495 | 19.000 |
| 19'-4" | 8.700 | 13.533 | 18.367 | 9.691 | 9.816 | 18.367 |
| 18'-8" | 8.400 | 13.067 | 17.733 | 9.034 | 9.159 | 17.733 |
| 18'-0" | 8.100 | 12.600 | 17.100 | 8.400 | 8.525 | 17.100 |
| 17'-4" | 7.800 | 12.133 | 16.467 | 7.789 | 7.914 | 16.467 |
| 16'-8" | 7.500 | 11.667 | 15.833 | 7.202 | 7.327 | 15.833 |
| 16'-0" | 7.200 | 11.200 | 15.200 | 6.637 | 6.762 | 15.200 |
| 15'-4" | 6.900 | 10.733 | 14.567 | 6.095 | 6.220 | 14.567 |
| 14'-8" | 6.600 | 10.267 | 13.933 | 5.577 | 5.702 | 13.933 |
| 14'-0" | 6.300 | 9.800 | 13.300 | 5.081 | 5.206 | 13.300 |
| 13'-4" | 6.000 | 9.333 | 12.667 | 4.609 | 4.734 | 12.667 |
| 12'-8" | 5.700 | 8.867 | 12.033 | 4.160 | 4.285 | 12.033 |
| 12'-0" | 5.400 | 8.400 | 11.400 | 3.733 | 3.858 | 11.400 |
| 11'-4" | 5.100 | 7.933 | 10.767 | 3.330 | 3.455 | 10.767 |
| 10'-8" | 4.800 | 7.467 | 10.133 | 2.950 | 3.075 | 10.133 |
| 10'-0" | 4.500 | 7.000 | 9.500 | 2.593 | 2.718 | 9.500 |
| 9'-4" | 4.200 | 6.533 | 8.867 | 2.258 | 2.383 | 8.867 |
| 8'-8" | 4.000 | 6.167 | 8.333 | 1.979 | 2.104 | 8.333 |
| 8'-0" | 4.000 | 6.000 | 8.000 | 1.778 | 1.903 | 8.000 |
| 7'-4" | 4.000 | 5.833 | 7.667 | 1.584 | 1.709 | 7.667 |
| 6'-8" | 4.000 | 5.667 | 7.333 | 1.399 | 1.524 | 7.333 |
| 6'-0" | 4.000 | 5.500 | 7.000 | 1.222 | 1.347 | 7.000 |
| 5'-4" | 4.000 | 5.333 | 6.667 | 1.053 | 1.178 | 6.667 |
| 4'-8" | 4.000 | 5.167 | 6.333 | 0.893 | 1.018 | 6.333 |
| 4'-0" | 4.000 | 5.000 | 6.000 | 0.741 | 0.866 | 6.000 |
| 3'-4" | 4.000 | 4.833 | 5.667 | 0.597 | 0.722 | 5.667 |
| 2'-8" | 4.000 | 4.667 | 5.333 | 0.461 | 0.586 | 5.333 |
| 2'-0" | 4.000 | 4.500 | 5.000 | 0.333 | 0.458 | 5.000 |

---

## 6. Fixes found on the 18 current sheets

| # | Sheet(s) | Issue | Fix |
|---|---|---|---|
| T1 | F3, L4, M3, N3 | **The RL(min) column is 0.325 DH** (13.0 ft at DH = 40, 3.9 ft at DH = 12, below the 4 ft floor). The same table's RL(avg) and RL(max) use 0.45 DH, as do A4, B3, C3, D4 and E3. A detailer reading the bottom length off this column would cut the bottom layer 5 ft short at DH = 40. `[Verify]`: if 0.325 DH is intended for GRS, it needs its own avg/max columns and a basis. | Use RL(min) = max(0.45 DH, 4 ft), as in §5 |
| T2 | B2, E2 (soil); F3 (rock) | Titled "GRS wall" on MSE sheets: B2 is block MSE and E2 panel MSE, both with H2; F3 is panel facing | Retitle "MSE wall" |
| T3 | F3 | Mixes charts: BP columns "H3/H4", text "Use B-504-O3/O4", MRS example cites "B-504-H2". It also has a unique note 3 ("Panels are connected to vendor proposed reinforcement…") | One chart set (H3/H4 for panel MSE); the H3 example |
| T4 | C3 | BP columns labeled "O3 BP / O4 BP" (GRS charts) on an MSE block sheet whose text says "Use B-504-H3/H4" | Relabel H3/H4 |
| T5 | D4 | Footnote example cites "B-504-H2", but the sheet is the rail anchor slab case (H1); same as D1 on the core sheets | Cite H1 |
| T6 | E2 | The MRS example cites "6.637 CY/LF", the core wall's value at DH = 16; the truncated soil value is 7.822 | 7.822 |
| T7 | B2 vs E2; B3 vs E3 | The same chart (H2) and height give different reinforcement examples: B2 18.80 against E2 27.36 SY/LF; B3 15.467 against E3 27.73 | One example per chart, from the new design table |
| T8 | A2 vs B2 | Geomembrane slope labels: "20 (Max):1 / 10 (Min):1" against "10% (Max) / 5% (Min)" | One convention, in percent |
| T9 | Soil notes | "Avg RL = 0.83 DH", where the tables (correctly) use 0.825 DH | "0.825 DH" |
| T10 | Rock notes | "The required bearing capacity … is based on 0.70 average DH" (garbled order) | Note 2 above |
| T11 | Soil vs rock | "Or see tabulation for DH < 10'-0"" (soil) against "< 12'-0"" (rock); with the formulas, the 4 ft floor governs below DH = 8'-11" in both | Drop the phrase; the table covers it |
| T12 | N2, N3 | "B-504-03 Reinforcing Schedule" (zero for the letter O) | B-504-O3 |
| T13 | C2, D2, E2, A4 | "superelevtion", "supereelevation", "Excavation Linmit", "layerof" | Spelling |

## 7. Decisions for these sheets

| # | Decision | Recommendation |
|---|---|---|
| T-D1 | Whether GRS truncated walls get a shorter bottom (the 0.325 DH on L4, M3, N3) | Confirm the intent. If no basis is found, use 0.45 DH / 4 ft for all facings, as A-C note 6 says |
| T-D2 | Sheet numbers | B-504-B2 (¾:1 soil) and B-504-B3 (½:1 rock), after the core wall's B1 |
| T-D3 | One sheet or two | Two (soil and rock): the tables differ throughout, and each sheet stays readable |

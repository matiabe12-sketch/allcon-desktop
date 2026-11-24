# Core wall typical section (1:1 excavation or fill): pilot content (draft 2026-11-24)

Sheet-ready content for the new core-wall typical section. It replaces nine sheets, the core-wall (1:1) section of
each facing and top:

|  | Rail anchor slab | Roadway guardrail | Backslope |
|---|---|---|---|
| Block facing MSE | A1 | B1 | C1 |
| Panel facing MSE | D1 | E1 | F1 |
| Block facing GRS | L1 | M1 | N1 |

**Why one sheet works:**
- The nine sheets draw the same section and print the same quantity table.
- Block and panel facing give identical bearing pressures and quantities (A1 = D1, B1 = E1, C1 = F1).
- What changes between them is shown in two option tables: the facing (block, panel, GRS) and the top (rail anchor
  slab, roadway guardrail, backslope).

**Conventions:**
- This is content only; the drafting is in MicroStation.
- `[Decide]` marks a choice for CDOT or the owner; `[Verify]` marks something to confirm on the current DGN.
- The design values come from the design-basis sheet (`design-basis-sheet.md`), not from this sheet.

**Proposed sheet number:** `[Decide]`. Suggestion: B-504-B1, with the truncated soil, truncated rock and
A-frame/tiered sections as B-504-B2 to B-504-B4.

---

## 1. The drawing: one section, three top insets, three facing insets

**Main section** (drawn once, at the layout line, panel facing shown):

- **Wall layout line**, at the front face.
- **Design height DH:**
  - measured from the top of the leveling pad to the top of HMA (roadway or slab tops) or to the front face of the
    coping (backslope);
  - Z, the reinforcement depth, is measured from the same point.
- **Leveling pad:**
  - width D + 12 in minimum, at least 3 in each side of the facing (D = block or panel depth);
  - concrete class `[Verify]`: the sheets' "Concrete Class D" callout may point to the coping rather than the pad;
  - top at least 1'-6" below the finished grade at the front face (design basis Note 11).
- **Bench at the toe:** 4'-0" minimum, for a slope in front.
- **Reinforced zone:**
  - length RL = 0.7 DH, or the tabulated value for DH under 12'-0";
  - the top two layers 2.0 × RL long.
- **Excavation:**
  - 1:1 limit from the heel of the reinforced zone (the reinforced zone + 1'-6");
  - existing slope shown;
  - "Required benches not shown" (Note 1).
- **Class 1 backfill pay limit:** to the top of DH, the excavation limits and the face of the wall (Note 5).
- **Drainage:**
  - 1'-0" wide geocomposite strip drain at 10'-0" maximum (B-504-W1 or W2);
  - non-perforated daylight drain pipe at 100'-0" intervals.
- **Geomembrane:** 30 mil (material per design basis decision D5) over the reinforced zone, sloped to the slope break
  point at 5% minimum and 10% maximum. `[Verify]` The current sheets tag "5% for DH ≤ 16, 10% for DH > 16" beside the
  W1/W2 callouts.
- **Surcharge:** 2'-0" traffic surcharge (roadway tops).
- **Note on the drawing:** "Check superelevation and site layout for possible changes needed for geomembrane."
- **Clear zone:** "Barrier required when located within clear zone. See M-606-15 Style CD for details."

**Top insets** (one detail each, at the top of the wall):

| Inset | What it shows |
|---|---|
| A: Rail anchor slab | Barrier (Type 9 or 10 MASH per B-606-9 or B-606-10MASH) on the moment slab and coping, 3 in HMA, the coping separator to the facing, moment slab per sheet B-504-V1 and the moment slab table `[sheet]`. Detailer note: "Turn off level for bridge rail if not needed." |
| B: Roadway guardrail | Guardrail per M-606-1 on pointed steel posts, 3'-0" minimum from the face, with 6 in diameter holes pre-drilled to core through the membrane and soil reinforcement; 3 in HMA; detail A per B-504-U1 (block) or U2 (panel). |
| C: Backslope | 2H:1V or flatter, infinite or broken; erosion control blanket (extended as the roadway plans define); roadway fill if applicable. |

**Facing insets** (one detail each, at the face):

| Inset | What it shows |
|---|---|
| Block | Block depth D; the coping and rail anchor details per B-504-I1/I2. |
| Panel | Panel depth D; the panel and joint details per B-504-I3 to I5. |
| GRS block | Block depth D; reinforcement at every block course, tails 4'-0" long `[Verify range of Z]`; per FHWA-HRT-11-026. |

---

## 2. Option table: facing

| Facing | Reinforcement | Design table `[new sheet]` (replaces) | Notes |
|---|---|---|---|
| Block, MSE | Extensible (geogrid or geotextile) or inextensible (steel strip or bar mat), at the design spacing | MSE, by top (replaces H1–H4) | |
| Panel, MSE | As block | MSE, by top (replaces H1–H4) | Same table as block: the bearing pressures and quantities are identical |
| Block, GRS | Woven geotextile at every block course, including tails; strength per the GRS reinforcing schedule | GRS, by top (replaces O1–O4) | The schedule gives Tult by Z range (the current M1 uses 4,800 lb/ft PET to DH 20'-8", 7,200 lb/ft to Z = 32', 10,283 lb/ft below; N1 asks Tult ≥ Tmax from the design sheet, at least 4,800 lb/ft in the machine direction) |

## 3. Option table: top of wall

| Top | Barrier | Top two layers | Design table (current sheet) | Inset |
|---|---|---|---|---|
| Rail anchor slab | Type 9 or 10 MASH on a moment slab; test level per the design basis (Table 4) | 2.0 × RL; strength per the reinforcement sheet `[new sheet]` (4,800 lb/ft woven only with the top two layers about 1 ft apart for TL-4) | H1 (MSE), O1 (GRS) | A |
| Roadway guardrail | Guardrail per M-606-1, posts 3'-0" minimum from the face | 2.0 × RL | H2 (MSE), O2 (GRS) | B |
| Backslope, 2H:1V infinite | None (or roadway guardrail where the roadway is above) | 2.0 × RL for a roadway above; otherwise RL `[Decide]` | H3 (MSE), O3 (GRS) | C |
| Backslope, 2H:1V broken | As above | As above | H4 (MSE), O4 (GRS) | C |

**Note on the backslope rows:** the current sheets disagree here. C1 says "Or RL = PLG (for 2:1 infinite slope)", F1
says "RL = 1 × RL (for 2:1 infinite slope)", and N1 says "RL = PLG". The new sheet should state one rule `[Decide]`.

---

## 4. Notes (numbered as on the sheet)

1. **Benches.** Required benches are not shown. The Contractor is responsible for slope stability during
   construction. Working drawings shall show any adjustments needed for benching and other requirements.
2. **Bearing.**
   - The factored bearing pressure BP for each design height is on the design table sheet for the wall's facing and
     top. It is the Strength I pressure at the toe, with RL = 0.7 DH (design basis Note 12).
   - The foundation's factored bearing resistance shall meet or exceed BP.
3. **Soil reinforcement.**
   - **MSE:** extensible or inextensible soil reinforcement is allowed, at the spacing and strength shown on the
     design table sheet.
   - **Top two layers:** 2.0 × RL long, with the strength required for the barrier on the reinforcement sheet
     (design basis Note 13).
   - **GRS:** all reinforcement, including the tails, is woven geotextile at every block course, per the GRS
     reinforcing schedule.
4. **Reinforcement quantities.** The MRS (SY/LF) on the design table sheet is for the assumed spacings, for
   information only. The Contractor shall provide the actual MRS (SY/LF), soil reinforcement types, spacing and
   coverage ratio.
5. **Pay limits.**
   - Structure Backfill (Class 1) is bound by the top of DH, the excavation limits and the face of the wall. See the
     B-504 quantity sheets (Q1 to Q7) for details.
   - Quantities added by benching (Section 203.06) are included in the cost of the work.
   - MRS is paid by volume, with the Class 1 backfill paid separately.
6. **Clear zone.** A barrier is required when the wall is within the clear zone (M-606-15 Style CD).
7. **Geomembrane.** Check the superelevation and the site layout for changes needed to the geomembrane.
8. **Design values.** Soils, loads, resistance factors, barrier loads, seismic and embedment are on the design-basis
   sheet B-504-A C.

---

## 5. Table: core wall quantities per foot of wall

**Formulas (B-504-Q7, 1:1 excavation):**
- RL = 0.7 DH, and at least 6 ft (DH ≤ 6'-0"), 7 ft (DH ≤ 7'-4") or 8 ft (DH > 7'-4");
- MRS = DH × RL / 27;
- BM1 = [DH (RL + 1.5) + 0.5 DH² + 3.375] / 27;
- PLG = RL + 1.5 + DH.

DH is in ft (8 in block courses).

**Checked:**
- The formulas reproduce the current sheets' printed values (B-504-L1/M1/N1 and D1) for all 58 rows, to within
  rounding (0.0005).
- Structure excavation EM1 depends on the site (H and θ), so it isn't tabulated; see B-504-Q7.

**Moved to the design table sheet:**
- BP: it depends on the top of the wall, the loads and the resistance factors.
- MRS (SY/LF): it depends on the spacing.

The current sheets tabulate both here, under the pre-10th-edition factors. Both must be recomputed for the design
basis anyway.

| DH | RL (ft) | MRS (CY/LF) | BM1 (CY/LF) | PLG (ft/LF) |
|---|---|---|---|---|
| 40'-0" | 28.000 | 41.481 | 73.458 | 69.500 |
| 39'-4" | 27.533 | 40.110 | 71.071 | 68.367 |
| 38'-8" | 27.067 | 38.762 | 68.723 | 67.233 |
| 38'-0" | 26.600 | 37.437 | 66.414 | 66.100 |
| 37'-4" | 26.133 | 36.135 | 64.145 | 64.967 |
| 36'-8" | 25.667 | 34.856 | 61.915 | 63.833 |
| 36'-0" | 25.200 | 33.600 | 59.725 | 62.700 |
| 35'-4" | 24.733 | 32.367 | 57.574 | 61.567 |
| 34'-8" | 24.267 | 31.157 | 55.463 | 60.433 |
| 34'-0" | 23.800 | 29.970 | 53.392 | 59.300 |
| 33'-4" | 23.333 | 28.807 | 51.360 | 58.167 |
| 32'-8" | 22.867 | 27.666 | 49.367 | 57.033 |
| 32'-0" | 22.400 | 26.548 | 47.414 | 55.900 |
| 31'-4" | 21.933 | 25.453 | 45.500 | 54.767 |
| 30'-8" | 21.467 | 24.382 | 43.626 | 53.633 |
| 30'-0" | 21.000 | 23.333 | 41.792 | 52.500 |
| 29'-4" | 20.533 | 22.308 | 39.997 | 51.367 |
| 28'-8" | 20.067 | 21.305 | 38.241 | 50.233 |
| 28'-0" | 19.600 | 20.326 | 36.525 | 49.100 |
| 27'-4" | 19.133 | 19.370 | 34.848 | 47.967 |
| 26'-8" | 18.667 | 18.436 | 33.211 | 46.833 |
| 26'-0" | 18.200 | 17.526 | 31.614 | 45.700 |
| 25'-4" | 17.733 | 16.639 | 30.056 | 44.567 |
| 24'-8" | 17.267 | 15.774 | 28.537 | 43.433 |
| 24'-0" | 16.800 | 14.933 | 27.058 | 42.300 |
| 23'-4" | 16.333 | 14.115 | 25.619 | 41.167 |
| 22'-8" | 15.867 | 13.320 | 24.219 | 40.033 |
| 22'-0" | 15.400 | 12.548 | 22.858 | 38.900 |
| 21'-4" | 14.933 | 11.799 | 21.537 | 37.767 |
| 20'-8" | 14.467 | 11.073 | 20.256 | 36.633 |
| 20'-0" | 14.000 | 10.370 | 19.014 | 35.500 |
| 19'-4" | 13.533 | 9.691 | 17.811 | 34.367 |
| 18'-8" | 13.067 | 9.034 | 16.648 | 33.233 |
| 18'-0" | 12.600 | 8.400 | 15.525 | 32.100 |
| 17'-4" | 12.133 | 7.789 | 14.441 | 30.967 |
| 16'-8" | 11.667 | 7.202 | 13.397 | 29.833 |
| 16'-0" | 11.200 | 6.637 | 12.392 | 28.700 |
| 15'-4" | 10.733 | 6.095 | 11.426 | 27.567 |
| 14'-8" | 10.267 | 5.577 | 10.500 | 26.433 |
| 14'-0" | 9.800 | 5.081 | 9.614 | 25.300 |
| 13'-4" | 9.333 | 4.609 | 8.767 | 24.167 |
| 12'-8" | 8.867 | 4.160 | 7.960 | 23.033 |
| 12'-0" | 8.400 | 3.733 | 7.192 | 21.900 |
| 11'-4" | 8.000 | 3.358 | 6.491 | 20.833 |
| 10'-8" | 8.000 | 3.160 | 5.985 | 20.167 |
| 10'-0" | 8.000 | 2.963 | 5.495 | 19.500 |
| 9'-4" | 8.000 | 2.765 | 5.022 | 18.833 |
| 8'-8" | 8.000 | 2.568 | 4.565 | 18.167 |
| 8'-0" | 8.000 | 2.370 | 4.125 | 17.500 |
| 7'-4" | 7.000 | 1.901 | 3.430 | 15.833 |
| 6'-8" | 7.000 | 1.728 | 3.047 | 15.167 |
| 6'-0" | 6.000 | 1.333 | 2.458 | 13.500 |
| 5'-4" | 6.000 | 1.185 | 2.133 | 12.833 |
| 4'-8" | 6.000 | 1.037 | 1.825 | 12.167 |
| 4'-0" | 6.000 | 0.889 | 1.532 | 11.500 |
| 3'-4" | 6.000 | 0.741 | 1.257 | 10.833 |
| 2'-8" | 6.000 | 0.593 | 0.997 | 10.167 |
| 2'-0" | 6.000 | 0.444 | 0.755 | 9.500 |

---

## 6. Fixes found on the nine current sheets

| Sheet | Issue | Fix |
|---|---|---|
| B1 | Title reads "Rail anchor slab with block facing MSE wall", but the sheet is the roadway guardrail case (M-606-1, H2) | Retitle "Block facing MSE wall with roadway rail and 1:1 soil excavation", as the index has it |
| D1 | Says "accompanied with B-504-H1" but its MRS footnote cites "B-504-H2: DH = 16' requires 13.689 SY/LF" | Cite H1 in both (A1 does) |
| C1, F1, N1 | The backslope's top-layer length: "Or RL = PLG", "RL = 1 × RL", "RL = PLG" | One rule (option table 3) |
| N1 | "Use B-504-03 / B-504-04" and "B-504-03 Reinforcing Schedule": the digit zero for the letter O | B-504-O3, O4 |
| B1, C1, D1, E1, F1, L1, M1, N1 | "capcity"; M1 "macine" | "capacity", "machine" |
| All nine | BP tabulated under the pre-10th factors and loads (900 lb/ft rail impact, geosynthetic φ 0.90) | Recompute on the new design table sheet |
| A1, D1 vs B1, E1 | BP differs between the anchor slab and roadway tops by only about 1% (4.772 vs 4.721 TSF at DH = 40 ft) | Expected: the slab's added weight vs the guardrail; nothing to fix, but the design table can show both from one calculation |

## 7. Decisions for this sheet

| # | Decision | Recommendation |
|---|---|---|
| S1 | Sheet number and order of the base-type sections | B-504-B1 to B4 (core, truncated soil, truncated rock, A-frame/tiered), each with the same layout |
| S2 | Top-two-layer length under a backslope with no roadway | RL (no extension), since the extension is for roadway tension cracks; state it once |
| S3 | GRS on the same sheet as MSE, or its own sheet | The same sheet: the section, notes and quantity table are shared; only the facing inset and reinforcement row differ |
| S4 | Where BP and MRS (SY/LF) live | On the design table sheets, recomputed for AASHTO 10th; this sheet keeps the geometry-only quantities |

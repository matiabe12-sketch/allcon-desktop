# CDOT B-504 MSE/GRS worksheets: review and proposed updates (2026-11-24)

**Scope:** all 91 B-504 sheets in the Staff Bridge worksheet folder (A–W, Q, SN), read as text. The index sheets
(B-INDEX) are scanned images; I didn't read them.

**Compared against:**
- AASHTO LRFD 10th Edition;
- CDOT BDM 2026 (Sections 11 and 13);
- NCHRP Report 663;
- NCHRP Web Document 326 (Project 22-20(02));
- FHWA GEC 11 (NHI-10-024/025).

**Severity:** **A**: changes a design result or is a safety question; **B**: a gap the designer has to fill on their own;
**C**: a typo, inconsistency or presentation issue.

## Bottom line

1. **(A) The barrier impact on the top layers is pre-MASH.**
   - The H and O design charts use 900 lb/ft "rail impact", and five sheets already say "Note to Designer: Update design
     for current MASH loads" (H1, H2, O1, O2, V2).
   - BDM 11 and 13.5.4 tell designers to use NCHRP Web Doc 326 with a moment slab. For TL-4 that is a yield pressure of
     1,755 psf over the top 2.25 ft: about 3,950 lb/ft, 4.4 times the charts' 900 lb/ft.
   - **Update:** replace the 900 lb/ft with Web Doc 326 Tables 9-1 to 9-5, by test level.
2. **(A) The top-two-layer product is fixed at 4,800 lb/ft woven geotextile (D1 note 3).**
   - Under Web Doc 326's TL-4 loads it works only if the top two layers share the band (about 1 ft apart).
   - At the charts' 2 ft spacing the top layer is about 20% short: it needs about 5.8 kip/ft ultimate.
   - **Update:** specify the top layers by the ultimate strength each needs, given in a table by test level and top
     spacing, instead of naming one product. Or keep 4,800 lb/ft and require the top two layers at 1 ft or less (TL-4).
     TL-5 needs a check of its own.
3. **(A) The rail anchor slab has details but no design basis.**
   - V1 gives the details and quantities, and a 30 ft least length.
   - There is no stated test level, equivalent static load, width, rotation point, or sliding and overturning check.
   - A-C says TL-4 (Type 9 or 10 MASH), while the B-606-9 sheets detail Type 9 for TL-5.
   - **Update:** add a moment slab design table by test level (width, thickness, length between joints, coping bars),
     checked to Web Doc 326 9.1. Add the coping-to-panel isolation detail it assumes (rotation point A), and settle
     Type 9's test level on these sheets.
4. **(A) The seismic exemption leaves out AASHTO's exceptions.**
   - A-C note 5 and the H notes say there is no seismic analysis for SPZ 1–3.
   - AASHTO 11.5.4.2 (10th) allows that only when the wall doesn't support another structure (a bridge abutment
     foundation on the MSE wall, for example), has no liquefaction or sensitive clays, and isn't part of a larger
     slope. It also never applies to walls acting as bridge support piers.
   - **Update:** quote 11.5.4.2's exceptions in the note.
5. **(B) The design basis is out of date.**
   - I5 (panels) cites "AASHTO 7th Edition LRFD with current interims", and SN1 (soil nails) cites the 8th. The current
     edition is the 10th (2024).
   - **Update:** put one design-basis block (code edition, date, loads, test level) on A-C and reference it from every
     sheet.

The rest of the list follows, then a proposal for presenting the sheets differently.

## A. Design basis and loads

| # | Sheet(s) | Issue | Proposed update |
|---|---|---|---|
| A1 | H1, H2, H4, O1, O2, O4 | "Rail Impact = 900 lb/ft" on z ≤ 2 ft, "with factor of 3" (unclear what the 3 multiplies). Pre-MASH; the sheets themselves flag it. | Web Doc 326's pullout and yield pressures (Tables 9-2, 9-4) or line loads (9-3, 9-5) by test level, applied as pd × At (each layer's tributary area), as Web Doc 326 9.2 defines. |
| A2 | D1 note 3, A–F, L–N | Top two layers: "woven geotextile with 4800 lb/ft minimum (MARV)". Not enough for TL-4 under a moment slab unless the layers are 1 ft apart; TL-5 not checked. | A table of required ultimate strength by test level and top spacing, with Tal = Tult/(RF_ID·RF_CR·RF_D) and the dynamic part without RF_CR (AASHTO Eq. 11.10.10.2-1). |
| A3 | V1, A-C note 4 | Rail anchor slab: no design load, width or stability check. Least length 30 ft (NCHRP 663 gives 20–60 ft between joints and widths of 4.5–10 ft; Web Doc 326 Table 9-1 gives least widths of 4–12 ft by test level). | A design table by test level; the length between joints (at most 60 ft) and joint dowels as AASHTO 11.10.10.2 requires ("adjacent slabs joined by shear dowels"). |
| A4 | A-C note 4, V1 | "TL-4 railing (Bridge Rail Type 9 or 10MASH)". B-606-9 details Type 9 at 43 in for TL-5 loads. | State the test level the wall and slab are designed for, separately from the rail's own rating. |
| A5 | A-C note 5, H notes | No seismic analysis for SPZ 1–3, without AASHTO 11.5.4.2's exceptions. | Add the exceptions: walls supporting a bridge or other structure, liquefaction or sensitive clays, walls in larger slopes, bridge support piers. |
| A6 | V2 | Micropile A-frame: "Impact Load" 9.970 kip/ft tension and 8.663 kip/ft compression under CT, Extreme Event II. The CT basis (Ft, length, height) isn't given; likely pre-MASH. | State the CT used (AASHTO Table A13.2-1 or MASH-based) and update with A1. |
| A7 | I5, SN1 | AASHTO 7th (panels) and 8th (soil nails) editions; PCI 7th. | One design-basis block (see the bottom line). |
| A8 | BDM 11 vs sheets | BDM 11: MSE panels are sacrificial for CT; the sheets don't say what isolates the panel from the coping. | A coping and panel isolation detail (expansion material or gap) on the anchor slab sheets, as BDM 13.5.4 asks ("separator between the nose of the moment slab and the wall facing"). |

## B. Technical gaps

| # | Sheet(s) | Issue | Proposed update |
|---|---|---|---|
| B1 | H1–H4, O1–O4 | Charts are worked for DH up to 40 ft only ("values are only good for 40' wall"); bearing pressure is given only at DH = 40 ft. | Tabulate by DH (as D1 does for RL and quantities), or give the equations with one worked example and leave the numbers to a calc. |
| B2 | A-C note 6, Q3–Q6 | Truncated base: RL ≥ 0.45 DH or 4 ft with global FS 1.3 (φ 0.75) "with detailed boring". No external stability basis is stated: which width resists sliding and bearing, and whether the retained soil over the cut counts. | State the external stability model (GEC 11 / FHWA-CFL/TD-06-001 for shored MSE walls) and who checks global stability. |
| B3 | Q7 (core wall) | EM1's formula has 1 − tan θ in the denominator: it fails at θ ≥ 45° (a 1:1 cut never daylights). No alternative is given. | Note the limit and point to the shored or A-frame sheets (Q2, Q5, Q6) for steeper ground. |
| B4 | Q2–Q7 | "Condition: H Í 1.5 + 4 tan(θ)" (the symbol is garbled in the PDF's text). From the examples it means H ≥ 1.5 + 4 tan θ, otherwise use Q5/Q6. | Write the condition and the fallback in words. |
| B5 | Q4 | Example uses "Average RL = 0.83 DH = 13.28 ft"; the geometry (0.45 DH + ¾ × DH/2) gives 0.825 DH = 13.2 ft. BM1 8.0 vs 7.95. | Use 0.825 DH, or show the rounding. |
| B6 | Q5, Q6 | EM1 for the A-frame / low-H case is only partly given (the text breaks off after "0.7(DH)" and "0.825(DH)"). | Give the complete formula with its example. |
| B7 | D1 note 2 | "Required bearing capacity ... based on 0.7 DH". Doesn't say which load group, or whether it is factored (the chart's BP is factored). | Say "factored, Strength I, Meyerhof over L − 2e", as the H charts compute it. |
| B8 | H charts | Pullout: "Le based on extensible, 0.8 × Le for inextensible", and "Le of top two layers not developed: layers used for avoiding roadway tension cracks". The 0.8 factor's source isn't cited, and the top two layers' pullout is waived without a stated basis. | Cite the source (AASHTO 11.10.6.3.2 doesn't have 0.8 Le), or drop it; state that impact pullout uses the full length (Web Doc 326 9.2). |
| B9 | All | Pavement: HMA 12 in at 140 pcf with γ 1.5/0.65 (H charts) isn't on A-C's design criteria. | List it on A-C with the other loads. |
| B10 | W1 vs D1 | Geomembrane: D1 and the sections say "30 mils LLDPE"; W1 says "30 mils HDPE". | Pick one (or allow both, with the spec reference). |
| B11 | V1 | Rail anchor slab quantities are given for information only (0.31 / 0.24 CY/LF Class D), with no bar weights. | Give the bars too, or a formula by slab width. |
| B12 | I1, I3 (segment tables) | Segment tables have no worked example and no link to the Q-sheet quantities. | A spreadsheet or calc template that takes stations, DH and excavation height and returns the segment table and quantities (the Q sheets' notes already suggest "a spreadsheet may be required"). |

## C. Typos and small fixes

| # | Sheet(s) | Issue |
|---|---|---|
| C1 | H2 | "AASHTO LRFD Eq 10.10.6.3.2-1": should be 11.10.6.3.2-1. |
| C2 | H1–H4, O1–O4 | "AASHTO LRFD Eq 11.6.3.2.-1": a stray period. |
| C3 | H1, H2 | "Rail Impact = 900 lb/ft ... with factor of 3": ambiguous. |
| C4 | V2, H notes | "accomodate" (V2 note 9); "sesmic" (H-chart notes, "avoiding sesmic induced..."). |

## D. A better way to present the B-504 set

The 91 sheets are mostly permutations of three choices: facing (block, panel, GRS), base (core, truncated ¾:1 soil, ½:1
rock, A-frame, tiered) and top (rail anchor slab, roadway rail, backslope). That's why A1–A5, B1–B3, C1–C3, D1–D5,
E1–E3, F1–F3, L1–L5, M1–M3 and N1–N3 repeat each other with small changes, and why fixes like A1 and A2 must be made
on many sheets at once.

**Proposed structure:**

1. **One design-basis sheet (A-C):** code edition, date, design life, soils, loads (LL surcharge, pavement, test level
   and its Ld, Ls, He and pd by Web Doc 326), resistance factors, the seismic note with AASHTO 11.5.4.2's exceptions,
   and who checks global stability. Every other sheet references it instead of repeating numbers.
2. **One typical section per base type** (core, truncated soil, truncated rock, A-frame), with a small table for the
   facing (block, panel, GRS) and the top (anchor slab, roadway rail, backslope). This cuts about 30 section sheets to
   about 5, and each fix is made once.
3. **Replace the design charts with tables plus a calc.**
   - The H and O charts compute σH, Tmax, Le and BP for one geometry (DH = 40 ft, 16 ft shown).
   - Replace them with:
     - a table of results by DH, for the standard geometry;
     - the equations and one worked example;
     - a calc for anything non-standard: a spreadsheet, or the ALLCON MSE tool, which now does this with the CDOT
       options, quantities and segment table.
4. **Specify reinforcement by required strength, not product.** A table of required Tult (or Tal) by depth band, DH and
   top spacing, with the reduction factors listed, so any qualified product can be used.
5. **A moment slab design table and sheet:** width, thickness, length between joints, coping bars by test level,
   pre-checked for sliding, overturning and coping flexure (Web Doc 326 9.1). Add the isolation detail and the joint
   dowels.
6. **Quantity sheets as formulas plus a template.** Keep Q2–Q7's formulas but:
   - state each one's limits (B3, B4);
   - give complete examples (B5, B6);
   - provide a segment-table template that sums the wall (B12);
   - publish the formulas and tables as data (a spreadsheet or CSV), so design tools use exactly CDOT's numbers.
7. **A revision log** on the application guide listing which sheets changed for MASH, so designers can tell an updated
   set from an old one.

## How ALLCON handles these now

- **Web Doc 326 loads** by test level, applied as pd × At (A1).
- **Products** with their reduction factors, and per-layer strength; the default puts 4,800 lb/ft woven geotextile in the
  top two layers at 1 ft spacing, which passes TL-4 (A2).
- **Moment slab** sliding, overturning and coping flexure, at rotation point A or B (A3).
- **CDOT's seismic option** as a choice. It doesn't yet warn about AASHTO 11.5.4.2's exceptions; a small follow-up
  would flag abutments and walls supporting structures (A5).
- **Quantities** by Q3, Q4 and Q7, with the segment table (B12). The θ ≥ 45° core-wall case is reported as outside the
  sheet's template (B3).

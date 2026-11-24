# MSE wall: CDOT's B-504 options (built 2026-11-24)

The MSE Wall tool now follows CDOT's B-504 MSE wall worksheets alongside AASHTO LRFD 11.10. A barrier on a moment slab is
designed by NCHRP Report 663 and NCHRP Web Document 326 (Project 22-20(02)), the sources CDOT BDM 11 and 13.5.4 name.
Walls saved before these options keep the plain AASHTO wall they were designed as: none of the options are switched on.

## What was added

1. **CDOT pay quantities (B-504-Q3, Q4, Q7)**, per foot and for the whole wall:
   - structure excavation EM1, Class 1 backfill BM1, mechanical reinforcement of soil MRS and the geomembrane's pay
     length PLG, from the excavation height at the wall layout line and the existing ground's angle;
   - facing area, and the moment slab and coping concrete (Class D (Wall));
   - the geomembrane is paid under 420-00000.
   They are in the take-off and the calc package. All three sheets' worked examples are matched.
2. **A barrier on top**:
   - **On a moment slab:**
     - sliding (φ W tan φr ≥ Ls) and overturning (φ W l ≥ Ls h) about rotation point A or B, with W taken over the
       length between joints;
     - coping flexure under the dynamic load Ld over the barrier length;
     - the impact on the top two layers: pullout over the full length, and yield, where a geosynthetic's dynamic part
       is taken without the creep factor (AASHTO Eq. 11.10.10.2-1).

     The test levels are MASH TL-3, TL-4-1, TL-4-2, TL-5-1 and TL-5-2 (Web Doc 326 Tables 9-1 to 9-4), plus NCHRP 663's
     10 kip load (with its φ 0.8 and 0.9).
   - **Post-and-beam:** 300 lb/ft, half on each of the top two layers (AASHTO 11.10.10.2).
3. **Reinforcement by layer**:
   - spacing and product by zones down the wall;
   - CDOT's products: 4,800 lb/ft PP, and 7,800, 12,000 and 14,400 lb/ft HDPE;
   - Tal = Tult / (RF_ID · RF_CR · RF_D), with RF_ID 1.3, RF_D 1.1, and RF_CR 2.55 for HDPE or 1.8 for PP and PET;
   - a separate product for the top two layers, and the top two layers at 2 × RL (B-504-D1).
4. **Base type**: a core wall with uniform length, or a truncated base on a ¾:1 soil or ½:1 rock cut.
   - On a truncated base, L is the length at the bottom; each layer's length grows along the cut.
   - The reinforced triangle's weight counts; the earth pressure acts at the top's width; bearing, eccentricity and
     sliding are taken on the bottom width.
   - By CDOT's method (the B-504 design charts), the whole weight acts at the bottom's center and only the earth
     pressure and surcharges overturn (fixed 2026-11-24). The first version put the triangle over the cut behind the
     center, which swung the resultant to the heel: 24.6 TSF at DH = 40 ft, where CDOT prints 9.709. Now 4% within
     CDOT's 9.709 (soil) and 8.963 (rock), with the charts' inputs.
   - The least bottom length is 0.45 DH or 4 ft. Global stability (FS 1.3, φ 0.75) is noted as the geotechnical
     engineer's (B-504-A C note 6).
5. **CDOT defaults** for a new wall:
   - 12 in of HMA at 140 pcf as a DW surcharge (factors 1.5 and 0.65);
   - no seismic analysis in seismic zones 1–3 with CDOT's earthquake details (B-504-A C note 5), as an option;
   - the factored bearing pressure in TSF for the geotechnical report;
   - B-504-D1's 6, 7 and 8 ft least lengths for short walls, shown when AASHTO's 0.7H and 8 ft isn't met.
6. **Wall segments**: points along the wall (station, design height, excavation height).
   - Each segment is taken at its average height, with the reinforcement length scaled from the design section (at
     least CDOT's least length).
   - Quantities are summed into a segment table; every segment is checked to stay within the designed height.

## AASHTO LRFD 10th updates (2026-11-24)

- **Resistance factors**, Table 11.5.7-1 and Article 11.5.8, read from the 10th Edition PDF:

  | Reinforcement | Tensile | Pullout | Tensile, earthquake | Pullout, earthquake |
  |---|---|---|---|---|
  | Geotextiles, geogrids | 0.80 (was 0.90) | 0.70 (was 0.90) | 1.0 (was 1.2) | 1.0 (was 1.2) |
  | Geostrips | 0.55 (was 0.90) | 0.70 (was 0.90) | 1.0 (was 1.2) | 1.0 (was 1.2) |
  | Steel strips | 0.75 | 0.90 | 1.0 | 1.20 |
  | Steel grids | 0.65 | 0.90 | 0.85 | 1.20 |

  Bearing 0.65 (0.9 with earthquake) and sliding 1.0 are unchanged. Walls saved earlier are checked with the new factors
  too: a geogrid wall that just passed with the old 0.90 may now show a rupture or pullout failure.
- **Embedment (11.10.2.2):**
  - 2.0 ft on sloping ground (4H:1V or steeper), or where the soil in front may erode or be excavated later;
  - 1.0 ft on level ground with neither;
  - not less than the frost depth; none on rock;
  - plus Table C11.10.2.2-1's guide by the ground in front: H/20 level (H/10 for abutments), H/10 at 3H:1V, H/7 at
    2H:1V, H/5 at 1.5H:1V.

  New inputs: the ground's slope in front, erosion (default on, which keeps the old 2 ft), frost depth and a rock
  foundation. CDOT's worksheets add that the top of the leveling pad be at least 1'-6" below finished grade.

## Judgment calls

- **Truncated base:** all weight at the bottom's center (CDOT's method); the soil over the cut isn't counted in
  resisting overturning, because it bears on the cut. Global stability stays with the geotechnical engineer.
- **The impact's dynamic force** is Web Doc 326's pd × At. Each band's pressure (the first h1 below the top, 2.25 or
  1.6 ft, then the next h2, 2.5 ft) goes to the layers by the part of their tributary height inside it, so the bands
  are always shared out in full. Where one layer covers the first band, as in NCHRP 663 Appendix J, that layer takes it
  all (within 1% of the example).
- **CDOT's design charts** add 900 lb/ft to the layers within 2 ft of the top. With a moment slab, the BDM points to
  Web Doc 326, which is what's used; the 900 lb/ft is mentioned for comparison.
- **A finding:** under a moment slab, CDOT's 4,800 lb/ft woven geotextile carries Web Doc 326's TL-4 yield pressure
  (1,755 psf over the top 2.25 ft) only when the top layers share it.
  - As a single top layer at 2 ft spacing it is about 20% short: it needs about 5.8 kip/ft ultimate.
  - The default wall puts the top two layers 1 ft apart (at 0.75 and 1.75 ft), with 4,800 lb/ft geotextile: about 1.44
    and 1.19 against 2.24 kip/ft.
  - See docs/b504-worksheet-review.md.
- **MSE panels** aren't designed for the collision load: they're sacrificial (CDOT BDM 11).

## Validation

- **B-504-Q7** (core wall, 1:1 cut): EM1 16.8, BM1 12.39, MRS 6.64, PLG 28.7.
- **B-504-Q4** (¾:1 soil cut): EM1 7.32, PLG 19.2. BM1 and MRS are within 1%, because the sheet rounds the average
  length to 0.83 DH.
- **B-504-Q3** (½:1 rock cut): EM1 5.63, BM1 6.8, MRS 6.6, PLG 15.2.
- **NCHRP 663 Appendix J:** sliding φP 25.91 ≥ 10 kip; overturning φM 88.88 ≥ 35.83 kip-ft; coping φMn about 205 kip-ft
  against 171 kip-ft.
- **Calc package:** works out with no errors and matches the engine for eight walls, from the old plain AASHTO walls to
  a TL-5 barrier on steel strips with a truncated base.

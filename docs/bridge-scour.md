# Bridge Scour (built 2026-11-23)

A tool for the scour at each pier and abutment of a bridge over water, by FHWA HEC-18, 5th Edition (FHWA-HIF-12-003,
2012), as CDOT requires it: Drainage Design Manual 10.6 and the Scour Program Procedures Manual (draft, 2026-01) 3.4.5.
Kind `bridge-scour`, `src/lib/design/scour/`, in the catalog's new "Hydraulics" group.

## What CDOT asks for

- Scour by HEC-18 (2012); total scour at each foundation element:
  - piers: long-term degradation (LTD) + contraction scour + local pier scour;
  - abutments: LTD + (ymax − y0), NCHRP 24-20, which already contains contraction scour.
- Pressure flow (the low chord submerged): the larger of pressure-flow and contraction scour (DDM 10.6.2).
- The scour design flood (usually Q100) and the scour design check flood (Q500, or the worse overtopping event); DDM
  Table 10.1 for off-system bridges.
- Datum: the thalweg for elements in or near the channel, the floodplain elsewhere; minimum scour elevations plotted
  under each element (SPM 3.4.5.5).
- Countermeasures (riprap) are not counted (DDM 10.6.3); foundations designed for the design flood's scour at Strength
  and Service (SPM 3.4.5), checked for the check flood's at the Extreme Event (AASHTO 2.6.4.4.2, 3.7.5).

## The method (HEC-18)

- **Contraction (Chapter 6):** Vc = 11.17 y^(1/6) D50^(1/3) (Eq. 6.1, D50 at least 0.2 mm); live-bed when the approach
  velocity exceeds it (or as chosen). Live-bed: y2 = y1 (Q2/Q1)^(6/7) (W1/W2)^k1 (Eq. 6.2), k1 0.59/0.64/0.69 by
  V*/ω; optionally limited by armoring (the smaller of live-bed and clear-water, 6.3 Note 8). Clear-water:
  y2 = (0.0077 Q² / (Dm^(2/3) W²))^(3/7), Dm = 1.25 D50 (Eq. 6.4). ys = y2 − y0.
- **Pressure flow (6.10):** t = 0.5 hb (hb ht / hu²)^0.2 (1 − hw/ht)^−0.1 (Eq. 6.16), ys = y2 + t − hb (Eq. 6.14) with y2
  for the opening's flow; overtopping and live-bed with hue = hb + T and Que = Q1 (hue/hu)^(8/7) (Eq. 6.15).
- **Piers (Chapter 7):** ys = 2.0 K1 K2 K3 Kw a (y1/a)^0.35 Fr^0.43 (Eq. 7.3):
  - K1 by nose shape (Table 7.1), 1.0 past 5° of attack;
  - K2 = (cos θ + (L/a) sin θ)^0.65, L/a at most 12 (Eq. 7.4);
  - K3 by bed condition (Table 7.3; medium dunes 1.2, the upper value);
  - Kw for wide piers (Eqs. 7.20, 7.21) only where chosen and where it applies (y/a < 0.8, a/D50 > 50, subcritical);
  - multiple columns (7.6): closer than 5 diameters, the bent's projected width with K1 = K2 = 1; 5 or more, 1.2 times
    one column; with debris, the bent and debris as one solid pier;
  - debris (7.7.3, Eq. 7.32): the effective width a*d, K1 0.79 rectangular, 0.21 triangular;
  - the rule-of-thumb limits 2.4a / 3.0a (Eq. 7.2) are shown, not applied.
- **Abutments (8.6.3, NCHRP 24-20):** condition (a) when L/Bf ≥ 0.75: yc = y1 (q2/q1)^(6/7) (Eq. 8.5); condition (b):
  yc = (q2/(Ku D50^(1/3)))^(6/7) (Eq. 8.6), or by a cohesive floodplain's τc (Eq. 8.7); ymax = α yc (Eq. 8.3),
  ys = ymax − y0.
- **Non-erodible rock:** an element's scour stops at the top of rock where one is given (SPM; HEC-18 4.7).

## Judgment calls

1. **The amplification factors αA, αB** are only curves in HEC-18 (Figures 8.9 to 8.12). They were read off the rendered
   figures (the solid design curves) at about ±0.03, interpolated in ln(q2/q1), held at the charts' ends. Checked:
   HEC-18 Examples 3 and 4 (1.7 at 1.4, 2.1 at 1.8) and the Hydraulic Toolbox's 1.45 at 1.04 (ours 1.44).
2. **Fall velocity** (Figure 6.8, a chart): Ferguson and Church (2004) for natural sand, SG 2.65, 68 °F water; it only
   picks k1's band, and a lower value is the conservative side. It can be entered instead.
3. **The rule-of-thumb pier limit** and **Kw** both lower scour, so they aren't applied by default (the conservative
   choice; Kw by the engineer's judgment, as HEC-18 says).
4. **Medium dunes:** K3 1.2 (the table's 1.2 to 1.1, the upper end).

## Validation

- HEC-18's worked examples: pressure flow Examples 1–3 (5.27 and 8.05 ft), pier Examples 1, 2 and 7 (9.9, 28.3,
  8.9 ft; a*d 3.78 and 7.3 ft), abutment Examples 3–5 (12.6, 10.4 ft; yc 5.1 ft).
- A CDOT bridge: I-70 Floyd Hill West Section (Clear Creek), its Bridge Hydraulics Report's Appendix G (FHWA Hydraulic
  Toolbox 5.2): a 4.5 ft caisson at 56°, 14.04 and 14.54 ft (200- and 500-year); a spill-through abutment, condition
  (a), 3.11 ft (ours 3.03, the α curve's steep end).
- The calc package works out with no errors and matches the engine.

## In the Bridge and the foundations

- **The Bridge** offers a "Scour" design, prefilled with each pier's column bent (shape, diameter, count, spacing) and
  both abutments, each tied to its support; the floods' hydraulics are entered from the hydraulic report.
- **The load path:** with a Scour design linked, each pier's scour design flood total goes to its foundation (rounded to
  0.1 ft, below the ground at the foundation):
  - spread footing: `scour`; the base must be below it (AASHTO 10.6.1.2), and bearing, passive resistance and the soil's
    weight come from the scoured ground;
  - drilled shaft: `scour`; the layers start at it (no side resistance, overburden or lateral support above), and where
    it reaches below the shaft's top the shaft stands free over that length;
  - piles: their unsupported length.
- The foundation tools take the same `scour` input on their own.

## Not yet

- The check flood's scour at the Extreme Event in the foundations (only the design flood's is passed).
- Abutment foundations (the Abutment tool's piles) taking the abutments' scour.
- The FDOT (Sheppard–Melville) pier method, complex piers (exposed footings and pile caps, 7.5), scour in cohesive soils
  and erodible rock (HEC-18 Chapter 4, NCHRP 717), and the scour plot on the Bridge Hydraulic Information sheet.

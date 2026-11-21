# Soldier pile and sheet pile walls (plan)

The next tool on the schedule (Mon 2026-12-07 slot): **nongravity cantilevered walls** (AASHTO LRFD 11.8) and
**anchored walls** (11.9), with discrete vertical elements (soldier piles and lagging) or continuous ones (sheet piles).
They're used for temporary shoring at almost every bridge, and as permanent walls where there's no room to excavate.

CDOT's Bridge Design Manual (Feb. 2026) adds little:
- anchored walls "should follow AASHTO" and are "not routinely used in Colorado" (11.5.5);
- the load factors are BDM Table 11-2 (11.5.9);
- the resistance factors are AASHTO's, or the geotechnical report's (11.5.10);
- temporary shoring is paid lump sum (Item 206-01750 and the Area items).

So AASHTO governs, with FHWA's Geotechnical Engineering Circular No. 4 (Ground Anchors and Anchored Systems) for the
anchors and lagging.

## Scope

1. **Cantilever walls** (11.8):
   - soldier piles (HP or W sections, or drilled-in piles with concrete) at a spacing, with timber or precast lagging;
   - sheet piles (steel Z or flat sections).
2. **Anchored walls** (11.9): the same walls with one or more tiers of ground anchors (tiebacks).

## Loads (AASHTO 3.11, 11.6.1.2)

- **Earth pressure behind the wall**, active Ka, Rankine or Coulomb:
  - cantilever walls: the simplified distributions of 3.11.5.6 (Figures 3.11.5.6-1 to -7), for sand, clay or rock;
  - anchored walls: the apparent earth pressure envelopes of 3.11.5.7 (trapezoidal, Figures 3.11.5.7.1-1 and -2;
    stiff and soft clay, 3.11.5.7.2).
- **Discrete elements:**
  - active pressure below the excavation on one element width b;
  - passive resistance over 3b, or the spacing if smaller (C3.11.5.6), for granular soil;
  - the actual width in rock or where arching can't develop.
- **Surcharges and water:**
  - live load surcharge (3.11.6.4) and uniform or strip surcharges (3.11.6.1, 3.11.6.2);
  - differential water pressure.
- **Load factors:** BDM Table 11-2 (EH, ES, LS), with the passive resistance factor φ = 0.75 (Table 11.5.7-1).

## Embedment and member design

- **Cantilever:** free-earth support by moment equilibrium about the toe, D = 1.2·D₀:
  - continuous elements in sand by Teng's method (C11.8.4.1, Eq. C11.8.4.1-1);
  - discrete elements by Figure 3.11.5.6-1's net pressures;
  - the largest moment at zero shear.
- **Anchored:** the anchor loads by the tributary area or hinge method (FHWA GEC 4 Ch. 5, AASHTO C11.9.5.1).
  Embedment below the excavation for the toe's reaction, and the moment between and below the anchors.
- **Vertical elements:**
  - steel flexure and shear (AASHTO Section 6, φ 0.90 and 1.0);
  - combined with the anchors' vertical components where anchored (axial load from inclined tiebacks, 11.9.4.1 bearing).
- **Sheet pile section:** a library of common hot-rolled Z and flat sections (section modulus, inertia, weight per
  foot of wall), or the properties entered.
- **Lagging:**
  - timber by its bending under the pressure reduced for soil arching (GEC 4 recommends tabulated thicknesses by
    soil and span; the table number to confirm from the manual);
  - precast concrete panels for permanent walls (5.6 flexure).
- **Anchors (11.9.4.2, 11.9.5.1):**
  - the tendon's resistance (φ 0.80 strand, 0.90 bar);
  - the grout-to-ground bond for the bond length (φ 0.65 or 0.70; presumptive bond stresses, Tables C11.9.4.2-1
    to -3);
  - the unbonded length past the critical failure surface (45° + φ/2, ≥ 15 ft for strand, 10 ft for bar).
- **Deflection (service):** optionally the p–y analysis already in ALLCON (`foundations/lateral.ts`) with the
  pressures above, for the top's movement against 3.11.1's tolerances.

## Outputs

- **The editor:** the wall's height, the soil layers behind and in front (γ, φ, c), water, surcharges, the element
  (section, spacing, embedment), the lagging, and the anchors.
- **Checks** by part (embedment, element, lagging, anchors).
- **The pressure diagram, with the shear and moment** down the element.
- **The calc package**, worked live.
- **Quantities:** piles (LF, or tons for sheets), lagging (SF), anchors (EA), and the shoring item.

## Phases and effort

1. **Cantilever** soldier pile and sheet pile walls: pressures, embedment, the element, lagging. **Medium.**
2. **Anchored walls:** apparent earth pressure, one or more anchor tiers, anchors, the toe. **Medium.**

## Validation

- FHWA GEC 4 Appendix design examples (a soldier pile wall with two tiers of anchors), if your copy has them.
- Hand calculations of the simplified methods; a closed-form cantilever sheet pile in uniform sand.

## To decide

1. **Both phases now**, or the cantilever first? Recommended: both. Anchored walls are where the hand work is.
2. **FHWA GEC 4** (FHWA-IF-99-015): do you have a copy? I'd use its lagging table, presumptive bond values and
   examples. It's a public FHWA document; I can look for it if you'd like.
3. **Sheet pile sections:** a built-in library of common Z and flat sections (recommended), or only entered properties.
4. **Temporary and permanent:** both, with temporary walls allowed the reduced passive width and timber lagging
   (recommended), or permanent only.

## Decided and built (2026-11-20)

The owner approved both phases on the recommended choices, and asked for published details to base the drawings on.

**Sources**
- FHWA GEC 4 (FHWA-IF-99-015), from fhwa.dot.gov.
- AASHTO LRFD 10th: 3.11.5.6, 3.11.5.7, 11.8, 11.9, Table 11.5.7-1.
- Caltrans Trenching and Shoring Manual, Appendix D (July 2025): the sheet pile section tables.
- WSDOT Standard Drawings 8.1-A3-1 to -5 (Soldier Pile / Tieback Wall) and WisDOT Standard 14.20 (Soldier Pile Wall),
  for the section and plan layout.

All of these are in `Downloads\Shoring wall details`, except GEC 4, which is in the scratchpad. They aren't committed.

**Built** (`src/lib/design/shoring/`, kind `shoring-wall`, "Soldier Pile and Sheet Pile Wall" under Walls)
- **Inputs:** the wall (soldier piles or sheets, cantilever or anchored, temporary or permanent), soil layers, uniform
  and live load surcharges, and water.
- **Elements:**
  - HP and W soldier piles, driven or in drilled holes;
  - PZ and PZC sheets.
- **Cantilever:** moment equilibrium about the toe with the factored pressures and φ·passive, then D = 1.2·D0.
  - Discrete piles take active on b and passive over 3b below the excavation (Broms 9c·b in clay).
  - Shear is checked down to the largest moment.
- **Anchored:**
  - AASHTO's apparent pressure envelopes (sand, stiff clay, soft clay), with the surcharges added as rectangles;
  - anchor loads by the tributary area or hinge method;
  - moments by statics above the top anchor, and p·l²/10 (tributary) or each simple span (hinge) below;
  - the toe's embedment for R.
- **Anchors:**
  - tendon φ·fpu·A;
  - pullout φ·π·d·τn·Lb, with presumptive τn by soil (the low end of AASHTO's ranges);
  - unbonded length to 45° + φ/2 plus max(H/5, 5 ft), at least 15 ft for strand or 10 ft for bar;
  - test load 1.33·DL ≤ 0.8·fpu·A;
  - bond length ≥ 15 ft.
- **Lagging:** GEC 4 Table 12 for temporary timber; bending under the full pressure for permanent timber.
- **Outputs:**
  - net pressure, shear and moment diagrams, or the envelope with the anchor loads;
  - the typical section (anchors, bond zones, the critical surface) and the plan (piles in their holes, lagging behind
    the flanges, or the Z sheets);
  - the calc package;
  - the take-off: piles LF, the wall SF (Soldier Pile Wall 504-08150 or Steel Sheet Piling 501), shoring LS
    (206-01750); lagging and anchors in the notes.

**Validation**
- GEC 4 Design Example 1 (10 m wall, two anchor tiers): the anchor loads, reaction and moment are within 3.5%. The
  difference is AASHTO's pa (Eq. 3.11.5.7.1-2 gives 2/3·Ka·γ·H² where GEC 4 has 0.65).
- A cantilever sheet pile in uniform sand matches D0 = H/((Kp/Ka)^(1/3) − 1) exactly.
- The tributary area and hinge methods carry the same total load.

## Built (2026-11-20): the rest

- **Sloping backfill:** Coulomb's ka (Eq. 3.11.5.3-1, δ = 0) for a backslope β, in the cantilever pressures and the
  sand apparent pressure; the slope is drawn in the section and used in the stability circles.
- **The cantilever stage** (GEC 4 5.5.1): excavated a set depth below the top anchor (2 ft by default), the wall checked
  as a cantilever for its embedment and moment.
- **Wales** for anchored sheet piles (GEC 4 5.4.3, Table 13):
  - two channels back to back, continuous over the anchors, w·l²/10, with shear;
  - drawn at each anchor.
- **Vertical capacity** (GEC 4 5.6, AASHTO 11.9.5.2): the anchors' vertical components plus 1.25 × the wall's own
  weight, carried below the excavation only.

  | | Sand | Clay |
  |---|---|---|
  | **Drilled-in** | β = 1.5 − 0.135√z (× N/15), qt = 1.2·N60 | α 0.55, qt = 9·Su |
  | **Driven** | β = tan(2/3·φ) with Ks = 1, qt by SPT | α 0.55, qt = 9·Su |

  φ from AASHTO Tables 10.5.5.2.3-1 and 10.5.5.2.4-1.
- **Basal heave** (GEC 4 5.8.2.2, Eq. 34) where the soil below the excavation is clay:
  - Nc = 5(1 + 0.2 H/B) ≤ 7.5, B′ = B/√2;
  - FS ≥ 1.5 temporary, 2.0 permanent.
- **Overall stability** (AASHTO 11.6.3.7, GEC 4 5.8.3), by Bishop's simplified method:
  - circles through the toe on a refined grid, and, for anchored walls, circles just behind each tier's bond zone;
  - anchors restrain by their unfactored load times the share of bond outside the circle;
  - a tension crack up to 2c/γ·tan(45° + φ/2);
  - FS ≥ 1/φ (φ 0.75, or 0.65 supporting a structure);
  - the critical circle is drawn.
  - Checked against Taylor's vertical cut in clay (H = 3.85c/γ): FS 1.006.
- **Deflection** of cantilevers (service, advisory):
  - p–y below the excavation (API sand, Matlock and Welch–Reese clays) under the shear and moment there;
  - plus the exposed part's bending as a cantilever.
- **Precast lagging:** a simple span between the piles, p·l²/8, or /12 with soil arching (GEC 4 Table 13); flexure and
  shear of the panel.

## Built (2026-11-20): deflection, seismic, seepage, timber grades

- **Anchored wall deflection:** the element as a beam on springs from the top to the toe (service).
  - Loads: the unfactored envelope and surcharges above the excavation, the active pressure below it.
  - Anchor springs: A·E/(Lu + Lb/2)·cos²θ, GEC 4's apparent free length, locked off at a set fraction of the design
    load (0.75 by default).
  - Soil below the excavation: linear springs from the p–y curves' initial moduli (API sand k·z; clays 67·Su).
  - Reports the largest movement and each anchor's load in service. The final stage only.
- **Seismic, Extreme Event I** (AASHTO 11.8.6, 11.9.6):
  - kh = As (or 0.5·As with movement shown acceptable);
  - Mononobe–Okabe active force distributed like the static pressure (11.6.5.3), with Seed–Whitman's 3/4·kh where M–O
    doesn't apply, and M–O passive with δ = 0 (conservative);
  - γ 1.0 and φ 1.0: cantilever embedment and moment; anchored loads, tendons, pullout, the toe, bond zones behind the
    seismic wedge (Zarrabi's angle) and the element;
  - overall stability with 0.5·As on each slice, FS ≥ 1/0.9;
  - the 11.5.4.2 note that As ≤ 0.4 isn't mandatory.
- **Seepage** under sheet pile walls (USACE EM 1110-2-2504, the hydraulic gradient method):
  - head lost evenly down the back and up the front, the pore pressures meeting at the toe;
  - i·γw added to the effective stress behind and taken from the passive side;
  - piping FS = (γ′/γw)/i ≥ 1.5 temporary, 2.0 permanent.
- **Timber lagging grades** (permanent lagging):
  - DF-L, Hem-Fir, SPF and Southern Pine grades from AASHTO Table 8.4.1.1.4-1, with board width, wet service,
    incising and Cλ;
  - Fb = Fbo·CKF·CM·CF·Cfu·Ci·Cλ (Eq. 8.4.4.1-1);
  - or a custom adjusted Fb.

## Built (2026-11-20): construction sequence, water in earthquakes, liquefaction, flow nets

Each is an on/off toggle, since not every wall needs it.

- **Construction sequence** (anchored, "Construction sequence in the deflection"):
  - for each anchor, excavate a set depth below it with the anchors above in place, then install and lock it off;
    finally excavate to the bottom;
  - Rankine active pressures at each stage, soil springs below that stage's excavation, each anchor's spring taking
    up the movement after its lock-off;
  - reports each stage's movement and anchor loads; the deflection check uses the worst stage.
- **Pore water in the earthquake** ("Pore water in the seismic pressures", Ebeling and Morrison 1992):
  - restrained water (low permeability): kh·γ/(γ − γw) in M–O on the buoyant weight;
  - free water (pervious, its own toggle): kh·(γ − n·γw)/(γ − γw), plus Westergaard's 7/8·kh·γw·√(hw·(z − zw)) on a
    sheet pile wall to the excavation;
  - AASHTO gives no method, so this follows the USACE report.
- **Liquefaction** ("Liquefaction", Idriss and Boulanger 2008, the empirical method AASHTO C10.5.4.2 points to):
  - saturated cohesionless soil behind and in front, every foot, with each layer's N60 and fines and the magnitude;
  - FS = CRR·MSF·Kσ/CSR ≥ 1.0;
  - where the soil in front liquefies, its passive resistance is lost in the seismic checks.
  - Checked against the CRR curve: (N1)60cs 15 gives 0.156.
- **Flow net** ("Flow net through the layers", sheet piles with seepage; USACE EM 1110-2-1901):
  - finite-difference seepage through layered, anisotropic soil (each layer's k and kh/kv) round the wall to an
    impervious base;
  - the pore pressures on both faces, the effective stresses from them, and the exit gradient for piping and the flow.

**Still not built**
- Residual strength of liquefied soil behind the wall, and lateral spreading.
- Transient seepage (drawdown), and seepage through soldier pile lagging.

## AASHTO checklist (complete, 2026-11-20)

The basic checks AASHTO LRFD 11.8 and 11.9 call for, and where each is in the tool.

| AASHTO | Check | In the tool |
|---|---|---|
| 11.8.2, 3.11.5.6 | Earth pressures, surcharges, water | Rankine or Coulomb (backslope) active; LS, ES; differential water |
| 11.8.3.1, 11.9.3.1 | Movement (service) | Cantilever by p–y; anchored by a beam on springs (option: staged) |
| 11.8.4.1 | Embedment, passive resistance (φ 0.75) | Moment about the toe, D = 1.2·D0 (3b for discrete piles) |
| 11.8.4.1, 11.6.3.7, 11.9.4.4 | Overall stability | Bishop circles, anchors' restraint |
| 11.8.5.1, 11.9.5.2 | Vertical element: flexure, shear | Piles (HP, W) and sheets (PZ, PZC); flexure φ 0.90, shear |
| 11.9.5.2, 6.9.2.2 | Axial load with flexure | Eqs. 6.9.2.2-1, -2 (anchored) |
| 11.8.5.2, 11.9.5.3 | Facing | Timber lagging (GEC 4 Table 12 temporary; Section 8 permanent, flexure and shear), precast or cast-in-place concrete; C11.8.5.2 moments |
| 11.8.6, 11.9.6 | Seismic (where needed; not mandatory for As ≤ 0.4, 11.5.4.2) | M–O, φ 1.0, overall stability φ 0.9 (toggle) |
| 11.8.7, 11.9.7 | Corrosion | Section loss per face on permanent steel |
| 11.9.4.1 | Bearing (vertical) | Side and tip resistance below the excavation |
| 11.9.4.2 | Anchor pullout | Eq. 11.9.4.2-1 |
| 11.9.4.3 | Passive below the excavation | The toe's reaction R |
| 11.9.5.1 | Anchor tendon and loads | Tributary or hinge; tendon φ; unbonded length; test load |
| GEC 4 5.4.3 | Wales (anchored sheets) | Two channels, w·l²/10 |

Every AASHTO check is in. The extras (staged construction, seismic water, liquefaction, flow net) are toggles for walls
that need them. Residual strength, lateral spreading and transient seepage are beyond these basic checks and aren't
planned.

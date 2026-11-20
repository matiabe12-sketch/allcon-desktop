# Sign structures (plan)

The next tool on the schedule (Wed 2026-12-02 slot): **overhead sign structures**, the steel above the drilled shaft that
the Cantilever Sign Foundation tool (`signs/cantilever.ts`) already designs. AASHTO LRFD Specifications for Structural
Supports for Highway Signs, Luminaires, and Traffic Signals (LRFD-LTS), with CDOT's S-614 standards.

> **Article numbers below are as I know them from LRFD-LTS-1 (2015) and its interims.** LRFD-LTS isn't in the reference
> library, and CDOT's S-614-50 and S-614-60 links on codot.gov no longer work; I check everything against your copies
> before the calc package cites it.

## Scope

1. **Cantilever sign structures:** the pole and arm (tapered round steel tubes) and their connections, added to the
   existing tool so it designs the whole structure, not only the shaft.
2. **Sign bridges:** two posts and a span over the roadway, as a truss or a monotube (your choice below), on a drilled
   shaft each (the existing shaft design, for each post's base forces).

## Loads (LRFD-LTS 3)

- Dead load: the steel, the sign panels and walkway (if any), ice where it applies (3.6).
- Wind (3.8): the pressure from the basic wind speed for the structure's MRI, with Kz, Kd, G and the drag coefficients
  of the tubes and panels. The existing tool already has these.
- Load groups: Extreme I (wind) and Service I, and the Strength I dead-load group (Table 3.4-1).
- Fatigue (11): galloping (cantilevers only), natural wind gust, and truck-induced gust, by the fatigue importance
  category, at the constant-amplitude fatigue threshold (infinite life).

## Members (LRFD-LTS 5)

- **Round tapered tubes (5.12):** the D/t class (compact, noncompact, slender, Table 5.7.2-1); flexure, axial, shear and
  torsion, combined (Eq. 5.12.2.1-1); second-order effects by the amplification factor (4.8).
- **Truss members** (sign bridges, if trusses): round tubes or angles in tension and compression (5.9, 5.10), the
  chords' and diagonals' welded connections.
- **Deflection (10.4):** the arm's and span's vertical deflection under dead load, the camber.

## Connections

- Base plate thickness and anchor rods (5.17): the rods in tension, compression, shear and their combination; the
  rods' grout and leveling nuts (5.17.4).
- The arm-to-pole flange plate and its bolts; the chord splices.
- Fatigue details (Table 11.9.3.1-1): the tube-to-base-plate weld (fillet, full-penetration with a backing ring, or the
  socket), the arm-to-pole connection, the handhole, the chords' welds, each by its category and ΔFTH.

## Outputs

- The editor: the structure's inputs (geometry, tubes, panels, wind, fatigue category), the checks grouped by member and
  connection, a drawing of the elevation, the pole and arm sections and the base plate.
- The calc package, worked live with the LRFD-LTS articles.
- Quantities: the structure (CDOT 614 items, by weight or each), the shaft as now.
- The shaft: the post's base forces passed to the existing foundation design.

## Phases and effort

1. **Cantilever pole and arm** with their connections and fatigue, inside the existing tool. **Medium.**
2. **Sign bridges** (truss or monotube), each post on a shaft. **Medium to large.**

## Validation

- The LRFD-LTS's design examples if your copy has them (the FHWA/NCHRP examples of a cantilevered sign and a sign
  bridge), and hand checks of each provision.
- A CDOT S-614 standard structure checked against its own selection tables (span, sign area, wind speed).

## To decide

1. Your copies of **LRFD-LTS** (which edition) and **CDOT S-614-50 / S-614-60** (the sign bridge and cantilever
   standards), uploaded to the reference library or linked.
2. Sign bridges: the **truss** (four-chord or three-chord box) or the **monotube**, whichever CDOT's S-614-50 uses.
3. Build phase 1 inside the existing Cantilever Sign Foundation tool (recommended: one design for the whole structure),
   or as a separate tool?

## Decided and built (2026-11-20): phase 1
- Sources: the owner's LRFD-LTS 1st Edition (2015), read throughout; CDOT's S-614-50 is "Static Sign Monotube
  Structures", so sign bridges are monotubes (codot.gov's S-614 sheet links answer 404 to automated fetches).
- Inside the Cantilever Sign Foundation tool ("Steel, connections and fatigue"). New designs start with it on;
  designs saved before keep their shaft alone until it's turned on.
- `signs/structure.ts`:
  - **Tubes:** D/t class (Table 5.7.2-1); Mn by Table 5.8.2-1; compression with Q (5.10.2); shear (5.11.2.1.1) and
    torsion (5.11.3.1.1); combined by Eqs. 5.12.1-1 to -3 with B = 1/(1 − Pu/Pe). φ 0.90, 0.90, 0.95 (5.5.3.2).
  - **Connections:** the anchor bolts (5.16, AISC Design Guide 1), the base plate, the arm's flange bolts (5.15).
  - **Fatigue:** galloping 21 IF psf, natural wind gust 5.2 Cd IF (Vmean/11.2)², truck gust 18.8 Cd IF over 12 ft,
    full to 20 ft and none at 33 ft; IF by Table 11.6-1. At the tube-to-plate welds, KF (Table 11.9.3.1-2) and KI
    (Eq. 11.9.3.1-1) set the threshold (detail 5.4 socket fillet: 7.0 / 4.5 / 2.6 ksi; 4.4–4.6 groove weld:
    10.0 / 7.0 / 4.5 ksi). Outside the equations' range, the detail's lowest threshold.
  - **Deflection (10.4.2):** the pole's top, 2.5% of the height under Service I; its slope, 0.35 in/ft under the
    arm's moment; the arm's tip, 8 in under galloping or truck gust (C10.4.2.2, advisory). The arm's dead load
    deflection is reported for camber; there is no limit.
- `structure-calc.ts`: the calc chapter. Tests `structure.test.ts`: NCHRP Report 796 Example 9 (Fort Collins
  monotube with a DMS; Maryland SHA's comparison):
  - sign wind 7.32 kip;
  - natural wind gust 1.188 kip and 27.5 kip·ft;
  - truck gust 1.085 kip and 26.04 kip·ft, all matched.
- Not yet:
  - **phase 2, sign bridges** (two monotube posts and a span, each post on the shaft design);
  - the steel's quantities (CDOT 614 item);
  - the hexadecagonal (16-sided) tubes;
  - stiffened base connections.

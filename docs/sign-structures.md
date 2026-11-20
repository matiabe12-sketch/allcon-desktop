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

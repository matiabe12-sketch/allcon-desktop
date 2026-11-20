# Pot and disc bearings (2026-11-20)

High-load multirotational bearings, AASHTO LRFD 14.7.4 (pot) and 14.7.8 (disc), with their sliding surfaces (14.7.2),
guides (14.7.9), plates and anchorage (14.8), and the concrete under them (5.6.5). One design kind,
`pot-disc-bearing`, for either, fixed, guided or free (non-guided).

Sources: AASHTO LRFD 10th, Section 14; the AISI/NSBA Steel Bridge Bearing Selection and Design Guide, Vol. II Ch. 4
(its pot bearing design method and worked example, the benchmark); the WisDOT Bridge Manual Ch. 27 (the design
steps and articles; the 15% shear-restriction force). The manufacturer designs these bearings in practice (WisDOT 27.2);
this tool sizes and checks them to the provisions so the plans can give the loads and an assumed height, and the
details are drawn.

## Checks
- **Design rotation** (14.4.2.1): θu = the strength limit state's rotation + 0.005 rad for uncertainty + the
  construction tolerance (0.005 rad unless a quality control plan sets less).
- **Pot** (14.7.4): the elastomer's average stress ≤ 3.5 ksi at service; the minimum vertical load ≥ 20% of the design
  load (14.7.4.1); hr ≥ 3.33 θu Dp (14.7.4.3); the sealing rings (14.7.4.5: flat brass, width ≥ max(0.02 Dp, ¼ in),
  thickness ≥ 0.2 of the width; circular, diameter ≥ max(0.0175 Dp, ⅜ in)); the cavity's depth for the pad, the rings,
  the rotation (0.5 θu Dp) and the rim; the wall tw ≥ Dp σu / (2 φ Fy) and ≥ √(40 Hu θu / Fy) (14.7.4.6); the base
  ≥ max(0.06 Dp, ¾ in) on concrete (0.04 Dp, ½ in on plates) and ≥ tw; the piston ≥ 0.06 Dp, its rim's contact width
  ≥ 2.5 Hu / (Dp Fy) and the clearance to the wall ≥ θu (w − θu Dp / 2), at least 0.02 in (14.7.4.7).
- **Disc** (14.7.8): the urethane's average stress ≤ 5.0 ksi; its instantaneous deflection ≤ 10% of its thickness; no
  lift-off at its edge under the minimum load and θu (the urethane's apparent modulus from the manufacturer, an input);
  the shear-restricting mechanism (a central pin) for the larger of the factored horizontal force and 15% of the service
  vertical load (14.7.8.4); the plates ≥ 0.045 Dd on steel, 0.06 Dd on concrete or grout (14.7.8.5).
- **Sliding surface** (guided and free): the PTFE's average contact stress, permanent and total (Table 14.7.2.4-1), the
  friction force passed on (μ, Table 14.7.2.5-1), the stainless mating surface's size for the movement.
- **Guides** (guided, 14.7.9): each guide bar's bending and its PTFE contact stress under the horizontal force.
- **Plates and anchorage:** the masonry plate on the concrete (5.6.5, φ 0.70, √(A2/A1) ≤ 2) and its thickness as a
  cantilever from the pot or disc; the anchor rods in shear (14.8.3.1, 6.13.2.12); the sole plate's bearing on a
  concrete girder.

## Details
- 2D: the section through the assembly and its plan, dimensioned (masonry plate, pot or disc with its plates, piston,
  rings, PTFE and stainless, sole plate, guides, anchor rods), in the editor, calc package and take-off.
- 3D: the bearing drawn as its parts (IfcBearing, POT or DISK) in the Bridge's model and its rebar view, at every girder
  line of a support that takes pot or disc bearings.

## Status (2026-11-20)
Built: the engine (`src/lib/design/bearings/pot-disc.ts`, `sizeHlmr` and `designHlmr`), the parts and views
(`pot-disc-detail.ts`), the calc package (`pot-disc-calc.ts`), the editor, the take-off (pay item 512-00118) and the
Bridge integration:
- Supports → Bearings: each support's type, elastomeric, pot or disc (`SupportLine.bearingKind`).
- The load path designs a pot or disc support's bearing as kind `pot-disc-bearing` from the girder's reactions,
  rotation and the support's horizontal forces (`hlmrFromBridge`). A sliding one takes no stiffness along the bridge
  and passes μ·DL to the substructure; a fixed one is rigid.
- The 3D model draws each part at every girder end on that support, x along the girder.
- Tests: `pot-disc.test.ts`, with the AISI/NSBA guide's pot (Dp 450 mm, hr 30 mm, rings 9 × 2 mm, piston 27 mm) as the
  benchmark.

Not yet: the anchor rods as bars in the rebar schedule (they are drawn, and paid inside the bearing).

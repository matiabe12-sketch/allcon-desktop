# Modular and finger joints (plan)

Two tools beside the Strip Seal Joint, for the bridges whose movement passes a strip seal's 4 in: the **Modular Joint**
(`modular-joint`) and the **Finger Joint** (`finger-joint`), and the Bridge choosing or recommending the joint at each
expansion support. AASHTO LRFD 10th Edition, Section 14.5; CDOT BDM Section 14 (April 2025) where it says more.

## What the codes say

### Selection (CDOT BDM 14.4.4–14.4.6, AASHTO 14.5.2)
- Strip seal: total movement 4 in or less and skew 25° or less (BDM 14.4.4). Over 25° an oversized gland, if the total
  factored movement is 5 in or less and the thermal part 3.5 in or less (Unit Leader approval).
- Modular: over 4 in (BDM 14.4.5). Avoid by using several strip seals where possible; needs Unit Leader approval on new
  bridges; never at either end of an approach slab. Sized in 3 in steps, 6 in the least (0–6, 0–9, 0–12 …), one
  continuous unit (no field splice without approval; then welded or hybrid, never fully bolted). The manufacturer designs
  it to AASHTO for fatigue and fracture, sealed calcs reviewed by the engineer of record (BDM 14.6).
- Finger: CDOT allows them only to replace existing finger joints (BDM 14.4.6). Sections 6 ft or less; tapered fingers;
  an elastomeric or metal trough under them.

### Movement and gaps (AASHTO 14.5.3.2, 14.5.6.9.2, 3.12.2)
- Movement as the strip seal already works it out: TU with γTU, creep and shrinkage, normal to a skewed joint, from the
  contributing length (to the neutral point).
- Surface gap at the strength movement: 4.0 in for a single gap, 3.0 in each for modular gaps.
- Modular joints add to the movement: +1.0 in along, 1.0 in across, 1.0 in vertical, 1° about the two horizontal axes,
  0.5° about the vertical (Table 14.5.6.9.2-1).
- Finger plates at the strength movement: the overlap 1.5 in or more; the gap between fingers 2.0 in or less where the
  opening along the bridge exceeds 8.0 in, 3.0 in where it is 8.0 in or less.
- The setting table: the gap for each installation temperature (14.5.5.1), as the strip seal's.

### Modular joint structure (AASHTO 14.5.6.9)
- Loads: the design tandem (12.5 kip wheels) for strength, IM 75% (Table 3.6.2.1-1, deck joints), horizontal 20% of
  (LL + IM) along the top; for fatigue the truck's 32 kip axle as a 16 kip tandem pair 4 ft apart, IM 75%, Fatigue I
  (42 kip axle range). Wheels 72 in apart, each a 20 in line load on the beam. Both tandem axles where the opening passes
  4 ft. The lane load isn't used.
- Distribution (14.5.6.9.5): an edgebeam takes 50%; a centerbeam by its top width (2.5 in or less 50%, 3.0 in 60%,
  4.0 in 70%, 4.75 in 80%, interpolated), the rest shared by its neighbours.
- Strength I (14.5.6.9.6): centerbeam as a continuous beam over the support bars, gaps fully open, compact sections,
  Mp; anchors by 6.10.10.4.3 and ACI 318 breakout.
- Fatigue (14.5.6.9.7): infinite life, Δf ≤ ΔFTH. Welded multiple-support-bar (WMSB) systems: Type A cracking at the
  centerbeam weld, √(SRB² + SRZ²) with SRB = MV/Sx + MH/Sy and SRZ = MOT/SW + RV/AW (14.5.6.9.7b-1 to -4); Type B at
  the support bar (-5 to -7); Category C for a full-penetration centerbeam-to-support-bar weld. Gap at mid-range.
- Edgebeams at least 0.375 in; the prescriptive anchorage (0.5 in studs 6 in long at 12 in, Grade 50) needs no
  calculation (C14.5.6.9.6). In snow regions with skew over 20°, the snowplow load, 0.12 kip/in over 10 ft
  (14.5.1.2, 14.5.3.6).

### Finger joint structure (AASHTO 14.5.3.4, 14.5.3.6–7)
- Fingers designed as cantilevers for the wheel at the strength limit state, at the largest opening; tandem wheel
  12.5 kip with IM 75% on its 20 × 10 in contact (3.6.1.2.5), the share on the fingers under it; plastic moment and
  shear at the finger's root (6.12); fatigue at the root as infinite life for the Fatigue I truck.
- Anchorage: fully torqued high-strength bolts, cast-in anchors in new concrete (14.5.3.7); the edge armor's studs
  (14.5.3.6).

## What the tools do

### Modular Joint (`modular-joint`)
Inputs: the movement inputs the Strip Seal has (length, skew, α, creep and shrinkage, temperatures, γTU), the joint's
gaps (3 in each), the centerbeam (top width, depth, section), the support bar (section, span between support boxes),
support-bar spacing along the joint, roadway width and lanes, snow region.
- Sizing: the number of seals, the joint's size in CDOT's 3 in steps (0–6 in at least), with Table 14.5.6.9.2-1's
  additions; the gap per seal at the coldest and hottest; the setting table for installation temperatures.
- The designer's check of the structure (what the plans and the shop-drawing review need): centerbeam and support bar
  at Strength I and fatigue Type A and B, edgebeam thickness, anchors (prescriptive or checked), snowplow load.
- Details: a section across the joint (edgebeams, centerbeams, seals, support bars and boxes, blockout) and a plan
  (support bars under the centerbeams), with the blockout's width and depth; the setting table.
- Take-off: 518-010xx Bridge Expansion Device (0–6 / 0–9 / 0–12 in) by the foot along the joint.

### Finger Joint (`finger-joint`)
Inputs: the movement inputs; finger plate thickness, finger width, gap between fingers, finger length; support (a
cantilever from the armor), bolts; the trough.
- Checks: overlap ≥ 1.5 in and the finger gap at the largest opening; the finger as a cantilever (strength and
  fatigue); the plate's bolts; CDOT's note that finger joints are for replacements only (an advisory).
- Details: a section along the bridge (both plates, the fingers at mid-range, the trough) and a plan of the fingers
  meshing; the setting table.
- Take-off: 518-01201 Bridge Expansion Device (Type 1)? — to confirm with you (CDOT has no finger item; a special item
  otherwise).

### In the Bridge
- Supports → each expansion support's joint: **Recommended** (the default), strip seal, modular or finger.
  Recommended picks by CDOT's rules from the movement the load path works out: strip seal to 4 in and 25° skew;
  an oversized strip seal note between 4 and 5 in; modular above; finger never on its own (replacement only). It says why
  in the joint's notes.
- The load path upserts the chosen kind at `joint-k` (the strip seal's key), from the same contributing length and
  skew (`jointFromBridge`), and the design links follow the kind. Loads: the joint takes no load off the bearings or
  the backwall in the model (its wheel loads are local, and the backwall is already designed for the wheels on it), so
  nothing is counted twice.
- 3D: all three joints drawn at the deck's end across the roadway, as their parts (edge rails and seal for the strip
  seal; edgebeams, centerbeams and support bars for the modular; the two finger plates for the finger), in the model
  and its rebar view. Today no joint is drawn in 3D.

## Benchmarks
- Strip seal: CDOT BDM Appendix A Example 5 (already in the Strip Seal tests).
- Modular: the AASHTO commentary's numbers (21 kip on one centerbeam ≤ 2.5 in wide, 0.525 kip/in over 20 in), and the
  NCHRP Report 402 (Dexter et al. 1997) design example's centerbeam stress ranges — if a copy is in the library.
- Finger: a published DOT finger-joint calculation (Iowa DOT LRFD manual 5.8.3.3, or the MoDOT SEG 18-01 design).

## To decide
1. Finger joints: build them fully (cantilever checks, details, 3D), or as a lighter tool since CDOT allows them only
   as replacements?
2. Modular joints are designed by the manufacturer under CDOT. Should the tool also check the centerbeams and support
   bars (a preliminary design and review aid, as above), or only size the joint, gaps and blockout for the plans?
3. The finger joint's pay item.

## Decided (2026-11-20)
1. Modular: **size only.** Movement with Table 14.5.6.9.2-1's additions, the seals and CDOT size, the gaps, the setting
   table, the blockout and CDOT's rules. The centerbeams and support bars are the manufacturer's design (BDM 14.4.5),
   listed on the plans as what the shop drawings must show; the tool doesn't check them.
2. Finger: the full tool.
3. Finger pay item: 518-01201 Bridge Expansion Device (Type 1), by the foot.

## Status (2026-11-20): built
- `src/lib/design/joints/modular.ts` (`designModular`, `modularSize`), `finger.ts` (`designFinger`, `sizeFinger`),
  `detail.ts` (parts for the strip seal, modular and finger joints; views; take-offs), `modular-calc.ts`,
  `finger-calc.ts`; editors in `src/components/design/joint-editors.tsx`; kinds `modular-joint` and `finger-joint`.
- Finger strength: the truck's 16 kip wheel (3.6.1.2.2), IM 75%, γ 1.75 and m 1.2 (one lane, 3.6.1.1.2), spread over
  the tire's 20 in on one plate's fingers, at the farthest the tire can sit. Fatigue I: 16 kip, IM 75%, γ 1.75 against
  the threshold of the root's category (A where cut from the plate). Bolts: the plate pivots on the support's edge,
  the tire's width spread at 45° to the bolt line; tension (6.13.2.10.2) and fatigue (31 ksi on 0.75 Ab).
- Bridge: Bearings → each abutment's expansion device (Recommended, strip seal, modular, finger). The load path picks
  the kind (`recommendJoint`: strip seal to 4 in, with an oversized gland past 25°; modular above), upserts it at
  `joint-k`, and says why in the verdict. The 3D model draws the linked joint's parts (IfcPlate, EXPANSION_JOINT) at the
  deck's end over a seat abutment or the approach slab's far end behind an integral one; they show in the rebar view
  ("joint").
- Tests: `modular-finger.test.ts` (hand checks of the movement and the finger's wheel, calc packages, parts, 3D, links).

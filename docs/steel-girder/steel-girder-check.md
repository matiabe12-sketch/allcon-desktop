# Steel Girder Design Check

Design type `steel-girder-check` (Superstructures, next to the prestressed girder check). It checks a
composite rolled or plate I-girder line, one to several continuous spans, to AASHTO LRFD 10th
Article 6.10, and its details (phase 2).

## Code

- `src/lib/design/girders/steel.ts`: inputs, defaults (FHWA Steel Bridge Design Handbook Example 2A),
  and the engine `designSteelGirder`.
- `steel-section.ts`: section properties for the steel, n, 3n and steel-plus-bars stages, the plastic
  moment (D6.1), and self-weight. `w-shapes.ts` holds the W shapes from the AISC table.
- `steel-beam.ts`: a nonprismatic FE beam. It gives the support-moment influence lines that
  `continuousBeam` (in `continuous.ts`) then uses for its HL-93 envelopes, and the deflection influence
  lines for live load deflection and camber.
- `steel-details.ts` (phase 2): fatigue categories and resistance, studs, transverse and bearing
  stiffeners, and the web at a bearing, as pure functions.
- `steel-appendix.ts` (phase 3): yield moments in negative flexure (D6.2.3), Appendix A6, and the B6
  effective plastic moment and redistribution moment. `steel-crossframe.ts` and `l-shapes.ts`: the
  cross-frames and the AISC equal-leg angles.
- `steel-connection.ts` (phase 4): the cross-frame members' end connections (6.13). `steel-appendix.ts`
  also holds B6.6, the refined method (θRL, kθ, the continuity solution).
- `steel-grid.ts` (phase 5): the grid of the whole bridge (refined analysis, 4.6.3.3).
- `steel-calc.ts`: the calc package. `steel-girder-editor.tsx` and `steel-girder-sketch.tsx` are the UI.
- Distribution factors reuse `distributionFactors` from `prestressed.ts`, with shape `"steel"`.

## Method

- **Staged loads (6.10.1.5).** DC1 is carried by the steel, DC2 and DW by the 3n section, and LL+IM by
  the n section. Each analysis uses the girder's own stiffness along its length.
- **Negative flexure.** The section is the steel plus the deck's bars (6.10.1.1.1c). Service II uses the
  composite section in negative flexure when studs run throughout (6.10.4.2.1).
- **Distribution factors.** Positive moment per span uses Kg at mid-span. Negative moment per pier uses
  the average of the adjacent spans. Shear includes the skew correction. The fatigue truck uses the
  one-lane factors divided by 1.2 (3.6.1.4.3b).
- **Strength, service and constructibility checks:**
  - positive flexure, compact and noncompact (6.10.7), with the 1.3RhMy cap in continuous spans;
  - ductility;
  - negative flexure, FLB and LTB with Cb and Rb (6.10.8);
  - shear: unstiffened, stiffened with tension field, and end panels (6.10.9);
  - constructibility (6.10.3);
  - Service II (6.10.4.2.2);
  - proportions (6.10.2);
  - 1% deck bars (6.10.1.7);
  - LL deflection at L/800 (2.5.2.6.2).
- **Fatigue (phase 2).**
  - The fatigue truck (30 ft rear axles) by influence lines, with IM 15%.
  - Stresses are taken at the flanges' inner faces. The deck counts in negative flexure where the studs
    run throughout with the 6.10.1.7 bars (6.6.1.2.1). Details in net compression are skipped.
  - Each region (positive, negative) has its own category for the flange attachments. The top flange
    is also checked as C at the studs (9.1).
  - The ADTT sets the load combination: Fatigue I (1.75) with the threshold, or Fatigue II (0.80) with
    (A/N)^(1/3). Cycles per truck are 1.5 within 0.1L of a pier.
  - The web's special check (6.10.5.3) applies to stiffened interior panels.
- **Shear connectors (phase 2).** These follow the 10th Edition provisions.
  - Fatigue pitch: p ≤ nZr/Vsr, with Zr from Condition 9.2 (slope 5, threshold 7 ksi).
  - Strength: Qn = 0.70 Asc Fu with φsc = 1.0. The number from each span's point of most positive live
    load moment to the end is Pp/Qr. To a pier centerline it is (Pp + Pn)/Qr.
  - Pitch limits; studs across the flange; height ≥ 5d. Penetration and cover are advisory.
- **Stiffeners (phase 2).**
  - Transverse stiffeners per zone: projecting width (6.10.11.1.2), and It against It1/It2. Where a
    panel uses tension field, ρw applies (Eqs. 6.10.11.1.3-7/-8).
  - Bearing stiffeners at every support, from the Strength I reaction: width-thickness, bearing
    1.4ApnFys, and axial (9tw of web each side, KL = 0.75D, φc = 0.95).
  - Without bearing stiffeners, the web's local yielding and crippling (D6.5) are checked; a plate
    girder is flagged as needing stiffeners.
- **Camber (phase 2, report).** Deflections at the tenth points: the steel and deck on the steel
  section, and DC2 and DW on the 3n section.
- **Appendix A6 (phase 3, option).** Negative flexure in the moment format where A6.1 applies (Fy ≤ 70,
  2Dc/tw ≤ λrw with crw by Eq. A6.1-4, Iyc/Iyt ≥ 0.3) and the unbraced length is prismatic:
  - Rpc, Rpt (A6.2);
  - FLB with kc (A6.3.2);
  - LTB with J, Lr and Fe (A6.3.3.1, A6.3.3.2);
  - Mnt = Rpt Myt (A6.4).

  Myc and Myt follow D6.2.3: DC1 factored on the steel, the rest on the steel and bars, and Myt the
  smaller of the top flange's and the bars' (at their own fy).
- **Appendix B6 (phase 3, option, simplified method).** Applied only if every pier meets B6.2:
  - B6.2 limits: skew ≤ 10°, Fy ≤ 70, B6.2.1 web, B6.2.2 flange, prismatic, B6.2.4 bracing,
    Vu ≤ φvVcr, bearing stiffeners.
  - Mpe by B6.5.1 (enhanced) or B6.5.2.
  - Mrd = |Me| − φMpe, at most 0.2|Me|, at strength and at Service II.
  - Redistribution moment diagram linear between the piers, zero at the abutments.
  - Flexure is not checked within the pier's adjacent unbraced lengths. Elsewhere Mrd is added: in
    positive flexure on the 3n section, and the 1.3RhMy cap is dropped.
  - Service flange limits are skipped from the pier to the nearest transition or contraflexure point.
- **Deck pour sequence (phase 3).** Pours are placed in order:
  - Wet concrete (1.4 DC, 3.4.2.1) sits on the steel where the deck is still wet, and on the n section where
    earlier pours have hardened.
  - Flange checks are made at every stage with the steel's resistance (Cb = 1). These replace the
    single-placement flange checks.
  - The hardened deck's tension is checked against fr, or the 6.10.1.7 bars are required (6.10.3.2.4).
  - Camber sums the deck's deflections stage by stage.
- **Cross-frames (phase 3).** X or K frames as torsional braces for the deck's placement (1.4 DC1, Cb = 1),
  checked per span and at each pier:
  - (βT)act from βbr (Eqs. 6.7.4.2.2-8/-9 with 0.65A), βsec (∞ for full-depth frames on full-depth
    plates, else Eq. -12) and βg (Eq. -13), against (βT)req (Eq. -2 or -3, φsb 0.8).
  - Member forces from Mbr (Eq. -14/-15).
  - Wind on the fascia girder's bottom half, W = PD d/2 (C4.6.2.7.1), Strength III (site V) and
    Strength V (80 mph), as the strut force.
  - Single angles by (Kℓ/r)eff (6.9.4.4), φc 0.95; ℓ/rz ≤ 140 (6.9.3); leg b/t.
- **Stud pitch zones (phase 3).** Each zone sets its own pitch. The counts for strength integrate the
  rows along the girder. Where the deck isn't composite over the piers, the 6.10.10.3 extra connectors
  nac = As fsr/Zr are reported.
- **Reactions.** Unfactored DC, DW, truck+IM and lane per girder, the way the NSBA plans tabulate them.

## Phase 4: connections, wind, refined redistribution, curvature

- **Cross-frame connections (6.13).** Each single angle connects through one leg to the connection plate,
  either by pretensioned slip-critical bolts in one line or by two fillet welds along the leg.
  - Bolts: shear 0.56 or 0.45 Ab Fub (10th Edition), bearing 1.2 Lc t Fu ≤ 2.4 d t Fu, and slip at Service II
    (Kh Ks Ns Pt; Ks 0.30, 0.50 or 0.30 for Classes A, B and C).
  - The angle in tension (U from Table 6.8.2.2-1: 0.60 or 0.80, or 1 − x̄/L) and block shear (6.13.4,
    Rp 0.9 for punched holes); at least two bolts, spacing 3d, and the minimum end distance.
  - Fatigue (6.6.1.2.3) when a force range is given: Δf = ΔP / (U Ag); category B (drilled), D
    (punched, the default for cross-frames) or E′ (welded single angles, after the full-scale tests);
    1 or 2 cycles per truck by girder spacing (Table 6.6.1.2.5-2).
  - A line girder gives the cross-frames no live load force. The Service II force for slip is the
    deck placement's force divided by 1.5, unless one is entered from a refined analysis.
  - On a curved bridge the cross-frames are primary members: the connection takes 75% of the member's
    resistance at least (6.13.1), and ℓ/rz ≤ 120.
- **Wind on the bottom flange (C4.6.2.7.1).** On the exterior girder (not an interior-only check) at
  Strength III (with the site's wind speed) and Strength V (80 mph, LL 1.35).
  - W = η γ PD d / 2 and Mw = W Lb² / 10 give fℓ on tf bf² / 6.
  - Compression flanges are amplified by Eq. 6.10.1.6-4 where Lb > 1.2 Lp √(Cb Rb / (fbu/Fyc)).
  - Checks: Mu + fℓ Sxt / 3 (compact positive), fbu + fℓ/3 (6.10.8 and noncompact), Mu + fℓ Sxc / 3
    (A6), and fℓ ≤ 0.6 Fyf.
  - B6 is recomputed for each combination with Mn less fℓ Sxc / 3.
- **B6.6, refined method.**
  - kθij come from the pier moments' flexibility on the short-term composite section with the deck
    effective throughout (B6.6.1).
  - Each pier meeting B6.2 may yield on the curve M/Mn = 0.7 + 60θp to 0.005 rad, then 1.0 to θRL
    (Eqs. B6.6.2-1, -2); the others stay elastic. Strength uses φf, service the nominal curve.
  - The descending branch past θRL isn't used: θp > θRL fails.
  - The redistribution moments are applied as in the simplified method, without the 20% limit.
  - Example 2A: θp 0.0047 rad against θRL 0.0289; Mrd 776 kip·ft (simplified 677).
- **Curved girders within 4.6.1.2.4b.** The girder is analyzed straight on its arc spans when
  Las / R < 0.06 for every span (Las 1.0, 0.9 or 0.8 of the arc span) and the bearing lines are within
  10° of radial; otherwise the check fails and a refined analysis is needed.
  - Lateral bending by Eq. C4.6.1.2.4b-1 with N = 10, on both bare flanges during construction and pours
    (compression flanges amplified), and on the bottom flange at strength (fℓ/3) and Service II (fℓ/2).
  - Composite sections in positive flexure are noncompact (6.10.6.2.2); A6 and B6 don't apply
    (6.10.6.2.3, B6.2).
  - The cross-frames take the V-load approximation's forces: a radial force M ℓ / (R D) at the struts,
    and bay shears from the girders' torques M ℓ / R by equilibrium, linear in the girders' offsets.

## Phase 5: the grid (refined analysis) and wind during construction

- **Wind during construction (Strength III on the bare steel).** Give the wind speed while the deck is placed.
  - It applies to the exterior girder, on 1.25 DC1 with the deck wet, which can't yet act as a diaphragm.
  - The girder's lower half loads the bottom flange; its upper half, with the haunch and the wet deck, loads
    the top flange.
  - Each flange: Mw = W Lb² / 10 + W L² / (8 Nb) (Eq. C4.6.2.7.1-3, no wind bracing).
  - The compression flange's fℓ is amplified; the checks are 6.10.3.2.1-1, -2, 6.10.3.2.2-1 and fℓ ≤ 0.6 Fy.
  - The cross-frames take W Lb at each brace point.
- **The grid (Analysis: grid).** A plane grid of every girder, cross-frame and (composite) deck strip.
  - Three degrees of freedom per node: deflection and rotation about X and Y. Solved by banded Cholesky.
  - Girders: beam elements in bending and torsion. The torsion uses J raised for warping restrained at the
    brace points: Jeq = J / [1 − (2/λLb) tanh(λLb/2)], λ = √(GJ/ECw), from Vlasov's theory.
  - Cross-frames: each frame's truss (single angles at 0.65 A) condensed onto its two girders' deflection
    and twist, which also gives its members' forces.
  - Deck: transverse strips (Ec, or Ec/3 at 3n) in bending and torsion.
  - Curved girders are concentric arcs. Skewed supports sit on the bearing lines, with their cross-frames
    along them; intermediate cross-frames are normal or radial.
  - Dead loads go from the deck to the girders by the lever rule: deck, SIP forms, barriers at the deck's
    edges, the wearing surface over the roadway.
  - **Live load by adjoint influence surfaces.** One solve per response, Kλ = c.
    - HL-93: the design truck (14 or 30 ft rear axles) or tandem with the lane, each lane's vehicle placed
      for the extreme along it. For negative moment, 90% of two trucks with 90% of the lane.
    - Lanes are 12 ft wide anywhere across the roadway (dynamic programming), wheels 2 ft from the lane's
      edge, with the multiple presence factors.
    - The fatigue truck alone: its range at one transverse place.
  - The girder checked takes the envelope of the interior, exterior or all girders, as chosen. The
    cross-frames take the grid's Strength I, deck-placement (with the stability bracing's), Service II and
    fatigue forces, so their connections' fatigue and slip come from the grid.
  - Curved bridges outside 4.6.1.2.4b are designed this way. fℓ is still from Eq. C4.6.1.2.4b-1, on the
    grid's moments.
  - Deflection, camber and bearing reactions stay the line girder's.
  - Benchmarks (steel-grid.test.ts):
    - Statics: wL²/8 on every girder, zero cross-frame forces, and the shared moment summing back.
    - HL-93 on a 100 ft span: two lanes of 1520 × 1.33 + 800 kip·ft exactly; the fatigue truck exactly.
    - A curved simple span against the rigid cross-section solution, the V-load method's equilibrium
      (outside girder 1 + 0.104 x n L² / (R Σx²) of the average): within 3%.
    - Example 2A: DC1 within 3% of the line girder's, the live load 7% below AASHTO's distribution
      factors, and every check passing.
  - Dead loads use consistent nodal loads with the elements' fixed-end forces, so the support shears are
    exact.
  - **FHWA Design Example 3 (curved, R 700 ft, 160-210-160 ft), against its 3D finite element results**
    (steel-benchmarks.test.ts, data in steel-ex3.fixture.ts, each girder's own plates from Figure 3):
    - Abutment reactions per girder within 5% (or 1 kip) for the deck, railings and FWS.
    - The curve's sharing, G4 (outside) over G1 (inside), within 5% for the deck and live load and 8% for
      the railings.
    - Its moments are 5–16% higher than the grid's, for the inside and outside girders alike, while its
      reactions agree with ours. A girder line with its own reactions gives our moments, so its moments
      can't be squared with statics from the published numbers. Its live load also includes centrifugal
      force, which isn't modeled here. Until that's explained, treat the grid's curved-bridge moments as
      possibly up to about 15% low against a 3D analysis.

## More benchmarks (steel-benchmarks.test.ts)

- **Caltrans BDP 6.2 (October 2022), 110-165-125 ft, 78 × 5/8 in web.**
  - Constant-stiffness dead and one-lane HL-93 moments within 1%; the abutment's live load shear within
    2.5%.
  - The engine's interior distribution factors 0.900, 0.805, 0.869 (moment) and 1.082 (shear) from its own
    section (Kg 3,026,891 in⁴).
  - Mp 21,203 kip·ft and Dp 12.75 in; My 15,274 and the 1.3 Rh My cap 19,856 kip·ft (the California Mn
    formula gives the same here, as the cap governs).
  - Appendix A6 at bent 3: Rpc 1.033, Mnc 14,690 kip·ft.
  - Not used: the P15 permit truck and the other California amendments.
- **FHWA/NHI-04-041, two 120 ft spans.**
  - Tables 3-4 and 3-5 section properties exactly.
  - Positive section: Mp 7,419 kip·ft with the plastic neutral axis 6.85 in into the slab; My 4,592 from its
    factored dead loads; Mn = 1.3 Rh My = 5,970 kip·ft (the same cap under the 10th Edition).
  - Pier shear: C by the 10th Edition's 1.57 (the example's 2nd Edition 1.52 gives its 0.378).
  - Abutment bearing stiffeners, 5.5 × 11/16 in: Is 87.22 in⁴, r 2.69 in, Pn 593.3 kip; bearing now 1.4 Apn Fys
    (the example's 309.4 kip has no 1.4).
  - LL+IM with its 0.696 factor: 0.4L within 1%, the pier within 3.5%.
  - Its dead load moments come from an analysis whose stiffness isn't given. Per klf on the girder alone they
    solve to 843 at 0.4L and −2,213 at the pier, against 770 and −2,396 here with the same properties. Not
    used.
- **NSBA Continuous-Span Standards (AASHTO 10th Edition), 16 of the 224 models, run in LRFD SIMON 10.5.**
  - The sample: the middle span length of each set, 1 to 4 spans, 8 to 14 ft spacing.
  - This was a local comparison, not a committed test: the program and its models stay on the owner's
    machine.
  - Exterior distribution factors match. Interior moment factors are within 1.7%; the program uses a
    weighted-average Kg.
  - Strength flexure (positive and negative) is within about 1.5%, and fatigue within 1%.
  - Service II is within 1% on 15 of the 16 models.
    - This needs two engine fixes, made then:
      - The deck stress for the 2fr test of 6.10.4.2.1 is taken at the deck. Without the 2fr test the deck
        counted as effective at the piers.
      - B6.3.2.1 leaves the pier's flange stress checks out at any qualifying pier, not only where the service
        redistribution moment is nonzero.
    - Example 2A was written to the 5th Edition, so it doesn't check 2fr. Its pier deck cracks under the 10th
      Edition (1.106 > 0.96 ksi).
    - The exception is the 3-span, 14 ft model: the program reports 0.949 and ours is 0.829. Still open.
  - Constructibility, after two 10th Edition fixes, is within about 2% on single spans and 4% on multi-span
    girders.
    - The fixes: 1.4 DC on the erected steelwork (3.4.2.1, the program's factor too), and the brackets'
      lateral bending amplified with curvature's (Eq. 6.10.1.6-4).
    - Single spans' web bend-buckling now matches exactly (0.965).
    - The rest is the input: the engine takes one bracket fℓ for the girder, which the comparison worked out
      from the first section's top flange. The program works it out from the bracket moment at each section.
      On the 3-span, 10 ft model that is 6.22 ksi on span 3's smaller flange against 4.44. Fnc agrees there
      (36.21 ksi).
  - Shear (after the panel change below) matches where both check the same panel: 0.875, 0.697 and 0.879.
    - Elsewhere the program checks only at its own analysis sections. It doesn't check the abutment's end
      panel, or an unstiffened stretch between its last check point and the next stiffener; the engine checks
      every station.
    - At the piers, the program's ratios imply panels of about 4 ft. Its own stiffener list puts the first
      stiffener 13 ft from the pier, which by hand gives ratios near 1.0 (2-span 14 ft: Vu 812 kip, ours
      φVn 814).
- **Shear panels (6.10.9.1).**
  - A panel runs between neighbouring supports, cross-frame connection plates (when they're full depth on
    both flanges) and transverse stiffeners. A stiffener zone gives one stiffener every `spacing`; a single
    stiffener is a zone with `from` = `to`.
  - A panel no longer than 3D is stiffened, and one next to an abutment is an end panel.
  - The same panels give Vcr for constructibility.

## Quantities (steel-takeoff.ts)

- **Pay item:** CDOT 509-00000 Structural Steel (LB). 509-00001 (Galvanized) and 509-00010 (Special) can be
  chosen instead. Painting is part of the work (CDOT 509.01), so it has no item of its own.
- **Weight:** the computed weight of CDOT Standard Specifications (2025) 509.32(a):
  - steel at 490.5 lb/ft³;
  - plates at their net dimensions, with the stiffeners' corner clips deducted and no overrun;
  - rolled W shapes and the cross-frame angles at their AISC nominal weight;
  - high-strength bolts by Table 509-4;
  - no allowance for welds or paint.
- **What's included:**
  - each field section's flanges and web, end to end;
  - the bearing stiffeners and intermediate transverse stiffeners;
  - the connection plates, two per frame;
  - the cross-frame struts and diagonals at every line, the supports included, with their bolts;
  - the studs: shank area × height, at each zone's pitch.
- **Not included:**
  - the field splices, which aren't designed;
  - the K-frames' middle gusset plates;
  - the bearings (Section 512);
  - the deck.
- Each part is worked out as math on the quantity sheet. The plan weight is the pay weight unless the design
  changes or it is off by more than 2% (509.32(b)).

## End cross-frames at the abutments (`endFrame`)

- **What they are:** X- or K-frames of single angles on the bearing stiffeners at both abutments. Saved designs
  from before keep them off.
- **Depth:** at least 0.75 of the girder's depth (6.7.4.2.1). The default is 0.8 of it, to the inch, so the
  frame counts as full depth in 6.7.4.2.2.
- **Stability bracing (6.7.4.2.2):** the stiffness and strength for the end span's deck placement, at 1.4 DC1
  (3.4.2.1).
- **Lateral loads to the bearings (6.7.4.2.1):** half the end span's wind reaction, entering at the fascia and
  shared by the bearings, so the first bay takes (Nb − 1)/Nb of it.
  - **Integral or semi-integral (CDOT BDM 11.3):** the construction wind only. The concrete end diaphragm, cast
    within 2 hours of the deck, then carries the deck's edge, the lateral loads and the jacking (BDM 11.3,
    14.5.6). Its bars and the girders' anchorage belong to the abutment's design.
  - **Seat abutment:** also the design wind on the superstructure (girder, haunch, deck and a 42 in barrier) at
    Strength III and V. Its deck-edge beam and jacking aren't designed here.
- **Members:** each against the smaller of its compression and tension resistance (6.9.4.4, 6.8.2.1), with
  slenderness of 140, or 120 on a curved bridge. The end connections use the intermediate cross-frames'
  connection settings (6.13).
- **Outputs:** the drawing (the cross-frame detail on the bearing stiffeners), a calc section, and the
  take-off, where the abutment lines take the end frame's angles and bolts.

## Sole plates and anchor bolts (steel-sole.ts)

- **Where:** every bearing, except at integral abutments, where the girders are cast in (CDOT BDM 11.3.1).
  Bearings are fixed along the girder at the piers by default, otherwise slotted.
- **The plate:**
  - 2 in longer than the bearing; across, the anchor bolts outside the flange with 2d to the edge, or 2 in
    wider than the bearing and flange without bolts (CDOT BDM 14.5.7);
  - at least 3/4 in at its thin edge, and thick enough to cantilever past the flange over the bearing's
    pressure (φf 1.0);
  - beveled where the girder's underside slopes more than 0.01 rad (14.8.2). The slope is the end rotation
    under the full permanent load, from the camber line, plus the grade.
- **Welds to the flange:** two fillets the plate's length, for the horizontal force (14.8.1, 6.13.3.2.4b).
- **Horizontal forces per bearing:**
  - the design wind across (Strength III, or V with WL 0.10 klf);
  - braking along, shared by the fixed bearings (3.6.4);
  - Zone 1's connection force (3.10.9.2): 0.15 or 0.25 of the permanent reaction across, and of the unit's
    whole permanent load along at the fixed bearings.

  AS defaults to 0 and comes from the geotechnical report.
- **Anchor bolts:**
  - ASTM A449, zinc plated (CDOT 512.02), in shear by Eq. 6.13.2.7-2 with the threads included; or F1554
    rods by Eq. 6.13.2.12-1. φs is 0.75 for both.
  - The concrete's shear breakout toward the seat's edge and pryout are by ACI 318-19 Chapter 17 (AASHTO 5.13):
    cracked concrete, no supplementary bars, φ 0.70.
  - The number and diameter step up (2, 4 or 6 bolts; up to 2 in) until the bolts and the concrete pass.
- **Hairpins at the pier bolts (anchor reinforcement, on by default):** per ACI 318-19 17.5.2.1 and
  17.7.2.5.1 (AASHTO 5.13).
  - They take the shear toward the cap's face in place of the concrete's breakout: φ 0.75 × the legs' As fy.
  - Each leg is developed past the bolt (AASHTO 5.10.8.2.1, epoxy coated), and the leg is ld + 0.5 ca1 long.
  - A set goes toward each face, since braking and the earthquake reverse.
  - The bars step up from the given size, or to two a bolt, as needed. The take-off notes list them as the cap's
    602 bars.
  - With them, 2A's fixed pier passes Zone 1 at AS 0.165 with four 1 in bolts.
- **Not here:** the bearing and the concrete under it, which are designed in the elastomeric bearing tool.
- **Pay items:** the sole plate and bolts are part of the Type I bearing device (CDOT 512.03), paid each.
  The take-off counts the bearings under 512-00101.
- **Benchmark:** the connection force factor against CDOT BDM Example 9 (0.25 for AS 0.165: 15.5 kip per
  bearing across at abutment 1, 88 kip along at the fixed pier).

## Bolted field splices (steel-splice.ts)

- **Where:** at each change of section, unless it's marked as welded in the shop (`splice.shopWelded`). Saved
  designs from before keep splices off.
- **Bolts and holes:**
  - slip-critical bolts in standard holes (Table 6.13.2.4.2-1: d + 1/16 in, from 1 in d + 1/8 in), whose
    nominal diameter is the hole's width in the net area (6.8.3);
  - at least two rows each side (6.13.6.1.3a).
- **Flanges (6.13.6.1.3b):**
  - an outer plate as wide as the narrower flange, and two inner plates flush with its edges, 1/2 in or more
    off the web;
  - designed for Pfy = Fyf Ae of the thinner flange (Eqs. 6.13.6.1.3b-1, -2);
  - a filler on the thinner side; at 1/4 in or more, the bolts reduced by R (Eq. 6.13.6.1.4-1).
- **Rows and plates are sized until they pass:** bolt shear (with the 0.83 factor past 38 in), bearing
  (6.13.2.9), block shear of the flange and both plates (6.13.4), and the plates' gross yielding and net
  fracture (6.13.5.2, An ≤ 0.85 Ag). The plates are balanced within 10%, so Pfy splits equally.
- **Moment:** the flanges' moment resistance against Strength I:
  - composite positive: the bottom Pfy × the arm to the deck's mid-thickness;
  - otherwise: the smaller Pfy × the arm between the flanges.

  The rest goes to the web as Hw, at the deck's arm or D/4.
- **Web (6.13.6.1.3c):**
  - two plates, D − 2 × (the inner plate + 2.5 in) deep;
  - bolts for √(Vr² + Hw²), where Vr is the smaller φv Vn either side;
  - bearing at the web holes by the clear edge distance (C6.13.6.1.3c);
  - slip under the Service II or deck-casting shear, with Hw for slip;
  - the plates in shear (6.13.5.3) and, with Hw, in tension;
  - the vertical pitch within the sealing limit (6.13.2.6.2).
- **Slip:** at Service II and while the deck is cast (1.4 DC on the steel, or the pour envelope).
- **Also checked:** the tension flange's net section (Eq. 6.10.1.8-1), and the base metal at the gross section
  for Category B fatigue.
- **Benchmark:** Caltrans BDP 6.2 (2022), its splice at 0.7 of span 2, with its plates (steel-splice.test.ts):
  - An, Ae, Pfy (1,365 and 780 kip), the filler factors (0.889, 0.667) and the bolts needed (23.8, 18.1);
  - the plates' gross, net and block-shear resistances.

  Its web splice follows Caltrans's own amendments (a plastic web moment and bolt-group eccentricity), which
  AASHTO 10th doesn't use, so it isn't compared.
- **Drawing:** the plan sheets and the calc package show each splice in elevation (flange and web bolts, fillers
  shaded) and both flange splices in plan. The take-off adds the splice plates, fillers and bolts.

## AASHTO 10th Edition load factors (checked 2026-11-20)

- **Construction (3.4.2.1):** the larger of:
  - 1.25 DC + 1.5 × the construction loads (Strength I);
  - 1.4 × (DC + the construction loads) on the erected steelwork.

  This applies to constructibility, each deck pour, the cross-frames' bracing moment and their construction
  forces. The engine used 1.5 DC before.
- **Cross-frame fatigue (3.4.5):** the Fatigue I and II live load factors are multiplied by 0.65.

## Plan sheets

The editor and the calc package draw the plan sheets (`src/components/design/steel-girder-sheet.tsx`, helpers in
`src/lib/design/girders/steel-sheet.ts`), following the usual US content (as Caltrans' Bridge Design Details 11.1
lists it):

- **Girder elevation:** one per girder line, flange thicknesses exaggerated.
  - Field sections A, B, … at the plate transitions, their splices marked FS (not designed).
  - Studs by zone, connection plates, transverse and bearing stiffeners, dead load contraflexure points.
  - Each flange's **tension (T) and compression (C) zones** from the Strength I envelope. Tension zones need
    the CVN requirement (6.6.2.1); on a two-girder bridge they're marked fracture-critical (FCM).
  - The **girder's ends beyond the abutment bearings** (input "girder end beyond the abutment bearings",
    default 9 in), the end field sections running to them.
  - Cross-frame, field section and span dimensions.
- **Plate schedule:** each field section's plates, from–to (to the girder's ends), length and weight.
- **Camber:** the **web camber** (steel, deck and DC2 deflections, cut into the web) and the **screed camber**
  (deck and DC2, still to come once the steel is erected; it sets the screed), two diagrams on one scale, and
  a table of the components with both. DW and the vertical profile are left out (the profile's ordinates are
  added to both).
- **Cross-frame detail:**
  - The intermediate frame between two girders, to scale across, with the deck above.
  - The X or K members with their angle sizes, and the connection plates.
  - Each member end's bolts at their spacing and end distance, or the welds.
  - The working points and girder spacing dimensioned.
  - Notes: members, fasteners, plates, the fit (no-load for straight framing, steel dead load fit for curved
    or skewed over 20°), and the members' forces against their resistances.
## Benchmarks (tests)

See `benchmarks.md`.

- **FHWA Example 2A.**
  - Distribution factors, Vcr and deflection match.
  - Moments match within about 2%.
  - The pier fails negative flexure without Appendix B, as the example also finds.
- **2A bearing stiffener (6 × 5/8 in).**
  - Rsb 394 kip, As 10.95 in², I 100.2 in⁴ and r 3.03 in match.
  - The example's Pn of 502 kip comes from a misprinted Pe (2,646 kip where its own formula gives
    28,9xx kip). The correct Pn is 543 kip.
- **2A web yielding and crippling.** Pier 445/446 kip and abutment 304/179 kip match.
- **NSBA standard plans 2@100, 2@130 and 1@100.**
  - Reactions agree within 1.5 kip.
  - All checks pass, with governing ratios of about 0.93 to 0.97.
- **Fatigue truck.** The moment matches the three-moment equation on a prismatic two-span girder.
  2A's own fatigue moments are in table images and don't follow from its distribution factor and IM,
  so they aren't used.
- **Infinite-life ADTT.** Matches Table 6.6.1.2.3-1.
- **Camber.** Matches 5wL⁴/384EI on a simple span.
- **Appendix A6/B6, Example 2A's pier from its own inputs.**
  - λrw 137.27, λpw(Dcp) 56.11, λpw(Dc) 48.39.
  - Rpc 1.107, Rpt 1.192.
  - Mnc 4,686 kip·ft, Mnt 4,428 kip·ft.
  - Mpe 4,574 (capped at Mn 4,428), Mrd 937 kip·ft.

  In the full girder the tool redistributes 677 kip·ft, not 937. The example takes the deck bars at
  50 ksi, while D6.2.3 uses their own 60 ksi, so here compression governs Mn (4,775 kip·ft). With
  A6 and B6, Example 2A passes every check.
- **Pour sequence.** A single pour reproduces the single-placement flange stress and camber. Placing
  the positive regions first raises their moment and puts the first pours' deck in tension.
- **Cross-frames.** βbr, βg, (βT)req, Mbr and the diagonal force match hand calculations.
- **Calc package.**
  - It evaluates with no errors, and its NG results are the same as the engine's failing checks.
  - Its worked (ΔF)n, stud pitch, stiffener It and bearing Pn equal the engine's. So do Rpc, Mrd, (βT)act,
    (βT)req and the strut's Pn.

## Not yet

- deflection, camber and bearing reactions by the grid (the line girder's are used);
- a 3D finite element model (the grid is the 2D refined analysis; NCHRP 725 warns 2D grids can
  underestimate cross-frame forces in sharply skewed or curved bridges);
- the 5–16% gap to Design Example 3's 3D moments, and centrifugal force (3.6.3) on the live load;
- the descending branch of the B6.6.2 moment-rotation curve past θRL.

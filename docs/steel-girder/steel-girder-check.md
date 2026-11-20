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
  - Wet concrete (1.5 DC) sits on the steel where the deck is still wet, and on the n section where
    earlier pours have hardened.
  - Flange checks are made at every stage with the steel's resistance (Cb = 1). These replace the
    single-placement flange checks.
  - The hardened deck's tension is checked against fr, or the 6.10.1.7 bars are required (6.10.3.2.4).
  - Camber sums the deck's deflections stage by stage.
- **Cross-frames (phase 3).** X or K frames as torsional braces for the deck's placement (1.5 DC1, Cb = 1),
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
  - FHWA's curved Design Example 3 couldn't be reached (ROSAP blocks automated downloads; AISC's link is
    gone).

## Plan sheets

The editor and the calc package draw the girder elevation and camber as plan sheets show them (`src/components/design/steel-girder-sheet.tsx`, helpers in `src/lib/design/girders/steel-sheet.ts`, tests in `steel-sheet.test.ts`):

- **Girder elevation:** one per girder line, flange thicknesses exaggerated. It shows field sections A, B, … taken at the plate transitions, the studs by zone, connection plates at the cross-frames, transverse and bearing stiffeners, splices at the transitions (marked FS, not designed), and the dead load contraflexure points (from the DC1 + DC2 + DW moments, parabolic between stations). Below it are the cross-frame, field section and span dimension strings.
- **Plate schedule:** each field section's plates, from–to, length and plate weight at 490 pcf.
- **Camber diagram and table:** every span's tenth points with the steel, deck and DC2 deflections; the camber is their sum. DW is listed but left out, as is the vertical profile.

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
- a benchmark against FHWA's curved Design Example 3 (not reachable from here);
- the descending branch of the B6.6.2 moment-rotation curve past θRL.

# Traffic signal foundations (plan and status)

The Fri 2026-12-04 slot was "signal mast arms and high-mast lighting". Signal poles and arms are standard details (CDOT
S-614-40 and 40A) and high-mast towers are bought on a performance specification, so the steel isn't designed here.
What engineers do design is the foundation for the site's soil. Decided 2026-11-20: **a foundation check where the
designer chooses the standard signal pole and mast arms it supports.**

## Sources (in `Downloads\CDOT S-614 standards`, issued July 1, 2026)

- **S-614-40**, Typical Traffic Signal, 15'–75' double mast arms and 60'–75' single mast arm (6 sheets):
  - the arms' tubes (sheet 3);
  - the double-arm poles (sheet 4) and the 60–75 ft single-arm poles (sheet 5);
  - the base connection and the caissons (sheet 6): 36 in × 12.5 ft to 54 in × 20.5 ft, #9 bars, #4 spiral at 6 in.
- **S-614-40A**, Alternate Traffic Signal, 15'–55' single mast arm (5 sheets): one pole for all arms, and a 36 in caisson
  14'-6" deep in cohesionless soil and 18'-6" in cohesive soil, with 14 #9 bars.
- **S-614-44**, Pedestal Pole Signals: the poles' service moment and shear, and 24 in caissons.
- Design data on the sheets:
  - the 2001 AASHTO Standard Specifications for Structural Supports, at 100 mph (90 mph for S-614-44);
  - soil γ 110 pcf, c 750 psf, φ 30°;
  - factors of safety: 3.0 in flexure, and 1.5 (40) or 1.25 (40A) in torsion.
- Sheet 2 sets the worst-case loading:
  - signal heads every 10 ft from the arm's tip: 63 lb and 14 ft² at the tip, 46 lb and 8.67 ft² for the others;
  - signs between the heads: 60 lb and 15 ft², then 28 lb and 7 ft²;
  - a pole-mounted head: 100 lb, 17.34 ft²;
  - a luminaire: 75 lb, 3.3 ft², Cd 1.2;
  - a camera: 10 lb, 1.125 ft², Cd 1.2.
- Also downloaded for reference: S-614-41 to 43, 45 (span wire, cabinet foundation, loops, push buttons), S-614-50 and 60
  (static and dynamic sign monotube structures, useful for the sign bridge and cantilever benchmarks).

## What the tool does (built 2026-11-20, `src/lib/design/signals/`)

1. **Pick the standard:** S-614-40A (25/35/45/55 ft design arms), S-614-40 double arm (30/40/50/65/75), S-614-40 single
   arm (65/75), or an S-614-44 pedestal pole. Set the arms installed (a second arm at 60° to 120°), the luminaire arm
   (10 or 15 ft), the camera and the pole's own signal head. The arm's loading is CDOT's worst case, or edited.
2. **Loads** (LRFD-LTS 3.5, 3.8, Table 3.4-1):
   - the tubes from the sheet's tables, cut into 1 ft pieces, each piece with its own Kz;
   - wind on the tubes by the crossflow principle, with round members' Cd by CvVd;
   - signs loaded on their faces; signal heads, luminaire and camera by their full area from any direction;
   - the wind turned round the pole in 5° steps, keeping the worst direction for moment, shear and torsion;
   - Extreme I at 1.1 and 0.9 DC.
   - Pedestal poles: the sheet's service forces scaled by (V/90)²·Kd.
3. **Embedment, by Broms** (LRFD-LTS C13.6.1.1): clay by Eqs. -1 to -4, sand by Eqs. -5 to -7, with φ = 1.0 for the
   extreme event (AASHTO 10.5.5.3.3).
4. **Torsion in the soil:** side resistance round the shaft at D/2, φ = 0.8 (taken as for uplift). Two methods; the
   owner chose (2026-11-20) to keep both and default to CDOT's:
   - **As CDOT's standards (default):** clay its full cohesion (qs = su); sand O'Neill and Reese's β = 1.5 − 0.135√z
     (0.25 to 1.2, × N60/15 below 15; AASHTO LRFD 7th Ed. Eq. 10.8.3.5.2b-2), integrated down the shaft. The sheets
     don't state their method; this one carries every S-614-40 and 40A caisson on the sheets' own basis, in clay and sand.
   - **AASHTO's current:** clay α = 0.55 (10.8.3.5.1b); sand β = (1 − sin φ) tan φ, normally consolidated
     (10.8.3.5.2b). It fails most of the standard caissons, even on their own basis.
5. **The caisson as a concrete member:** axial load and bending at Broms' largest moment, and shear (shared with the sign
   tools, `designShaft`). Torsion over a quarter of the cracking torque gets the spiral for torsion and shear (5.7.3.6.2)
   and the longitudinal bars (5.7.3.6.3).
6. **On the standard's own basis (advisory):** 100 mph, Kd 1, unfactored, the loads × the sheet's factor of safety, Broms
   again; and torsion × its factor of safety.
7. **Outputs:** the elevation schematic (pole, arm, heads, signs, luminaire, caisson), a plan of the arms when there are
   two, the caisson's cage, the calc package, and the caisson's pay length (Item 503).

## Validation

- On the standard's own basis, the tool lands within 6% of CDOT's S-614-40 caisson depths in clay: 12.7 vs 12.5 ft
  (30 ft arms), 14.3 vs 14.5 (40 ft), 15.7 vs 16.5 (50 ft). So the loads, the sheet's loading and Broms match what CDOT
  did for overturning.
- Broms is checked by statics: in clay, the length below the largest moment carries it (Mu = 2.25·c·D·g²); in sand, L is
  the cubic's root.
- A signal head's torsion is checked as q·Cd·A × its reach.

## Findings to confirm

1. **Torsion in the soil (resolved by the method choice above).** With AASHTO's current method torsion governs the larger standards under LRFD-LTS (120 mph, Kd 0.85) with AASHTO's side
   resistance. It also governs on CDOT's own basis with α = 0.55 or a normally consolidated β: in clay for the 40A
   55 ft arm and for S-614-40 from 40 ft up; in sand for every 40A arm from 35 ft and every S-614-40 pole. CDOT's standard caissons must assume a higher torsional resistance (full
   cohesion, or K tan δ near 1 in sand). With CDOT's method, under LRFD-LTS at 120 mph only the 40A 55 ft arm in sand
   comes out short (146 against 142 kip·ft).
2. **S-614-44 pedestal caissons fail Broms in clay** (5.9 ft needed against 4'-8"). The sheet counts soil support over the
   top 1.5D, which Broms' clay method ignores.
3. **The basic wind speed** defaults to 120 mph like the other sign tools. Check the 700-yr MRI map (LTS Figure 3.8-1a)
   for the site; Colorado's plains are about 115 mph.

## Not built

- The steel: poles, arms, the built-up box, base plates and anchor bolts, and fatigue. These are the standard's and the
  fabricator's.
- High-mast lighting towers (bought on a performance specification); their foundation could be added the same way from
  the supplier's base reactions.
- A p–y analysis of the caisson (the Drilled Shaft tool has one); layered soil.

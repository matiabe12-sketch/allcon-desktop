# Foundations and abutments (Foundations → Spread Footing, Pile Foundation, Drilled Shaft; Substructures → Abutment)

Four tools that carry a highway bridge from its bearings to the ground: a spread footing, a group of
driven H-piles under a cap, a drilled shaft, and the abutment itself (integral on H-piles or drilled
shafts, semi-integral, or seat type). Designed by AASHTO LRFD (10th Edition, 2024) with the CDOT
Bridge Design Manual (BDM, April 2025) where it adds to AASHTO, and the FHWA NHI reference manuals
for the methods AASHTO leaves to "accepted soil mechanics". Each has its checks with references, a
calc package in the owner's style, its bars detailed with a schedule, and CDOT quantities.

## Sources

- AASHTO LRFD 10th: 3.11.5 (earth pressure), 3.11.6.4 (live load surcharge), 3.12 (TU), 4.6.2.5
  (effective length), 5.6.3, 5.6.4, 5.7.3.3, 5.10.8, 5.12.8 (footings: 5.12.8.4 moment, 5.12.8.6
  shear, 5.12.8.8 transfer at the column), 6.5.4.2 (pile φ), 6.9.2.2 (axial with flexure), 6.9.4.1,
  6.12.2.2 (H-shape flexure), 6.15 (piles), 10.5.5.2 (resistance factors), 10.6.3.1.2a (bearing),
  10.6.3.3 (eccentricity), 10.6.3.4 (sliding), 10.6.2.4 (settlement), 10.7.1.2 (spacing, embedment),
  10.7.2.4 (horizontal movement, p-multipliers Table 10.7.2.4-1), 10.7.3.13 (pile structural
  resistance), 10.8.3.5 (drilled shaft side and tip resistance), 10.8.3.9 (shaft reinforcement),
  11.6 (abutments).
- CDOT BDM: 10.3.3 (extreme event φ 1.0, uplift ≤ 0.80), 10.4.2 (footing embedment ≥ 3 ft), 10.4.3
  (angular distortion 0.008 / 0.004), 10.5.1.1 (HP 12x53, 12x74, 14x89, Grade 50), 10.5.2.1 (soft
  or hard rock by penetration), 10.5.2.2 (groups of 3 or fewer piles: φ × 0.8), 10.5.3 (fixed pile
  head: Table 10-1 embedment 20/24/26 in), 10.6.1.1 (shafts ≥ 24 in, L/D < 25), 10.6.2.1 (claystone
  φ 0.60), 11.3 (abutment loads: half the approach slab's dead load on the cap, IM in the cap but not
  the foundation, foundation elements ≥ 10 ft below the cap), 11.3.1 (integral: unit length,
  movement ≤ 2 in, single row of piles, weak axis along the abutment, prebore of d + 1 ft with pea
  gravel k = 300 pci, φ = 40°, γ = 95 pcf, depth ≤ 13 ft, cap 3.5–6 ft, skew ≤ 30°, grade ≤ 5%),
  11.3.2 (semi-integral), 11.3.3 (seat type).
- FHWA NHI-06-089, Soils and Foundations Reference Manual Vol. II (2006), Ch. 8: the bearing
  equation with its correction factors (Eq. 8-6, Tables 8-2, 8-4, 8-5, 8-6), effective footing
  dimensions (Eqs. 8-7 to 8-9), Schmertmann's method (Eqs. 8-16 to 8-18, Fig. 8-21), Examples 8-1
  and 8-2 (the validation cases).
- FHWA GEC 6, Shallow Foundations (FHWA-SA-02-054): the footing design process and sliding.
- FHWA GEC 9, Laterally Loaded Deep Foundations (FHWA-HIF-18-031): the p–y method and its curves
  (API sand, Matlock soft clay, Reese stiff clay above water, Reese weak rock).
- FHWA GEC 10, Drilled Shafts (FHWA-NHI-18-024) and GEC 12, Driven Piles (FHWA-NHI-16-009).
- AISC Shapes Database v16 (the repo's table) for the HP sections.

## Shared engine (src/lib/design/foundations/)

- `soil.ts`: soil layers (sand, soft clay, stiff clay, weak rock, or a linear spring), unit weights,
  water table, effective stress.
- `lateral.ts`: a laterally loaded pile or shaft by the p–y method: finite differences on the beam
  equation EI y'''' + Q y'' + p(y) = 0 (Reese), nonlinear springs iterated to convergence, head
  conditions free (V, M), fixed (V, θ = 0) or an imposed displacement with θ = 0 (an integral
  abutment's thermal movement), group p-multipliers, axial load for P–Δ. It gives deflection,
  slope, moment, shear and soil reaction with depth, the depth to the first zero deflection and the
  largest moment. Checked against the closed form of a long elastic pile on linear springs (Hetényi).
- `hpile.ts`: HP sections (AISC v16), axial resistance (6.9.4.1, λ = 0 fully embedded, or by the
  unsupported length plus depth to fixity), flexural resistance about either axis (6.12.2.2), the
  interaction of 6.9.2.2 with φc = 0.70 and φf = 1.00 (6.15.2), φc = 0.50 / 0.60 axial only.

## Spread Footing

Inputs: a column (rectangular or round) or wall on a rectangular footing; thickness, embedment,
bars both ways; load cases at the top of the footing (P, Mx, My, Hx, Hy) as Strength, Service or
Extreme Event; soil above and below, water table; bearing either computed (AASHTO 10.6.3.1.2a /
NHI Eq. 8-6: c, φ, Nc Nq Nγ, shape, water, optional depth factor; φb 0.45–0.50) or entered (rock or
a geotechnical report's nominal resistance); sliding (cast-in-place on sand φτ 0.80, clay 0.85);
settlement by Schmertmann (layers with E, or E from N160 per the NHI table) against a tolerable
value.

Checks: embedment ≥ 3 ft (BDM 10.4.2); eccentricity ≤ B/3 soil, 0.45B rock (10.6.3.3); bearing on
the effective area B′L′ (Strength); sliding (10.6.3.4); settlement (Service I); flexure at the
column face each way (5.12.8.4, bars banded in a rectangular footing), minimum (5.6.3.3), crack
control (5.6.7), one-way shear at dv (5.12.8.6.2 / 5.7.3.3 simplified β = 2), two-way punching
(5.12.8.6.3), development from the critical section (5.10.8.2.1), bearing at the column
(5.6.5). Quantities: 601-03040, 602-00020, 206-00000 / 206-00100 by M-206-1 limits.

## Pile Foundation

Inputs: an H-pile (CDOT's HP 12x53, 12x74, 14x89 and the other HP sizes) in a grid under a
rectangular cap, strong or weak axis along X, driven to soft or hard rock or a friction pile, the
nominal geotechnical resistance per pile from the report and its φ (dynamic testing 0.65), uplift
resistance; the soil profile for lateral analysis; load cases at the top of the cap.

Checks: spacing ≥ 30 in and 2.5 d (10.7.1.2), cover and embedment (BDM 10.5.3 fixity: 20/24/26 in),
pile reactions on a rigid cap (P/n ± M·x/Σx²), geotechnical axial (φ × 0.8 for ≤ 3 piles, BDM
10.5.2.2), uplift, structural axial (6.15.3.1), lateral: the most loaded pile's p–y analysis with
the row's p-multiplier and a fixed head, its deflection against a tolerable value and its moment in
the 6.9.2.2 interaction, the depth to fixity; the cap: flexure at the column face from the pile
reactions, one-way shear, punching at the column and at a corner pile; the pile's shear along its web
(0.58 Fy D tw, D = d − 2 tf) and along its flanges (both flanges), φv 1.0 (6.12.1.2.3). Quantities: 502-112xx /
502-114xx Steel Piling by section (LF), 502-00460 Pile Tip, 601-03040, 602-00020, 206 excavation.

## Drilled Shaft

Inputs: diameter, length, cover, bars and ties or spiral; layers (clay by α with Su, sand by β with
N60, rock by qu, or qs and qp entered from the report, e.g. CDOT's claystone method); load cases at
the top. Checks: diameter ≥ 24 in and L/D (BDM 10.6.1.1), side and tip resistance (10.8.3.5, top
5 ft and the bottom D in clay not counted), uplift, lateral p–y (deflection, moment and shear along
it), P–M by strain compatibility at the largest moment (5.6.4.5, the column tool's section), shear
(5.7.3.3), reinforcement limits (5.6.4.2, 10.8.3.9). Quantities: 503-000xx by diameter (LF),
503-00310 CSL tubes and testing (non-redundant shafts, BDM 10.6.3.2), 602-00000 cage.

## Micropile

Inputs: the composite section (casing OD, wall and Fy, area lost at its threads; the core threadbar
and its fy; grout f'c; the drill hole), the cased, plunge and bond lengths, any unsupported length,
the ground in the bond zone and the grouting type (A–E), αb (the table's lower bound, or a load
test's value), φ, the soil for the lateral analysis, load cases per micropile (compression, tension,
shear). Checks: spacing (30 in or three holes, AASHTO 10.9.1.2) and embedment; grout-to-ground bond
in compression and tension, Rs = π·db·αb·Lb (AASHTO 10.9.3.5.2, Table C10.9.3.5.2-1 after FHWA
NHI-05-039), φ 0.55 presumptive or up to 0.70 load tested (Table 10.5.5.2.5-1), tip on rock optional;
the cased length in compression 0.85·(0.85·f'c·Ag + fy·(Ab + Ac)) and tension fy·(Ab + Act), the
uncased length 0.85·(0.85·f'c·Ag + fy·Ab) and fy·Ab (10.9.3.10.2–3, φ 0.75 and 0.80, Table
10.5.5.2.5-2), steel at most 87 ksi for strain compatibility (C10.9.3.10.2a, FHWA-SA-97-070 5.E.7),
the plunge length's transfer (10.9.3.10.4, FHWA-SA-97-070 5.E.6); lateral by p–y with the casing's
axial and flexure and buckling with an unsupported length (10.9.3.10.6, FHWA-SA-97-070 5.F.5); the
elastic shortening P·L/(A·E) at the Service load (FHWA-SA-97-070 5.F.1). Quantities: 503-010x0
Micropile (by diameter, LF). References: AASHTO 10.9; FHWA NHI-05-039 (2005) and FHWA-SA-97-070
(1997, Ch. 5); Caltrans Geotechnical Manual, Micropiles (2021).

## Abutment

Types (BDM 11.3): integral on one row of H-piles (CDOT's preferred) or on drilled shafts with a pin;
semi-integral (bearings on the cap, cap fixed to its foundation); seat type (backwall and stem on a
footing or piles). Inputs: the bridge (span lengths and unit length, girders, reactions DC, DW, LL
with and without IM, braking), the abutment's geometry, the approach slab, backfill, temperature
range and CDOT's creep and shrinkage, the foundation (from the three tools' engines).

Checks, integral: unit length (Table 11-1), factored movement ≤ 2 in, grade ≤ 5%, skew ≤ 30°,
depth ≤ 13 ft, cap 3.5–6 ft, pile embedment and single row, weak axis along the abutment; each pile
under the girder reactions and the imposed thermal displacement (p–y with an imposed head
displacement, prebore with pea gravel), its 6.9.2.2 interaction, depth to fixity and buckling
(10.7.3.13.4), geotechnical axial; the cap as a continuous beam over the piles (flexure, shear),
the backwall and cap under passive pressure. Semi-integral and seat: stability on its footing or
piles (bearing, sliding, eccentricity as the footing tool), the stem and backwall in flexure and
shear under earth pressure (3.11.5), live load surcharge (3.11.6.4) and the bridge's forces, the
bearing seat width (4.7.4.4: `seatH` the columns' average height to the next expansion joint, default 0 for
a single span; `seatPct` Table 4.7.4.4-1's 50, 100 or 150%, default 100).

- **Bearings' eccentricity (`bearingEcc`):** the bearings from the stem's centerline toward the span; by default half
  the backwall for a seat abutment, 0 for semi-integral. The girders' DC, DW and LL + IM act there, the approach
  slab's half and the backwall at their own places (behind the centerline at γ 0.9), in the stem's moment and the
  footing's statics.
- **Cover and dv:** the stem's and backwall's cover is `wallCover` (default 2 in, Table 5.10.1-1). dv = de − a/2, not
  less than 0.9 de or 0.72 h (5.7.2.8), for the stem, backwall and footing. Quantities: abutment concrete 601-03040, 602-00020, piles or shafts,
206 excavation and backfill.

Integral with steel girders (`girderMaterial: "steel"`, `steelEnds`): the girders' ends are cast into the
diaphragm (BDM 11.3.1, Figure 11-1 note 3).

- **The pull:** as the bridge contracts, the girders pull the abutment with the foundation elements' head
  shears at the movement (from the p–y run), plus 1.75 × braking. Each girder carries its share.
- **Studs on each girder's end:** for that pull, Qr = φsc 0.70 Asc Fu (6.10.10.4.3).
- **The web at the through bars' holes:** the end shear on the net web, Vp (6.10.9.2). The holes are at least
  the bar plus 1/2 in.
- **Dowels across the cap-to-diaphragm joint, per foot:** by shear friction (5.7.4.3, 5.7.4.4: roughened
  1/4 in, c 0.24 ksi, μ 1.0, K1 0.25, K2 1.5 ksi), with the diaphragm's weight as Pc.
  - The force is the larger of the pull and the expansion's push of the cap: 1.35 × the passive pressure on
    the cap's own face below the joint, with the piles' shears and braking.
  - The minimum interface steel (5.7.4.2) applies, and the dowels are developed into the diaphragm (5.10.8.2.1).
- **Take-off:** the through bars and the dowels are in the abutment's schedule. The studs are paid with the
  structural steel (509).

Live load surcharge, seat and semi-integral (AASHTO 3.11.6.4.1):

- **Pressure:** Δp = K γs heq. heq comes from Table 3.11.6.4.1-1 at the abutment's whole height (the backfill's
  surface to the footing's bottom, as the 10th Edition defines it).
- **On the stem:** at Hst/2 (Strength 1.75, Service 1.0) in moment and shear.
- **On the footing:**
  - horizontally at H/2 in every case;
  - vertically on the heel for the bearing case only, not for sliding or eccentricity (C11.5.6);
  - in the heel's moment.
- **On the backwall:** the same Δp.
- **When it's left out:** CDOT BDM 11.3 ignores it where an approach slab is provided (AASHTO 3.11.6.5). `lsOmit`
  defaults to that whenever an approach slab is given (approachDC > 0), and can be set either way.
- **NHI-04-041 (no approach slab):**
  - the stem's Strength I moment and shear match with its LS terms. With the example's 1.13 ft eccentricity the
    moment is 154.7 against 156.61 (1.2%): the example adds the backwall's weight, which statics subtract, and
    takes 6.5 kip/ft of live load against the tool's 7.10 with IM;
  - the footing's horizontal force matches with its 1.75 × 1.76;
  - the front pile is 347 kip with the default eccentricity, 2% over the example's 315–340 from its soil springs
    (331 before the eccentricity).
  - The backwall's heq is 2.0 at the whole 24.5 ft, against the example's 3.6 at the backwall's 7 ft (its 2nd
    Edition).

Seat abutment's backwall (BDM 11.3.3): a cantilever from the seat, per foot.

- **Loads** (as FHWA NHI-04-041 Step 7.9, to the 10th Edition):
  - earth pressure at H/3 (3.11.5);
  - the live load surcharge at H/2, heq from Table 3.11.6.4-1 for the backwall's own height;
  - a rear axle plus 2 ft of lane in every lane on its top, with IM and the multiple presence factor
    (3.6.1.1.2), eccentric to its centerline by `backwallLLecc` (default half its thickness).
- **Checks:** Strength I and V, minimum steel (5.6.3.3), crack control at Service I (5.6.7), shear (5.7.3.3), and
  the horizontal bars' shrinkage and temperature minimum (5.10.6, `backwallHorizBars`).
- **Benchmark:** NHI's earth pressure (0.88) and surcharge (0.91 kip/ft) exactly, and its Strength I moment with the
  axles' term × 0.85. The example leaves out m; its own result is MubwstrI = 14.38 kip·ft/ft.

Semi-integral end diaphragm (`semi`, BDM 11.3.2 Figure 11-3): it rides on the bearings with the superstructure, so
it's a beam between the girders, not a backwall fixed to the seat. The old cantilever check is dropped for this
type.

- **Horizontal bars:** each face, under passive pressure between girders (1.35 Kp γ H S² / 10, 3.11.5.4).
- **Jacking for the bearings' replacement** (AASHTO 3.4.3.1: 1.3 × the permanent reaction, no live load; CDOT BDM
  14.5.6):
  - each girder goes to a jack either side, and the diaphragm bridges between them;
  - its bottom bars (Figure 11-3's #11) in flexure, its ties in shear, flagged as a deep beam when a < 2d;
  - the jack's rating (50 or 100 tons), the concrete under the jack (5.6.5, 8 or 10 in diameter), and the clear
    height (the jack plus 1 in).
- **Shrinkage and temperature:** the minimum for both faces' bars (5.10.6).
- **Steel girders (note 3):** studs for the bearings' shear and braking, and the web at the through-bar holes.
- **Take-off:** the diaphragm's bars (both faces, bottom, ties) are paid with the superstructure.
- **F-15-E:** the plans' BX15 bars aren't at hand, so the fixture assumes #6 @ 12 in each way (5.10.6's minimum
  for its 4 ft width). Abutment 2's own coated bars now come to 14,370 lb against the plans' 16,037 lb. The old
  match was the stand-in diaphragm bars counted in the abutment's column.

## Cantilever Wingwall (Walls → Cantilever Wingwall; src/lib/design/walls/wingwall.ts)

The wingwall cantilevers off the abutment; the abutment detail leaves it to this tool. Earth pressure (at rest by
default, 3.11.5.2) and live load surcharge (3.11.6.4) act on the retained face down to a line from H at the
abutment to h at the tip. Every bar set is designed (2026-11-20; before, only the retained face's horizontals were,
and the rest were a fixed "other bars", read now as both the front and the vertical bars of older saved designs):

- **Section A, retained face's horizontal bars** (per foot of height, the moment averaged over H): flexure
  5.6.3.2, minimum 5.6.3.3, crack control 5.6.7, shear 5.7.3.3 with β = 2 and dv per 5.7.2.8.
- **Into the abutment:** both faces' horizontals run along the wall through the abutment to its far face less the
  cover (the abutment's width along the skew, A / cos θ, as Section B takes it). The retained face's bars end in
  a standard 90° hook (5.10.8.2.4), the front face's straight (5.10.8.2.1), by the shared development() of
  stm/anchorage.ts: full yield (no excess reinforcement credit), the top bar factor (more than 12 in cast below),
  epoxy coated by default (BDM 5.4.5; a toggle for plain bars), no transverse bars counted.
- **Front face's horizontals and vertical bars each face:** inputs, checked as shrinkage and temperature steel
  (5.10.6: area each face each way with b the wall's height at the tip, and spacing); they carry no design moment.
- **Self weight in the wall's plane:** the wall as a cantilever beam as deep as its height, its top in tension at
  the abutment face; tension steel the horizontals in the top quarter (centroid H/8 down), the front face's at
  full area and the retained face's at the share the earth moment leaves them (1 − Mu/Mr); flexure 5.6.3.2 and
  shear 5.7.3.3 (β = 2). This is our choice of model; AASHTO has no wingwall-specific rule.
- **The connection to the abutment** (2026-11-20):
  - **Corner bars** (`cornerBars`, default the retained face's bar and spacing): L-bars round the inside corner.
    The root moment's tension turns from the wingwall's retained face into the abutment's back face, so they take
    Mu per foot of height over the abutment's thickness (5.6.3.2) with crack control at Service I (5.6.7). The
    abutment's own horizontal bars are not counted: CDOT's usual #5 @ 12 in fail crack control under the default
    wing's moment.
  - **Their legs:** along the abutment, ℓd plus the cover past the wingwall's inside face (5.10.8.2.1); into the
    wingwall, through the abutment along the skew plus a Class B lap (1.3 ℓd of the larger bar, 5.10.8.4.3a) with
    the retained face's bars. They're scheduled with the wingwall (602-00020).
  - **Shear friction across the vertical joint** (5.7.4.3, 5.7.4.4): √(Pu² + Vwu²), the thrust and weight
    together. Acv = t H. Only the front face's bars clamp it; the retained face's are in flexural tension, and no
    axial load is counted. `joint` is a construction joint roughened to 0.25 in (c 0.24 ksi, μ 1.0; the default) or
    monolithic (c 0.40, μ 1.4), with K1 0.25 and K2 1.5 ksi. The 5.7.4.2 minimum is waived below 0.210 ksi.
  - **Not checked:** the abutment taking Section B's forces (torsion and the moments into its end piles or
    footing), and the corner's opening-joint efficiency (AASHTO has no rule).
- **Section B:** the tension, shear, moments and torsion handed to the abutment.
- **Take-off and detail:** both faces' horizontals drawn and scheduled to the far face of the abutment along the
  skew (retained face hooked; a series along the sloping bottom; lapped Class B when longer than stock), verticals
  each face as a series, epoxy coated (602-00020). The bridge's 3D rebar view draws the front and vertical bars
  as entered (its embedment is still square to the abutment).
- **Tests:** wingwall.test.ts (the DOT example's loads, plus the development, 5.10.6 and in-plane checks worked by
  hand), wingwall-calc.test.ts (the package matches the engine), wingwall-nhi.test.ts (FHWA NHI-04-041 Step 7:
  only the shared pressures and the section; its wall stands on a footing, so the new checks aren't in it).
- With no skew, the default's #8 @ 6 in need a 36.1 in hook against 34 in in a 3 ft abutment: #6 @ 4 in fit.

## Validation

- Bearing: NHI-06-089 Example 8-1 (qult = 13,425 psf; 12,414 psf with water at the base).
- Settlement: NHI-06-089 Example 8-2 (Si = 0.130 in at the end of construction).
- p–y: a long elastic pile on linear springs against Hetényi's closed form (free head
  y0 = 2Hβ/k + 2Mβ²/k), and each p–y curve against its defining equations at sample points.
- Piles: hand checks of 6.9.4.1 and 6.9.2.2 for an HP 12x53.
- Shaft: AASHTO's α, β and rock equations at sample values.

## Where CDOT differs from AASHTO

- Small pile groups: φ × 0.8 is AASHTO's commentary (C10.5.5.2.3) made a requirement (BDM 10.5.2.2).
- Uplift at the extreme event: φ ≤ 0.80 (BDM 10.3.3), AASHTO 1.0.
- Drilled shafts may be smaller than the columns on them (BDM 10.6.1.1), unlike AASHTO 10.8.1.3.
- Claystone: CDOT's φ 0.60 for the Abu-Hejleh method (BDM 10.6.2.1); its qs and qp are entered.
- No expansion joints in abutments (BDM 11.3), unlike AASHTO 11.6.1.6.
- The integral abutment rules (BDM 11.3.1) are CDOT's; AASHTO leaves them to the owner.

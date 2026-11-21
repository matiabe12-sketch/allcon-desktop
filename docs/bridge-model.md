# The Bridge (phases 1 and 2 of the IFC bridge workflow)

One record that describes a whole girder bridge, entered the way PGSuper's Bridge Description and
Alignment dialogs ask for it, which every design tool reads from and the IFC generator (phase 2) and
reader (phase 3) translate to and from. Phase 1: the record and its editor, the geometry it implies,
the superstructure check run from it, and the loads passed down the load path to the abutments, the
piers and their foundations.

## The record (Design kind `bridge`, Bridges category)

Laid out after PGSuper (9.0, BridgeLink): its project file holds `AlignmentData` (reference station,
northing, easting, direction, horizontal curves), `ProfileData` (station, elevation, grade, vertical
curves), `Crown` (roadway section templates by station: left and right slopes, the ridge point's
offset), and `BridgeDescription` (girder family and type, girder count and spacing and where it's
measured, the bridge line's offset from the alignment, the slab offset, the deck edges, and each pier:
station, orientation, connection, girder end distance and bearing offset).

- **Alignment** (horizontal): a reference station with its northing and easting and the back tangent's
  bearing; horizontal curves by PI station, radius and the front tangent's bearing (circular; spirals
  in a later phase).
- **Profile** (vertical): a station, its elevation and the grade leaving it; vertical curves by PVI
  station, the grade leaving it and the curve's length (symmetric parabolas, AASHTO Green Book).
- **Roadway section** (crown): left and right cross slopes and the crown's offset from the alignment,
  constant along the bridge (superelevation transitions in a later phase).
- **Supports**: abutment, pier, …, abutment, each at a station with its orientation ("normal" or a skew
  angle, + to the right, as PGSuper's "15 L"/"15 R"), its type (integral or seat abutment; pier
  continuous, continuous after deck placement, or simple), the girders' end distance and the bearing
  offset from the support's line.
- **Superstructure**: the girder (the girder check's library), count, spacing (normal to the
  alignment at the abutments), the bridge line's offset from the alignment, deck edges (overhang),
  deck thickness, sacrificial depth, slab offset ("A" dimension) or haunch, the rail, the wearing
  surface, concrete. The girder's own details (strands, stirrups, handling, criteria) stay in a linked
  girder design, which the Bridge sets the layout of.
- **Components**: links to the designs built from it: the girder design, an abutment design at each
  end, and at each pier its cap (strut-and-tie), column and foundation designs.

## What it works out

- **Geometry**: each support's station, coordinates, bearing and skew; each span's length along the
  bridge line, bearing to bearing; the profile grade and elevation along it; the top of deck at each
  girder over each bearing (from the profile and the crown), and the girder's seat elevation below it
  (the slab offset and the girder's depth): the bearing seat elevations table PGSuper reports.
- **Superstructure**: the girder design run with the Bridge's layout: the spans (continuous over the
  piers that are), the largest skew, the spacing, overhang, deck, rail, crown and the profile's
  ordinate over each span (for the haunch), interior and exterior girders, all its checks.
- **Load path**:
  - Each support's reactions per girder: DC (girder, deck and haunch, diaphragms, barrier), DW, and the
    HL-93 lane reaction times the shear distribution factor, without and with IM (a continuous
    bridge's pier reactions from the girder check's continuous beam).
  - Abutments: the abutment design's bridge inputs (unit length to the nearest expansion joint, the
    grade, skew, curvature, girder count, spacing, reactions, braking, the abutment's length along its
    skew).
  - Piers: the cap's loads from the girder designs (the strut-and-tie tool's existing link), the
    column from the cap (existing link), and the foundation's load cases from the column's base forces
    (footing, pile group or drilled shaft).
  - Every push shows what changes and keeps the component's own details (bars, strands, soils).
- **Summary**: each component's verdict and governing check in one table, top to bottom.

## Sources

- PGSuper / BridgeLink 9.0 (WSDOT), its project file's alignment, profile, crown and bridge
  description; its User Guide (Bridge Description, Alignment).
- AASHTO A Policy on Geometric Design (Green Book): vertical curves.
- AASHTO LRFD 10th: 3.6.1 (HL-93, multiple presence), 3.6.2 (IM), 3.6.4 (braking), 4.6.2.2 (distribution
  factors), and the tools' own articles.
- CDOT BDM 11.3 (abutment loads: half the approach slab, IM in the cap but not the foundation).

## Later phases

3. IFC → the Bridge (classify, extract, confirm), then the same design run.
4. Curved girders, rebar and strands in IFC.

## Status (phase 1 built, 2026-11-13)

- `lib/design/bridge/`: `alignment.ts` (stationing through tangents and circular curves, the inverse
  station and offset, the profile with parabolic vertical curves, the crown), `bridge.ts` (the record,
  `bridgeLayout`, `girderInputsFor`, `runBridge` with each support's reactions: simple ends at the
  abutments and simple piers; at a continuous pier the girder and deck simple, DC2 and DW on the
  continuous beam, the lane by its influence lines), `loadpath.ts`, `kinds.ts`; `app/actions/bridge.ts`
  (`syncBridge`: update the linked designs top to bottom, create the missing girder and abutment
  designs); `components/design/bridge-editor.tsx`, `bridge-sketch.tsx` (plan and profile).
- Piers (added 2026-11-13): each pier is described in the Bridge as PGSuper's physical pier model is
  (multicolumn bent or hammerhead; cap length, depth and width; columns, spacing and section; the top of
  the footing or shaft; the foundation's type). The cap is built from the standard pier cap template
  with those dimensions and its bearings where the Bridge's girders sit; the column's height runs from
  the cap's soffit (the lowest bearing seat less the cap's depth) to the foundation's top; "Create the
  missing designs" makes the cap, column and foundation.
- Service loads: the column's link from the cap carries a Service I case (each bearing's DC + DW + the
  most live load reaching it, with IM and the multiple presence factor, unfactored), shown in the
  column's rows but not held to its strength checks, so the footing's settlement and crack control and
  a pile group's deflection now run from the bridge's loads.
- Abutments also drive their approach slab (deck width, roadway between barriers, skew) and a
  wingwall (height at the abutment face, the abutment's width, skew, backfill).
- Not yet: curved girders (girders are chorded between supports, as precast girders are), a calc
  package for the Bridge itself.

## Status (phase 2 built, 2026-11-13): the Bridge → IFC 4.3

"Build the IFC model" in the Bridge editor writes an IFC 4.3 model of the bridge and saves it as a new
3D model in the Bridge's project (the Bridge must be in a project).

- `lib/design/bridge/ifc.ts` (`bridgeIfc`) describes the model: the alignment as its horizontal segments
  (LINE, CIRCULARARC, CLOTHOID, as IfcAlignmentHorizontalSegment takes them) and its PVIs, from 100 ft
  before the first abutment to 100 ft past the last (widened to take in whole spirals and vertical
  curves); the parts (IfcBridge → SUPERSTRUCTURE and SUBSTRUCTURE, an ABUTMENT or PIER part per support);
  and each element as a profile swept from a placement, with its class, predefined type, material and an
  `ALLCON_Design` property set (the design's kind, id, verdict, the CDOT pay item).
- `api/_bridge.py` writes it with IfcOpenShell (action `bridge` of the IFC worker): feet, the site's
  `ALLCON_Origin` (the first abutment's northing and easting: the model's (0, 0)), the alignment segment
  by segment with `create_layout_segment`, the vertical by `layout_vertical_alignment_by_pi_method`, the
  start station as a STATION referent. The description is data: a fixed set of classes, numbers, names.
- Elements: girders (IfcBeam GIRDER_SEGMENT, the girder's outline swept along its 3D chord, seated on its
  bearings); bearings (IfcBearing); the deck (IfcSlab FLOOR, a closed triangulated solid whose top follows
  the alignment, the profile, the crown and the superelevation exactly, the soffit the deck's thickness
  below); integral abutments (pile cap IfcFooting, end diaphragm, H-piles IfcPile DRIVEN or shafts BORED);
  seat abutments (stem, backwall, footing); approach slabs (IfcSlab APPROACH_SLAB); pier caps (IfcBeam
  PIERCAP), columns (IfcColumn), footings, pile caps and piles, or shafts. Sizes come from the linked
  designs, or their defaults when one isn't linked.
- Alignment items added with it: spirals (entry and exit clothoids per curve, PGSuper's spiral lengths;
  `alignment.ts`), superelevation transitions (roadway section templates by station, straight-line
  between them; `sectionAt`), and flared girders (a girder spacing per support, the girder lines straight
  between them; the girder design takes the widest spacing in its group).
- Checked: `ifc.test.ts` and `geometry.test.ts` (spiral T, p, k, Lc and continuity; superelevation;
  flare; the deck's volume; the haunch at every bearing). The written files pass IfcOpenShell's schema
  validation, every element tessellates, and IfcOpenShell's own evaluation of a spiral alignment lies
  within 0.0001 ft of ours.
- Not modelled yet: wingwalls, barriers, diaphragms at piers, rebar and strands, the deck's haunch.

## The Bridge's calc package (built 2026-11-13)

"Create calc package" on a Bridge writes the whole bridge's design calculations, laid out as a DOT bridge's
are bound (the 24610 sealed calcs were the model):

1. A front page with the bridge rendered in 3D (`bridge/render3d.ts`: the IFC description's elements as
   triangles, an axonometric view from above one side, shaded, hidden faces dropped, drawn far to near; an
   SVG), the description, the overall result, references and contents.
2. The bridge's description and layout: alignment, curves and spirals, profile, roadway and superelevation,
   girders, deck and rail; the supports; every girder's span, length and seat elevations; plan and profile.
3. The summary of design checks: a table of every component with its verdict, then every check, grouped
   superstructure and substructure.
4. Part 1, Superstructure: the deck, overhang and rail; the girders of each group; the load path (each
   support's reactions per girder).
5. Part 2, Substructure, support by support in load-path order: the loads it receives, its bearings, its
   abutment (or pier cap and columns), its foundation, its approach slab and wingwalls.
6. Part 3, Quantities: the summary of quantities under CDOT's pay items, a column per part of the bridge
   (Superstructure, each support, Approach Slabs) and the total, then each part's tabulation.

Each component's own calc is included as its tool writes it; the whole package is worked out as one
worksheet (`bridge/calc.test.ts` checks it has no errors and that every component's checks come out as
they do alone). Code: `bridge/calc.ts` (the layout, pure), `bridge/package.ts` (reads the linked designs).

With it, the Bridge now also links a **deck slab** (its girders, spacing, overhang, thickness, flange, rail
and wearing surface from the Bridge) and **bearings** at each support. Under girders cast into a diaphragm
(integral abutments, continuous piers) the pads are leveling pads: the girder, deck and diaphragms until the
diaphragm is cast (DC1), no live load, no movement; each line of bearings carries its own span's end. The
Bridge has a **bridge rail** choice (CDOT B-606 Types 9 and 10 MASH); the IFC model sweeps it along both
deck edges (IfcRailing, the curb-and-post rail's steel tubes too), and every element has a colour.

## Test: CDOT 24610, I-18-BC (Airport Rd over Powers Blvd, WB)

The whole bridge entered from its documents (sealed calcs, FOR quantities, girder schedule, status-set
plans B17/B20/B22, boring logs, pile calc): `bridge/i18bc.fixture.ts` (numbers only), `i18bc.test.ts`,
`i18bc-chain.test.ts`, and in the app, project "24610 Airport Rd over Powers Blvd (I-18-BC)".

- Layout: all 24 of the sealed calc's bearing seat elevations within 0.01 ft (profile, single 2 % slope,
  25°03'55" skew, girder offsets, the deck–haunch–girder–pad stack).
- Design: girders with the schedule's 38 strands (c.g. 3.41 / 10.67 in, 0.40 L harp) pass 158 of 160
  checks; pads, abutments and piles, columns, drilled shafts and wingwalls pass every check, as in the
  sealed calcs. The 1,500-region package works out with no errors.
- Quantities against the FOR: girders 1,239 LF (0 %), deck 211.42 ft back face to back face (211.4), rail
  on the bridge 423 LF (0 %), superstructure bars 122,150 LB (+1.8 %, with the deck's #9 over the pier),
  all epoxy bars +2.2 %.
- Fixed by the test: the starting strand pattern now fits a shallower section; leveling pads; deck length
  back face to back face; the girder's take-off counts the negative moment bars over piers (pierBars); a
  drilled shaft's bars are paid in item 503.
- Still different (reported, not fixed): the pier cap is designed in one stage on its 5 ft first-stage
  depth, where the sealed calc checks the completed cap with the diaphragm (5 of 77 checks fail, ties at
  1.09); the girders' longitudinal reinforcement at the bearing (1.09; the 10 strands extended into the
  diaphragm aren't counted); the overhang's Case 1 at the limit (1.00); the approach slab's bottom
  transverse distribution (CDOT's #5 at 12 in, 2.04); the 12'-6" sidewalk isn't modelled (waterproofing on
  58.5 ft, not 46 ft); no rail on the approach slabs; three shafts in the plans, four in the FOR; which
  concrete class columns and diaphragms are paid under.

## Two-stage pier caps (built 2026-11-13)

A pier cap under girders made continuous by a cast-in-place diaphragm is designed in two stages, as CDOT
designs them (`stm/strut-tie.ts` `stages`, set by the Bridge at a continuous pier): **construction**, the
first-stage cap under the girders, deck, haunch and the wet diaphragm (DC1, Strength I at 1.25 and IV at
1.50, no live load); **completed**, cap and diaphragm as one member (the diaphragm from the cap's top to the
deck's top, its top bars the top tie) under every load. Both stages' checks are reported ("Construction: …",
"Completed: …"); the calc's model drawing is the completed member. On I-18-BC the plans' 18 #11 now pass, as
the sealed calc finds them.

## Prestressed boxes and the lever rule (built 2026-11-13)

- The 35 x 66 in box (`girders/sections.ts` `box-35x66`): a net-width profile (the void taken out at each
  height) that gives the published A, yb and I; both walls are its web for shear. Paid by the square foot of
  box, CDOT 618-01992/01994/01995 by depth.
- The girder check's `distribution: "lever-rule"`: the lever rule for every girder (trucks placed across the
  roadway, each girder's share by simple spans between girders), for systems AASHTO's tables don't cover,
  as F-19-AGA's analysis used. AASHTO's tables stay the default.

## Three CDOT bridges, saved in ALLCON (2026-11-13)

Each is a Bridge in its own project, its components created by the Bridge and given the plans' details, with
its IFC model and calc package. Fixtures (numbers only) and tests: `bridge/i18bc.*`, `i05va.*`, `f19aga.*`,
the end-to-end chain in `chain.testkit.ts`.

| Structure | Project | Checked against | Result |
|---|---|---|---|
| I-18-BC | 24610 Airport Rd over Powers Blvd | sealed calcs, FOR quantities, plans | 24 seats within 0.01 ft; girders, rail, deck length, piles 0 %; super bars +1.8 % |
| I-05-VA | 22943 SH 92 over the Gunnison River | IDC (seats, LEAP runs, summary), Pre-AD plans, SOQ | 24 seats within 0.01 ft; deck 366 ft; girders −0.3 %; rail, waterproofing, piles 0 %; shafts −1.3 % |
| F-19-AGA | 24898 SH 79 over I-70 | IDC (boxes, substructure, quantities), FIR | box 16,276 SF vs 16,204 (+0.4 %); rail, piles, caissons 0 %; geometry assumed (plans not read) |

Found by these and reported, not changed (the owner asked that no rules change yet): CDOT's f'ci / f'c
"without approval" limits and the harp point at 0.35–0.45 L flag I-05-VA's real design (7.5 / 9.0 ksi, harped
at 0.30 L); I-05-VA's construction-stage tie at 1.21; the abutments' "cap depth at most 6 ft" against I-05-VA's
7.5 ft; the approach slabs' bottom transverse distribution (CDOT's #5 at 12 in, 2.0); strands extended into
the diaphragm aren't counted in the positive moment connection or 5.7.3.5; F-19-AGA's debonding and splitting
rest on assumed details. Not modelled: sidewalks, rail on approach slabs.

## CDOT rules update (applied 2026-11-13, the owner's "apply all five")

After a review against BDM 2026's wording:

1. **Higher girder strengths** (5.3.1.2): a girder setting, *Higher f′ci or f′c approved by the Unit Leader
   with the State Bridge Engineer* (`highStrengthApproved`). Set, the 6.5 / 8.5 ksi checks are shown for
   information. I-05-VA has it set (its sealed plans specify 7.5 / 9.0 ksi).
2. **Harp point** (5.5.1.5 "should"): for information. It was already measured on the girder's length.
3. **Integral abutment depth**, deck top to cap bottom (11.3.1 "typically" 13 ft): for information. The
   6 ft maximum ("shall") and 3.5 ft minimum cap depths stay checks. I-05-VA's abutment cap (seat to the
   cap's bottom, 7.46 ft in its IDC) is genuine and still fails the 6 ft.
4. **Approach slab distribution**: when the bars are CDOT's B-601 standard detail (#5 at 12 in), the check is
   for information; other bars are checked.
5. **Humidity** (5.3.3 "shall"): under CDOT criteria, creep and shrinkage use 55 % whatever is entered
   (`criteriaInputs`, used by `designGirder` and the calc).

Also: a *Live load distribution* choice in the girder editor (AASHTO's tables or the lever rule). Tests:
`girders/cdot-rules.test.ts`. The three bridges were re-synced and their calcs remade. Remaining failures:
I-18-BC girders 3 (longitudinal reinforcement at the bearing, 5.7.3.5, strands into the diaphragm not
counted); I-05-VA girders 12, abutment cap depth, pier cap construction tie 1.21; F-19-AGA girders 10
(debonding and splitting, on assumed details), pile geotechnical 1.05 (assumed soils).

## Loads counted once (load-path audit, 2026-11-20)

The owner asked that no load be counted twice as it passes down the load path. What the audit found and fixed:

- **Braking (AASHTO 3.6.4).** Each abutment took half the bridge's braking and every pier column took all of it
  (its `longitudinal.share` defaulted to 1 and the Bridge never set it): up to twice the force. Now
  `longitudinalShares` (loadpath.ts) splits the bridge into units at its deck joints (a simple pier's joint splits
  it; that pier takes from both), works out each unit's force (every lane count with its multiple presence factor,
  the most) and shares it once by the supports' stiffness along the bridge: each support's bearings (rigid where
  fixed, cast in or on leveling pads; every girder's pad G A / hrt where they shear; a sliding bearing at its pad's
  stiffness, as it sticks below friction) in series with its substructure (the columns' 3 · 0.4 Ec Ig / h³, an
  integral abutment's piles at the movement by their p–y secant stiffness, a seat abutment rigid). Rigid supports
  take it alone, equally. AASHTO leaves the split to the engineer; the stiffness split is the usual one. The backfill's
  help to an integral abutment isn't counted (the piers keep more). The column takes its part as `share` (fixed) or
  the new `padShare` (expansion pads), the same part of the wind along the bridge.
- **Temperature (3.12.2).** The piers' distance from the point of no movement wasn't set (0: no force) and
  expansion piers had no bearing force. Now each support takes its bearings' force as the bridge moves (every pad's
  Gmax A Δ / hrt, no more than a sliding surface's friction, `bearingLineForce`), and a fixed support the reaction of
  its unit's other bearings, those either side of the point of no movement balancing (`thermalReactions`): the
  column's `bearingForce` (added to its own restraint, kc δT, when fixed) and a seat or semi-integral abutment's
  `bearingShear`.
- **The girders inside cast concrete.** An integral abutment's cap and diaphragm, a semi-integral end diaphragm
  and a continuous pier's diaphragm were weighed solid, so the girders' ends inside them, and the deck and haunch
  from each bearing line to the concrete's face, counted twice (once in the girders' reactions). Now taken off:
  `girdersInside` for the abutments (`girderInside`, off the girders' DC and each girder's load on the integral
  cap) and the semi-integral diaphragm on the bearings; `inDiaphragm` on each girder side for the pier cap, off its
  self-weight at each bearing in the construction stage (the wet diaphragm) and the completed one.
- **The line of girders.** The abutment took n × the larger of the interior and exterior reactions. Now the Bridge
  hands it the line's total (`girderTotals`: two exterior girders and the rest interior), the per-girder value kept
  for each girder's own load.
- **Checked and found counted once:** the cap's self-weight and the column's (the column adds only its own); the
  footing's from the column's base forces; a pier's intermediate diaphragms (inside the spans only); the live load
  on an abutment's foundation (lanes, not girders); the wingwalls' weight and thrust (on the abutment only, the
  wingwall itself designed apart).
- **Tests:** load-share.test.ts; f15e-chain.test.ts now expects Abutment 2's micropiles above the plans' (its
  fixed bearings take the unit's braking; the plans share it) and the bearings' diaphragm load below the calcs'
  by the girders' ends (the calcs keep them).

## The Bridge's girders, approach slabs and the AASHTO 10th check (2026-11-20)

- **Live load deflection** (2.5.2.6.2, optional in AASHTO): checked on the Bridge's girders (`llDeflection` on, L/800
  unless the design sets its own limit), the conservative choice under the owner's rule.
- **Girder ends cast into an abutment's diaphragm** (`endsCastIn`, set from the supports): at an integral or
  semi-integral abutment the positive moment connection's bars and extended strands, anchored in the diaphragm, count
  in the longitudinal reinforcement at the bearing (5.7.3.5) at their pullout capacity (C5.12.3.3.8b), as the
  connection takes them (I-18-BC's open item).
- **The rail on the approach slabs** (CDOT BDM 11.3.7): with a bridge rail, the approach slab carries it on along its
  edges, checked for Case 1 (A13.4.1) with the rail's end-zone Mc and T from the deck design; its weight goes to the
  abutment with the slab's.
- **AASHTO 10th:** the checks' citations follow the current numbering (Section 5's 8th-edition reorganization:
  flexure 5.6, shear 5.7, strut-and-tie 5.8, anchors 5.13). The load factors were checked against Table 3.4.1-1, with
  two fixes in the seat abutment's statics: braking in Service I was 1.75 (now 1.0), and it was missing from Strength I's
  minimum set.
- **Not changed:** curved girders (chorded) remain to
  be built as features.

## The remaining checks, steps 5 to 8 (2026-11-20)

- **Step 5, the analysis model:** temperature, wind, the fatigue truck, CDOT's permit vehicles, live load deflection and
  Table 3.4.1-1's other combinations (docs/bridge-module-spec.md, "the remaining loads and combinations"). The bearing
  design link takes the live load alone (Service I's envelope now also carries temperature and wind, which the bearing
  design takes itself).
- **Step 6, girders:**
  - **Steel:** the three-span Service II difference is the reference program's modulus of rupture, not ours
    (docs/steel-girder/benchmarks.md). Single-span constructibility stays within about 2%, the rest being one
    lateral-bending input.
  - **I-05-VA, on the plans' own details:**
    - "no sag" at 1.12 and the pier-bottom compression at 1.02 (with the prestress built over its transfer length);
    - the abutment cap 7.5 ft deep against CDOT's 6 ft;
    - the cap's construction tie at 1.19 (the cap alone before its diaphragm, the conservative stage chosen in step 2).
    These are findings on the plans, not code errors.
  - **F-19-AGA:** its debonding, splitting, wingwall hook and deck distribution fail on assumed details, as before.
- **Step 7, AASHTO 10th:**
  - no Section 5 numbers from before the 8th edition's reorganization remain;
  - Eq. 5.4.2.4-1 everywhere (the Three-Sided Culvert's 1820√f′c fixed);
  - the Bridge's combinations follow Table 3.4.1-1.

## Steel plate girders (2026-11-20)

The Bridge takes a steel plate girder ("Steel plate girder" in the girder choice, its plates in a table: each segment's
length along the bridge, web and flanges, as the Steel Girder Design Check takes them; lengths scaled to the bridge's).

- **Analysis** (src/lib/bridge):
  - **Sections:** each segment is an outline (steelShape) with its own steel and composite sections, so the grillage
    is non-prismatic. The material is steel (E 29,000 ksi, α 6.5E-6), and n = Ec/Es.
  - **Stage 1:** the girders are continuous for their weight and the deck where the bridge is (spliced at erection),
    not simple as precast girders are.
  - **Cross-frames:** a beam of two L5×5×1/2 chords in place of a concrete diaphragm.
  - **Benchmark:** against the Steel Girder Design Check's line analysis of the same plates (itself held to FHWA
    Example 2A and NSBA's designs):
    - the deck on the steel, the pier's moment per klf within 1% (−1,072 against −1,080);
    - the wearing surface on the composite bridge within 1.5% (n against the check's 3n).
  - **Example 2A's own printed pier moments** (−1,020 per klf) don't follow from its stiffer pier plates (noted in the
    steel check's benchmarks), so the check, not the printed table, is the reference.
- **Designs:** the Girders link starts a Steel Girder Design Check with the bridge's spans, plates, deck, barriers,
  wearing surface and wind, the cross-frames at the diaphragms' places. One design for the whole girder line.
- **The Bridge's load path** (src/lib/design/bridge):
  - **runBridge's steel run** (runSteelBridge, steelFromBridge) designs the girders by the steel check (the linked
    design's details kept, its haunch from the slab offset). Each support takes the check's reactions per girder:
    - dead loads from the continuous girder's shears, DC1 apart;
    - live load from the support's influence line with IM, by the shear distribution factor.
  - **Bearings and abutments** take these as they take precast girders'.
  - **Pier caps:** each side takes half the pier's reaction (steelSide), with the live load placed by lanes from
    simple spans.
  - **The rest:**
    - the calc package carries the steel check's calc, checks and 509 quantities;
    - the IFC model's girders are structural steel with the steel design's pset.
- **The substructure's other loads** (src/lib/design/bridge, 2026-11-20):
  - **The girders' stand-in** (steelStandIn, on the run): the steel girders as a precast design's inputs, the deepest
    segment's outline as a custom section, the steel design's spans, deck and haunch, the site's wind from the steel
    design (else the Bridge's environment) and the barrier's height from the rail (else the environment's).
  - **Wind along the bridge** on the piers and abutments (windAlong) and **the caps' wind** (steelSide) from it,
    as for precast girders (3.8.1.2.3a).
  - **The columns' links** read the stand-in: their spans and width, and the superstructure's depth for wind, the
    steel's (no longer the library's deeper default).
  - **Girders inside cast concrete** (girdersInside, the cap's inDiaphragm): the steel of the segment at the support
    (0.490 kcf) from the girder's end to the block's face, the deck and haunch from the bearing line to the face.

## Temperature gradient (2026-11-21)

AASHTO 3.12.3, an option on the Bridge's temperatures ("Temperature gradient": not considered, or the solar radiation
zone of Figure 3.12.3-1, and whether the deck has an asphalt overlay). Off by default: CDOT BDM 14.3 says the gradient
"may be considered where appropriate", and C3.4.1 notes open girder bridges have usually been designed without it.

- **The gradient** (Figure 3.12.3-2): T1 at the deck's top and T2 4 in down from Table 3.12.3-1 (zone 1: 54 and 14 °F),
  nothing 12 in below that (A = 12 in; T3 = 0), measured from the structural deck's top. The same profile is used for
  steel girders (A = 12 in for steel superstructures).
- **In the frame** (generate.ts gradientOn): on each composite section (precast interior, exterior and right; each
  steel segment's), the gradient over the transformed widths (the deck at n, and α deck/α girder for steel) gives a
  uniform temperature (the axial strain over α) and a linear gradient (the curvature over α). The solver holds the
  free curvature at the element's ends (a constant moment E·I·κ), so continuous spans and restrained supports get the
  restraint moments and reactions; a simple span bows freely. The self-equilibrating stresses aren't in the frame.
- **Cases:** "Temperature gradient, positive" and "negative" (−0.30 the positive for a plain concrete deck, −0.20
  with an asphalt overlay), alternatives in a combination as the rise and fall are.
- **Combinations** (Table 3.4.1-1, C3.4.1): 0.50 TG in Service I and III (with live load), none in Strength.
- **Tests:** temperature-gradient.test.ts: the section's parts against hand integration; two equal spans' pier moment
  1.5·E·I·α·gradient (sagging for a positive gradient); the Bridge's cases and factors.
- **Not yet:** the girder designs' own TG stresses (the prestressed and steel checks don't take the gradient).

## Sidewalks (2026-11-21)

The Bridge takes a sidewalk on either side ("Sidewalk, left / right", ft wide, 0 for none; its depth above the deck).
Each sidewalk sits inside its edge's barrier, raised, with a curb at the roadway.

- **Analysis** (src/lib/bridge):
  - **Roadway:** the lanes run between the curbs (the layout's roadway, the moving load's arrangements); no wearing
    surface on the sidewalks.
  - **"Sidewalks"** (DC, composite): the concrete, 0.150 kcf × width × depth.
  - **"Pedestrians"** (a PL case): 0.075 ksf on a sidewalk wider than 2 ft (3.6.1.6), with the vehicles. Its factors are
    live load's in every combination (Table 3.4.1-1 groups PL with LL), none in fatigue; no dynamic allowance.
  - **Placement:** each sidewalk as lines of load 0.5 ft apart or closer: to the two girders either side as a simple
    span of the deck, or, outside the exterior girder, onto it with its moment (as a barrier's).
- **The girder designs** (the Bridge's links; sidewalkLoads):
  - the narrower sidewalk's width moves the curb in (the lanes, the lever rule and de of the exterior girder, the
    wearing surface's width): the wheel nearer the exterior girder, the conservative side;
  - the sidewalks' concrete (DC2) and pedestrians shared equally by the girders, klf each;
  - **precast check:** wDC2 and the calc's w_DC2 gain the concrete; the pedestrians (w_PL) are added to M_LL and V_LL at
    live load's factors, without IM or a distribution factor (continuous as the superimposed loads are);
  - **steel check:** dc2 and the live load's envelope (llPos, llNeg, V) gain them the same way;
  - **pier caps:** the girder side's DC gains the concrete, and the lanes keep to the curbs.
- **The substructure** (2026-11-21): each support's live load reaction per girder gains the pedestrians' (wL/2 on a
  simple span, the continuous beam's end shears over a continuous pier; a steel line by its reaction's influence line,
  where it adds), so the bearings and abutments take them. A pier cap places each girder's pedestrian reaction with
  every lane arrangement (GirderSide.pl), at live load's factors, without the multiple presence factor.
- **The deck design** (2026-11-21; DeckInputs.sidewalk, entered in the Deck Slab editor or from the Bridge):
  - the sidewalk's concrete in the strip's dead load and the overhang's; no wearing surface on it;
  - the wheels 2 ft from its curb (1 ft for Case 3), the lanes counted between the curbs;
  - pedestrians, 0.075 ksf where wider than 2 ft, in the strip's live load moment where they add and in Case 3
    (1.75 M_PL3, no IM); the collision Cases 1 and 2 at the barrier unchanged;
  - the Bridge's link: the sidewalk if both sides match, else the side whose Case 3 works hardest (the deck design is
    one overhang).
- **Tests:** src/lib/bridge/sidewalks.test.ts.
- **Not yet:**
  - the sidewalks in the drawings, the 3D model and the quantities;
  - slab bridges' sidewalks.

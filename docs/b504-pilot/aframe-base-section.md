# Micropile A-frame base (and tiered walls): pilot content (draft 2026-11-24)

Sheet-ready content for the fourth base-type sheet (proposed B-504-B4), with the same layout as the core-wall and
truncated-base sheets. It replaces six section sheets, and the A-frame design notes on V2 and V6 move to it:

|  | ¾:1 soil cut | ½:1 rock cut |
|---|---|---|
| Block facing MSE | A3 | A5 |
| Panel facing MSE | D3 | D5 |
| Block facing GRS | L3 | L5 |

**What the A-frame is:** a truncated-base wall whose rail, curb and cap beam stand on their own pair of micropiles: a
vertical pile and a 30° battered pile at 5'-0", staggered. The rail's impact goes to the ground through the piles, not
through the soil reinforcement. V2: "Rail, curb, and micropile are externally stabilized and independent of design
height."

**Shared with the earlier sheets:**
- the wall section (truncated soil or rock: `truncated-base-sections.md`, §1);
- the quantity tables (B-504-Q3/Q4 for the wall, Q5/Q6 where the excavation height is below 1.5 + 4 tan θ);
- the facing insets and notes.

**Below:** what the A-frame adds, its design table by test level, and the fixes. `[Decide]` and `[Verify]` as before.

**Tiered walls:** the application guide points to B-504-S2 for them, but S2 isn't in the worksheet set in the Drive.
Tiered walls stay on S2 (decision AF4).

---

## 1. The drawing: what the A-frame adds

**Micropiles:**
- 8 in diameter, #18 Grade 75 all-thread bar;
- a vertical pile and a battered pile at 30° from vertical, each at 5'-0", staggered (not in the same plane). On
  B-504-V6's battered-micropile variant they are in the same plane, at 50°;
- cased through the reinforced zone with 8 in standard pipe (A36 permanent casing, 4 in diameter by 0.5 in wall at
  the cap);
- casing socketed into rock 1'-0" minimum where rock is reached;
- bond lengths L1 (vertical) = L2 (battered) beyond the casing, from the design table below.

**Other A-frame items:**
- **Sacrificial pilot pipe:** 4 in PVC, 8'-0" long, pre-installed in the reinforced fill at each pile.
- **Cap beam:** Concrete Class D, #5 bars (8 and 10 longitudinal, #5 @ 8 in ties), 3 in clear all around. Bearing
  plates 10 × 10 × 1 in (15 × 10 × 1 in under the battered pile), two hex nuts per pile, ½ in expansion joint
  material, continuous 6 in neoprene waterstop.
- **Curb:** the rail's curb raised 3 in under asphalt pavement.
- **Clearances:** the vertical pile's casing at least 6 in behind the facing; coring through the leveling pad is
  allowed.
- **Pile table** (on the sheet, per wall): station, top of cap beam elevation, estimated and actual bedrock
  elevations, minimum bond length, micropile pay length, casing pay length.

## 2. Notes (A-frame)

1. **Design basis:**
   - The rail, curb, cap and the two micropiles form an A-frame that carries the barrier's impact to the ground. The
     soil and the soil reinforcement aren't counted.
   - The pile forces come from the three-force free body of the A-frame, with the test level's dynamic load Ld
     (design basis Table 4) spread over `[Decide: 10.83 ft as now]` of wall.
2. **Micropiles** (AASHTO 10.9):
   - Grout at least 6 ksi; grout-to-ground nominal bond 16.5 psi unless the geotechnical report gives more.
   - Resistance factors at the extreme event per AASHTO 10.5.5.3.
   - Bond lengths L1 and L2 per the design table, and at least 10'-0".
   - Buckling isn't a concern in soil (V2).
3. **Spacing:** 5'-0" typical, staggered. It may increase to 10'-0" where the geotechnical report shows deep-seated
   slope stability with FS > 1.3 and the bond strength supports it.
4. **Load tests:**
   - One verification test pile per 100 ft of wall, at least two per wall: one vertical and one battered;
   - ASTM D1143 (compression) and ASTM D3689 (tension);
   - maximum vertical displacement ¼ in at 1.0 DL.
5. **As-built:** project inspectors record actual bedrock elevations on the as-built drawings.
6. **Construction sequence and settlement:**
   - Phase I: the micropiles. Phase II: the MSE blocks or panels and the backfill.
   - The geotechnical report gives the anticipated MSE settlement. Roadway construction begins after at least 45 days,
     or 90% of the anticipated settlement.
7. **Interference:**
   - Soil reinforcement may be spliced or modified to avoid the battered pile and casing.
   - The drains may be modified (pierceable filter fabric, holes) where they conflict with the piles.
8. **Casing:** the casing extends into bedrock to the start of the bond length. Starter casing for rock has carbide
   sinter bits and may be reused.

## 3. Design table: A-frame micropiles by test level

**What V2 states:** a TL-4 load of 54 kips over 10.83 ft of wall at 5'-0" spacing:
- 8.663 kip/ft compression on the vertical pile;
- 9.970 kip/ft tension on the battered pile.

**Reproduced:** the battered pile's tension, 9.970 × 5 = 49.9 kips, equals the bond on 10 ft of an 8 in pile at
16.5 psi: π × 8 in × 120 in × 0.0165 ksi = 49.8 kips, at φ = 1.0. **V2's 10 ft minimum bond is therefore exactly
sized for the pre-MASH 54 kip load.**

The impact dominates the pile forces, so they scale with Ld. At the same spread length and spacing:

| Test level | Ld (kips) | Factor on V2 | Battered pile tension at 5'-0" (kips) | Bond length L2, 8 in, 16.5 psi (ft) | Or spacing for L2 = 10 ft (ft) |
|---|---|---|---|---|---|
| AASHTO TL-4 (V2 as drawn) | 54 | 1.00 | 49.9 | 10.0 | 5.0 |
| TL-3, TL-4-1 | 70 | 1.30 | 64.6 | 13.0 | 3.9 |
| TL-4-2 | 80 | 1.48 | 73.9 | 14.8 | 3.4 |
| TL-5-1 | 160 | 2.96 | 147.8 | 29.6 | 1.7 (impractical) |
| TL-5-2 | 260 | 4.81 | 240.2 | 48.1 | 1.0 (impractical) |

The vertical pile's compression scales the same way: 43.3 kips at 5 ft for 54 kips, 64.2 kips for TL-4-2.

**Caveats:**
- The bar (#18 Grade 75, 4.0 in², 300 kips nominal) isn't the limit for TL-3 and TL-4.
- These are scaled estimates. The final sheet should show the three-force solution for each test level, with the
  A-frame's geometry and the spread length `[Decide]`.
- Web Doc 326 doesn't give a spread length for pile-supported barriers.

## 4. Fixes found on the six section sheets and V2

| # | Sheet(s) | Issue | Fix |
|---|---|---|---|
| AF-F1 | V2 | Designed for the pre-MASH 54 kip TL-4 load; the sheet says "Design must be updted for current MASH loads" ("updted") | The table above; "updated" |
| AF-F2 | L5 | RL(min) column 0.325 DH, as on the GRS rock sheets L4, M3 and N3 (truncated-base fix T1). The same error in a fifth sheet points to a template error | max(0.45 DH, 4 ft) |
| AF-F3 | D3, D5 | Examples cite "B-504-H2" on rail anchor slab sheets (H1), as on D1 and D4 | H1 |
| AF-F4 | D5 | Title "Micropile A-frame with panel facing MRS wall" ("MRS" for MSE) | "MSE wall" |
| AF-F5 | A3, D3, L3 | Casing written three ways: "8"ß-Standard Pipe", "8-STD pipe", "8-Standard pipe" | One callout: "8 in standard pipe casing (A36)" |
| AF-F6 | A3 vs V6 | Battered pile at 30° and staggered (A3, V2), but 50° and in the same plane (V6, V2 note 12) | State both as options, with the design table per angle |
| AF-F7 | V2 | "accomodate" | Spelling |

## 5. Decisions

| # | Decision | Recommendation |
|---|---|---|
| AF1 | Spread length of the impact along the wall for the A-frame | Keep 10.83 ft (V2) unless CDOT has a MASH basis, and state it |
| AF2 | TL-5 on an A-frame | Not as a standard detail: about 30 ft bond or 1.7 ft spacing. Project-specific design |
| AF3 | TL-4-2 standard | 15 ft bond at 5 ft, or 10 ft bond at 3.4 ft spacing (use 3'-4") |
| AF4 | Tiered walls (S2) | S2 isn't in the Drive set. Find the current S2 and review it, or drop tiered walls from the application guide |

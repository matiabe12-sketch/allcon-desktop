# Slab bridges and adjacent box beams (plan, 2026-11-20)

The next slot in docs/design-tools-schedule.md. Two superstructures that aren't girders under a deck, for the short
spans an everyday bridge engineer meets: a cast-in-place concrete slab spanning between the supports, and precast
prestressed boxes or slab beams laid side by side. AASHTO LRFD 10th; CDOT BDM where it sets a rule.

## What exists already

- The girder check (girders/prestressed.ts) has a CDOT 35 × 66 in box and AASHTO's type (f) distribution: boxes side
  by side **under a cast-in-place composite deck** (Table 4.6.2.2.1-1; CDOT BDM 5.5.2.1 G's 5 in minimum deck). Its
  flexure, shear, stresses, losses, camber and so on all apply to a box as to any girder.
- The Bridge lays girders out at a spacing; boxes there are placed like girders.

## 1. Adjacent box beams (in the girder check, not a new tool)

- **The box library:** CDOT's standard box and slab beam sections by depth and width (the 3 ft and 4 ft wide boxes,
  the voided slab beams), with their published properties, beside the 35 × 66 in box.
- **Type (g) as well as (f):** boxes with no structural deck, an overlay on them, joined by grouted shear keys and
  transverse ties: AASHTO Table 4.6.2.2.1-1's type (g) where the keys and ties make them act as a unit (4.6.2.2.1:
  transverse post-tensioning, or the lever rule where they don't), its moment and shear factors (Tables
  4.6.2.2.2b-1, 4.6.2.2.3a-1) and skew corrections.
- **The transverse connection:** the shear keys (5.12.2.3.3: full-depth grouted keys; the transverse post-tensioning
  or tie rods' force from 4.6.2.2.1's 0.25 ksi average prestress over the key's depth, or the tie rods' design as the
  CDOT details give them), and the 5.12.2.3 rules for box beams (the top and bottom flanges' least thickness, the
  webs').
- **The overlay on the boxes** (type g): its weight as DW, no composite deck; the boxes' top surface the riding
  surface's base.
- **The Bridge:** "Adjacent boxes" as a superstructure choice: the spacing is the box's width plus the joint, and the
  deck is either a composite slab (f) or an overlay (g). The bearings, abutments and piers take them as they take
  girders.
- **Quantities:** by the square foot of box (CDOT 618), the keys' grout and the ties.

## 2. Cast-in-place slab bridges (a new tool, and a Bridge superstructure)

- **Spans:** one to four, simple or continuous over the piers (cast monolithic), constant depth (a haunched slab
  later). Skew to 45°.
- **Live load:** the equivalent strip (4.6.2.3: one lane E = 10 + 5√(L1W1), multiple lanes E = 84 + 1.44√(L1W1) ≤
  12W/NL, the skew factor r = 1.05 − 0.25 tan θ ≤ 1.00), the HL-93 truck, tandem and lane loads by influence lines,
  the dynamic allowance on the trucks; the edge strip (4.6.2.1.4b), the width an edge beam carries.
- **Checks per strip:** flexure (5.6.3.2) at midspans and over the piers, minimum reinforcement (5.6.3.3), crack
  control (5.6.7), shear (5.12.2.1: a slab designed for moment by 4.6.2.3 is deemed satisfactory for shear; the edge
  beam checked by 5.7.3.3), fatigue of the bars (5.5.3.2, Fatigue I), live load deflection (2.5.2.6.2, as the
  girders now check it), the least depth (Table 2.5.2.6.3-1, 1.2 (S + 10)/30 for a simple span, (S + 10)/30 ≥ 0.54 ft
  continuous), distribution reinforcement on the bottom (9.7.3.2: 100/√L ≤ 50% of the main), shrinkage and temperature
  (5.10.6), the edge beam (9.7.1.4: the strip with the barrier, or a beam deepened under it).
- **Dead load:** the slab, the barriers on the edge strips, the overlay (DW); creep and shrinkage don't apply (no
  prestress).
- **Substructure loads:** each support's reaction per foot of the slab's width, for the abutments and piers as the
  Bridge hands girders' reactions now (with the load path's once-only rules).
- **Calc package, details and quantities:** the strips' moments and checks as live math; the plan and section with the
  bars; the bar schedule and CDOT pay items (601 concrete, 602 bars).
- **Benchmarks:** a published example to hold it to (the FHWA or a state's slab bridge design example, and an AASHTO
  Appendix), found before building.

## Order and effort

1. Adjacent boxes, type (g), shear keys and ties, the box library, in the girder check and the Bridge: one slot.
2. The slab bridge tool with its calc package, details and quantities: one to two slots.
3. The slab bridge as a Bridge superstructure (layout, reactions to the substructure, the IFC model): one slot.

## Decisions for the owner

- **CDOT's box and slab beam sections:** the list I'd take is the CDOT Bridge Worksheets' (B-618 series) or the
  Precast Concrete standards; if you have the current worksheet or a project's sheets, they'd settle it.
- **Type (g) ties:** CDOT's usual detail (tie rods, or transverse post-tensioning) for adjacent boxes without a deck.
- **The slab bridge's benchmark:** a CDOT slab bridge's plans and calcs, if you have one, besides the published
  example.

## Built (2026-11-20)

**Adjacent boxes and slab beams (in the girder check).** CDOT's sheet B-618-BX settled the plan's open points: the
box is parametric (W and D by design; walls 6 in, the top slab 4 in, the bottom 6 in at midspan), "Keyways for side by
side boxes shall not be used", the boxes always take a cast-in-place deck, and "Harped designs shall not be used".
B-618-SL's slab beam is a solid W × D beam, also under a deck. So, CDOT BDM first:
- **Type (g), the shear keys and the transverse ties: not built** (CDOT forbids keyways; its boxes and slabs are type (f)
  under a deck).
- **The library:** `cdotBox(D, W)` and `cdotSlab(D, W)` (sections.ts): the usual sizes listed (boxes 27–48 in deep by 36
  or 48 in, slabs 12–21 in by 36 or 48 in), any size by id (`cdotbox-D-W`, `slab-D-W`), the properties worked out from
  the outline. Family "Prestressed slab" for the slab beams; `isAdjacent` for both.
- **Distribution:** type (f) for slab beams too, J = A⁴ / (40 Ip) (Eq. C4.6.2.2.1-3) for the solid section, de from the
  slab's edge.
- **CDOT rules:** the box and slab camber tolerance (±50%, BDM 5.5.2.1 D); a slab beam's camber at 90 days (B-618-SL
  note 5); boxes and slabs straight-stranded (`cdot-no-harp`); strands across a slab beam's whole width.
- **The Bridge:** boxes and slab beams are picked as the girder; the spacing must be at least their width.

**The slab bridge tool** (`slab-bridge`, src/lib/design/slabs): engine, calc package, editor, take-off and pay items,
as planned in section 2, with one to four spans simple or continuous. Its HL-93 effects come from the continuous beam's
influence lines (girders/continuous.ts, held to PGSuper within 1–1.5%). The edge strip carries the larger of half the
lane's envelope and the lane's tributary part, × 1.2 (conservative: the envelope doesn't split the truck from the
lane), and half the fatigue truck. Live load deflection is on the gross section, the whole width deflecting together.
Tests: slab-bridge.test.ts (the strips, the tandem and lane moments at midspan, DL, the least depth, distribution bars,
the reactions' total, the calc package against the engine, the take-off); adjacent.test.ts.

**Not yet:** the slab bridge in the Bridge model (the plan's third slot), and a published or CDOT slab bridge example to
benchmark against.

## The slab bridge in the Bridge model (built 2026-11-20)

- **The choice:** the Bridge section's girders form has "Superstructure (the Bridge design)": girders under a deck, or a
  cast-in-place slab bridge (`superstructure: "slab"` on the definition and the Bridge record). The deck's thickness is
  the slab's depth; the girder lines are its bearing lines at the spacing; the design target is the Slab Bridge (`slab`,
  `slabDesignId`) in place of the girders and the deck.
- **The run** (bridge.ts `runSlabBridge`, `slabFromBridge`): the slab's spans bearing to bearing, continuous where every
  pier is continuous, the width, the CDOT rail's weight, the skew, the overlay; each support's reactions on its bearing
  lines, the slab's per foot times each line's width (interior the spacing, exterior half of it and the overhang), so
  the abutments, bearings, caps and columns take a slab as they take girders, once (the line totals are the slab's).
- **The load path:** the Slab Bridge design created or updated; no girder or deck designs. A pier cap gets the slab's
  lines from both sides, half each (`slabSide`), the live load placed by lanes as for girders; no wet-diaphragm stage
  (the slab's weight is already in its reactions). The columns' braking and wind along the bridge take the slab's spans
  (a stand-in girder record: its wind depth the girder section's with the slab's, conservative).
- **The model and calc:** the slab drawn as the deck at its depth, its bearings at the lines, no girders; the Bridge's
  calc package and quantities carry the slab design.
- **Not yet:** the Bridge section's own grillage analysis still models girders (the slab design is the one that
  governs), and the 3D rebar view doesn't draw the slab's bars.
- Tests: src/lib/design/bridge/slab-bridge.test.ts.

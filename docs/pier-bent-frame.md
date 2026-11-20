# The pier bent by beam theory and the frame (plan, 2026-11-20)

The schedule's slot: "multi-column bent as a frame, cap flexure and shear between columns (where the strut-and-tie
model's D-regions don't govern)", AASHTO 4.5, 5.6, 5.7.

## What exists already

- **The column tool** (piers/column.ts) analyzes the bent as a plane frame (piers/frame2d.ts): the cap a beam on its
  columns, rigid joints, the columns fixed at their bases or on drilled shafts to their point of fixity, with every load
  case from the cap's girder link (Strength I, III and V with wind across the bridge, Service I), braking, wind and
  temperature along the bridge and collision. It designs the columns from it.
- **The strut-and-tie tool** designs the cap's D-regions, and with "Check the B-Regions by the sectional method" checks
  the B-regions by beam theory: flexure (5.6.3.2, φ by εt), minimum steel (5.6.3.3), shear by the General Procedure
  (5.7.3.4.2), stirrup spacing and minimum (5.7.2.5, 5.7.2.6), longitudinal reinforcement for shear (5.7.3.5), skin
  steel and now crack control (5.6.7). But its forces come from **a continuous beam on pinned column centerlines**,
  not the frame, and a cap whose every region is a B-region still goes through the strut-and-tie model.

## The gap, and what I'd build

1. **The cap's forces from the frame.** The sectional check takes the cap's moments and shears from the same plane
   frame the column uses (rigid joints, the columns' stiffness and base fixity, cracked sections by 5.6.4.3's 0.4 Ec Ig
   for columns as the column does, the cap gross or cracked by the owner's choice), for every load case, wind across
   the bridge included. The joints' rigidity moves negative moment out of the cap into the columns (the pinned beam is
   conservative at the faces and unconservative near midspan of the spans); the frame is AASHTO 4.5.3's "elastic
   analysis" the cap should be designed for.
2. **A cap designed by beam theory throughout ("Design method: beam theory").** Where every region is a B-region (all
   loads two or more depths from the columns' faces, 5.8.2.1), or where the owner chooses it for a bent cap, the cap is
   designed by the sectional method alone, no strut-and-tie model: flexure at each column face (5.6.3.2, at the face per
   C5.6.3.1 / 4.6.2.1.6's practice), the largest positive moment in each span, shear at dv from each face and at the
   loads (General Procedure), torsion where the bearings sit off the cap's centerline (5.7.2.1, with the loads along
   the bridge from today's `cap-along.ts`), minimum, crack control, skin steel, the bars' development and cutoffs
   (5.10.8, 5.10.8.1.2 extension past the point of inflection), and the overhangs as cantilevers.
3. **One analysis for the cap and the columns.** The column and the cap read the same frame results, so their forces
   agree (today the cap's are the pinned beam's, the column's the frame's).
4. **The Bridge.** The pier's cap method (strut-and-tie or beam theory) on the support; the load path designs the cap by
   the chosen method and the column from the same frame.
5. **Calc package:** the frame (its model and each case's moment diagram), the governing sections as live math, the bar
   cutoffs; quantities unchanged (the cap's bars from its details).

## Decisions for the owner

- **Where it lives:** inside the strut-and-tie tool as its "beam theory" method (one cap design, either method, the
  details and quantities shared), which I recommend, or a separate "Pier Bent" design.
- **Cap stiffness in the frame:** gross (the usual for a cap at service), or cracked 0.5 Ig (the conservative choice for
  the columns' moments)? I'd take gross for the cap and 0.4 Ec Ig for the columns, as the column tool does, with an
  option.
- **When beam theory is allowed:** only where every region is a B-region (AASHTO 5.8.2.1's rule, the conservative
  reading), or by the owner's choice for any bent cap (CDOT BDM 11.4? I'd look up CDOT's practice before building).

Effort: one slot.

## Built (2026-11-20), inside the strut-and-tie tool

- **The method** (`method` on the cap): "Recommended" (the default) picks from the inputs and the code: beam theory
  where every loaded region is a B-region (its loads 2h or more from the columns' faces, AASHTO 5.8.2.1 and
  5.5.1.2.1), the strut-and-tie model where any isn't (or the model isn't a standard cap); the result says which and
  why (`r.method.summary`). The designer may choose "Strut-and-tie model" or "Beam theory throughout"; beam theory with
  D-regions present is flagged (advisory: 5.8.2.1 says the strut-and-tie model should be considered there). Under beam
  theory the cap's checks are the sectional design's over every loaded region, the model's kept for information
  (`stmChecks`); a two-stage cap's completed member by its method, its construction stage by the model.
- **The forces** (`frameForces`, sectional.ts): the bent as a plane frame with its columns (rigid joints, the columns
  fixed at their bases or on a shaft to its point of fixity, gross sections, Ec by Eq. 5.4.2.4-1), the same frame model
  the column tool designs the columns from; the loads on a ½ ft grid of the cap's nodes. The Bridge sets the frame from
  its pier (`frame`: the columns' height, shape, size and base). Without it, the beam on pinned column centerlines as
  before. The frame solver (piers/frame2d.ts) now eliminates once for every load case.
- **Added checks:** a cantilever's top bars developed from each section to the cap's end for the stress they carry
  there (5.10.8.1.2, 5.10.8.2.1 or 5.10.8.2.4 as the bars end); crack control in every designed region (earlier today);
  the loads along the bridge (cap-along.ts, earlier today).
- **The calc package:** a beam-theory cap's calc is the method and why, its materials and loads, then the sectional
  design (no strut-and-tie model); the checks' summary under "Beam theory".
- **The editor:** the cap's "Strut-and-tie or sectional" card has the method choice with the recommendation.
- **Settled:** the cap gross and the columns gross in the frame (as the column tool's frame takes them); beam theory
  allowed anywhere by the designer's choice, recommended only where 5.8.2.1 allows it.
- Tests: stm/bent-frame.test.ts.

# Design tools schedule

The tools still missing before ALLCON covers a typical highway bridge and its roadside structures,
one every two or three days (Monday, Wednesday, Friday), after the foundations and abutments
(docs/foundations-and-abutments.md, built 2026-11-12/13). Each follows the same pattern: a plan in
docs/ to agree first, then the engine, editor, calc package, details and quantities, tests, and
the desktop rebuild. The larger tools take two slots, in phases.

| Date | Tool | Scope | Main references |
|---|---|---|---|
| Mon 2026-11-16 | LRFR load rating: prestressed girders | Rating factors (inventory, operating, legal, permit) for the girders the girder check designs, CDOT's vehicles and posting | AASHTO MBE 6A, CDOT Bridge Rating Manual |
| Wed 2026-11-18 | Steel girders, phase 1 | Rolled and plate composite I-girders: section properties, flexure (6.10.7, 6.10.8), shear (6.10.9), constructibility (6.10.3), service (6.10.4) | AASHTO 6.10, CDOT BDM Section 6 |
| Fri 2026-11-20 | Steel girders, phase 2 | Fatigue (6.6.1), stiffeners (6.10.11), shear studs (6.10.10), cross-frames and diaphragms, camber | AASHTO 6.6, 6.10.10–11 |
| Mon 2026-11-23 | Slab bridges and adjacent box beams | CIP slab spans and adjacent precast boxes: strips (4.6.2.3), distribution type f/g (4.6.2.2), flexure, shear | AASHTO 4.6.2, 5.6, 5.9; CDOT worksheets |
| Wed 2026-11-25 | Pier cap by beam theory and the bent frame | Multi-column bent as a frame, cap flexure and shear between columns (where the STM's D-regions don't govern) | AASHTO 4.5, 5.6, 5.7 |
| Mon 2026-11-30 | LRFR load rating: steel, slab, culvert | The steel girders, slab bridges and box culverts rated the same way | AASHTO MBE 6A |
| Wed 2026-12-02 | Sign structures (LTS) | Overhead sign bridges and cantilevers: the truss, pole and arm, connections and fatigue (above the shaft that already exists) | AASHTO LTS-1 |
| Fri 2026-12-04 | Signal mast arms and high-mast lighting | Poles and arms, base plates, anchor bolts, fatigue | AASHTO LTS-1, CDOT S-614 standards |
| Mon 2026-12-07 | Soldier pile and lagging, sheet pile walls | Cantilever and anchored, embedment, lagging, anchors | AASHTO 11.8, 11.9 |
| Wed 2026-12-09 | Soil nail walls | External and internal stability, facing | FHWA GEC 7, CDOT BDM 11.5.6 |
| Fri 2026-12-11 | Three-sided and pipe culverts | Precast three-sided and arch culverts, concrete and metal pipe (AASHTO 12), headwalls | AASHTO 12, CDOT M-standards |
| Mon 2026-12-14 | Pot and disc bearings, modular and finger joints | The larger bridges' bearings and joints | AASHTO 14.7.4, 14.7.8, 14.5.6 |
| Wed 2026-12-16 | GRS abutments and noise walls | Geosynthetic reinforced soil abutments, CDOT's sound walls | CDOT BDM 11.3.5, FHWA GRS-IBS; CDOT standards |

Already in ALLCON and so off the list: continuous prestressed girders (the girder check's
continuity, girders/continuous.ts).

Not planned: cast-in-place post-tensioned box girders (specialist, heavy, outside "lightweight,
everyday"), and seismic design for Zones 2–4 (Colorado is nearly all Zone 1).

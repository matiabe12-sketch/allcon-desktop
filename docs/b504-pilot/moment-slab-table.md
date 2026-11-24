# Moment (rail anchor) slab design table: pilot content (draft 2026-11-24)

Sheet-ready content for a new sheet that gives the rail anchor slab a design basis, next to the details on B-504-V1.
Today V1 shows the slab with no stated test level, load or check.

- The barrier loads, φ factors and rules come from the design-basis sheet (Note 7, Table 4), from NCHRP Web
  Document 326 Section 9.1.
- `[Decide]` marks a choice for CDOT or the owner; `[Verify]` marks an assumption to confirm against V1's DGN.
- The numbers were worked with ALLCON's moment slab engine (`src/lib/design/walls/mse-rail.ts`). That engine
  reproduces NCHRP Report 663 Appendix J: sliding φP 25.91 ≥ 10 kips, overturning φM 88.88 ≥ 35.83 kip-ft.

**Proposed sheet:** "MSE or GRS wall: rail anchor slab design", `[Decide]` number (e.g. B-504-V0, placed before V1).

---

## 1. Design method (on the sheet as notes)

1. **Loads:** the barrier-moment slab system is designed for the test level on the design-basis sheet (Table 4):
   - equivalent static load Ls for sliding and overturning;
   - dynamic load Ld for the barrier, coping and slab structure;
   - both at height He above the top of the slab.
2. **Sliding:** φ P ≥ Ls, with P = W tan φr and φ = 1.0.
   - W is the weight of the barrier, slab, coping and the pavement or soil on the slab, over the monolithic length
     between joints Lj (at most 60 ft).
   - Cast-in-place slab: φr = φ of the Class 1 backfill. Precast slab: tan φr = ⅔ tan φ.
3. **Overturning:** φ M ≥ Ls × h, with M = W × l and φ = 1.0.
   - l is the horizontal distance from W's center of gravity to the rotation point; h is the height from the impact
     down to it.
   - Rotation point A applies where the coping is isolated from the facing by the separator (CDOT BDM 13.5.4), as
     detailed. Point B applies where the coping bears on the facing.
4. **What's neglected:** coupling to adjacent slabs, shear in the overburden, and friction on the slab's sides and
   back.
5. **Coping and slab structure:** they resist Ld × (He + the depth to the critical section), distributed over the
   barrier length BL (Table 4), in flexure (AASHTO 5.6.3.2, φ = 0.9).
6. **Joints:** no transverse joints except construction joints within Lj. Adjacent slabs are joined by shear dowels
   (AASHTO 11.10.10.2).

**Least weight for sliding.** Sliding alone sets the least weight per foot of slab system:
W/Lj ≥ Ls / (tan φr × Lj). This is the quickest way to see whether a slab can work at a given length.

| Test level | Ls (kips) | Least weight per ft, Lj = 30 ft (klf) | Least weight per ft, Lj = 60 ft (klf) |
|---|---|---|---|
| TL-3 | 23 | 1.14 | 0.57 |
| TL-4-1, TL-4-2 | 28 | 1.38 | 0.69 |
| TL-5-1 | 80 | 3.95 | 1.98 |
| TL-5-2 | 132 | 6.52 | 3.26 |

Basis: cast in place, φ = 34° (tan φr = 0.675). A precast slab needs 1.5 times these.

For comparison, CDOT's V1 slab with a Type 9 barrier weighs **1.97 klf**: 8'-0" × 1'-0" slab, coping, 3 in HMA, and
the barrier at 0.486 klf.

---

## 2. Assumptions for the tabulated slab `[Verify]` against V1

| Item | Value | Source |
|---|---|---|
| Barrier | Type 9 (43 in, 0.486 klf, c.g. 9.0 in from the slab's front face, 18 in base); Type 10 MASH (43 in, 0.289 klf, c.g. 8.6 in) | B-606-9, B-606-10MASH (ALLCON's rail data) |
| Slab thickness | 1'-0" | V1 (its 0.31 CY/LF ≈ 8 ft × 1 ft + coping) |
| Coping below the slab | 6 in wide × 9 in deep | Inferred from V1's 0.31 CY/LF; `[Verify]` |
| Pavement on the slab | 3 in HMA at 140 pcf | V1 ("rail anchor slab with asphalt") |
| Backfill | Class 1, φ = 34°; cast-in-place base | Design basis Table 1 |
| Rotation point | A (coping isolated from the facing) | BDM 13.5.4 separator |
| Concrete, bars | f'c = 4.5 ksi, fy = 60 ksi, 150 pcf | Design basis Table 1 |
| Coping critical section | The slab at the barrier's toe: 12 in thick, 2 in cover, its mid-depth 6 in below the slab's top | `[Verify]`: V1's actual section may be deeper |

---

## 3. Table A: least moment slab width B (ft)

The least width, to the next 0.5 ft, by test level and monolithic length Lj. The basis is the Section 2 assumptions:
sliding, overturning and Web Doc 326's Wmin all met.

| Test level | Wmin (Web Doc 326) | Type 9, Lj = 30 ft | Type 9, Lj = 60 ft | Type 10 MASH, Lj = 30 ft | Type 10 MASH, Lj = 60 ft | Governs |
|---|---|---|---|---|---|---|
| TL-3 | 4.0 | 5.5 | 4.0 | 5.5 | 4.0 | Overturning at 30 ft; Wmin at 60 ft |
| TL-4-1 | 4.5 | 6.0 | 4.5 | 6.5 | 4.5 | Overturning at 30 ft; Wmin at 60 ft |
| TL-4-2 | 4.5 | 6.5 | 4.5 | 6.5 | 4.5 | Overturning at 30 ft; Wmin at 60 ft |
| TL-5-1 | 7.0 | 19 (impractical) | 8.5 | 20 (impractical) | 9.5 | Sliding |
| TL-5-2 | 12.0 | none up to 20 ft | 15 | none up to 20 ft | 16.5 | Sliding |

## 4. Table B: CDOT's current V1 slab (8'-0" × 1'-0", at least 30'-0" long), Type 9 barrier

| Test level | Lj (ft) | W (kips) | Sliding: φP / Ls (kips) | Overturning: φM / Ls·h (kip-ft) | Result |
|---|---|---|---|---|---|
| TL-3 | 30 | 59.1 | 39.9 / 23 | 187.8 / 86.3 | OK |
| TL-4-1 | 30 | 59.1 | 39.9 / 28 | 187.8 / 107.3 | OK |
| TL-4-2 | 30 | 59.1 | 39.9 / 28 | 187.8 / 119.0 | OK |
| TL-5-1 | 30 | 59.1 | 39.9 / 80 | 187.8 / 366.7 | **NG**, both |
| TL-5-1 | 60 | 118.2 | 79.7 / 80 | 375.6 / 366.7 | **NG** sliding (by 0.4%); OT OK |
| TL-5-2 | 60 | 118.2 | 79.7 / 132 | 375.6 / 704.0 | **NG**, both |

With Type 10 MASH (lighter, W = 53.2 kips at 30 ft) the results are the same: TL-3 and TL-4 are OK at 30 ft, and TL-5
is NG.

## 5. Table C: coping and slab transverse bars (over BL)

| Test level | Ld (kips) | Mu = Ld (He + 6 in) (kip-ft) | Bars (12 in section) | φMn (kip-ft) | V1's #5 @ 8 in, φMn = 196 kip-ft |
|---|---|---|---|---|---|
| TL-3 | 70 | 175 | #5 @ 8 in | 196 | OK |
| TL-4-1 | 70 | 181 | #5 @ 8 in | 196 | OK |
| TL-4-2 | 80 | 240 | #5 @ 6 in | 259 | **Short** (196 < 240) `[Verify section]` |
| TL-5-1 | 160 | 533 | #5 @ 4 in (or a deeper section) | 570 | **Short** |
| TL-5-2 | 260 | 1,062 | #8 @ 4 in: the 12 in section is too thin; deepen it | 1,272 | **Short** |

The barrier itself, and its anchorage into the slab, are designed per AASHTO Section 13 and the barrier's standard
sheet (crash-tested system).

---

## 6. What this shows (for the review)

1. **V1 is adequate for TL-3 and TL-4 stability** at its 30 ft least length, with margin. Overturning at 30 ft is the
   check that matters.
2. **V1 cannot carry TL-5.**
   - TL-5-1 needs a monolithic length of about 60 ft and a slab at least about 8.5 ft wide (Type 9), or a heavier
     section.
   - TL-5-2 needs about 15 ft at 60 ft.
   - Sliding governs both: the weight per foot must reach Ls / (tan φr × Lj), whatever the width.
   - If Type 9 is used as a TL-5 barrier (as B-606-9 designs it), the standard slab doesn't support that rating.
3. **V1's #5 @ 8 in transverse bars** cover TL-3 and TL-4-1 but fall short for TL-4-2 (Ld = 80 kips at He = 30 in),
   under the assumed 12 in critical section. This is the first thing to check against V1's actual coping geometry.
4. **V1's monolithic length of "at least 30'-0"" is the right lever.** Allowing up to 60 ft (NCHRP 663's upper limit)
   halves the weight needed for sliding.

## 7. Decisions

| # | Decision | Recommendation |
|---|---|---|
| M1 | The test level V1 is detailed for | TL-4-2 (the usual Type 9 and Type 10 MASH case), stated on V1 |
| M2 | TL-5 on MSE walls | A separate TL-5 slab detail (about 60 ft monolithic, 9 ft or wider, deeper coping), or TL-5 by project-specific design only |
| M3 | V1's transverse bars | Confirm the coping's critical section; if it's the 12 in slab, go to #5 @ 6 in for TL-4-2 |
| M4 | Precast moment slabs | Allow them with tan φr = ⅔ tan φ (about 1.5 times the weight), or cast-in-place only |
| M5 | The rotation point on V1 | Detail the separator and call out point A, as BDM 13.5.4 asks |

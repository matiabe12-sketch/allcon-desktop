# B-504-A C, MSE or GRS wall design basis: pilot content (draft 2026-11-24)

Sheet-ready text and tables for the new design-basis sheet, replacing the current B-504-A C ("General Notes"). This is
the content only; the drafting is in MicroStation. Everything appears in the order the sheet reads.

- `[Decide]` marks a choice for CDOT or the owner; the open choices are listed at the end.
- `[Fill in]` marks a blank for the designer to complete per project.
- Items new or changed from the current B-504-A C are marked **(new)** or **(changed)**, for the review. Drop those
  marks on the sheet.

---

## Sheet title

**MSE OR GRS WALL DESIGN BASIS**, Sheet B-504-A C

Every other B-504 sheet references this sheet for its design values. They are not repeated on the other sheets.
**(new)**

---

## DESIGN CRITERIA

1. **Design specifications (changed).**
   - AASHTO LRFD Bridge Design Specifications, 10th Edition (2024), with current interims.
   - CDOT Bridge Design Manual, current edition.
   - GRS walls: FHWA-HRT-11-026, Geosynthetic Reinforced Soil Integrated Bridge System Interim Implementation
     Guide.
   - A traffic barrier on a moment slab: NCHRP Web Document 326 (Project 22-20(02)) and NCHRP Report 663.
   - Guidance: FHWA-NHI-10-024 and 10-025 (GEC 11), Design and Construction of MSE Walls and Reinforced Soil Slopes.

   Design life: 75 years.
2. **Excavation.** OSHA 29 CFR 1926, Subpart P (Type A soil, Type B soil, between Type A and stable rock).
3. **Drainage.** No hydrostatic pressure is assumed, with Class 1 backfill and the drainage details (B-504-W1, W2).
4. **Soils and materials.** See Table 1. The project's geotechnical report governs every soil value. Where it differs
   from Table 1, the wall is designed for the report's values. **(changed)**
5. **Loads and load factors.** See Table 2 (AASHTO Table 3.4.1-2).
   - **Live load surcharge:** at least 2.0 ft of soil (AASHTO 3.11.6.4, 11.10.10.2).
   - **Pavement (new):** taken as DW.
6. **Resistance factors (changed).** See Table 3 (AASHTO Tables 11.5.7-1 and 11.5.8).
   - AASHTO 10th lowered the geosynthetic factors: tensile 0.80 (geotextiles, geogrids) and 0.55 (geostrips); pullout
     0.70.
   - Design charts or calculations using the earlier 0.90 shall be revised.
7. **Traffic barrier (changed).** Barriers on an MSE or GRS wall:
   1. Test level for the project: `[Fill in]` (TL-3, TL-4-1, TL-4-2, TL-5-1 or TL-5-2), per CDOT BDM Section 13.
   2. **Barrier on a moment (rail anchor) slab** (CDOT BDM 13.5.4):
      - The slab is designed for sliding and overturning under the equivalent static load Ls, and its coping for the
        dynamic load Ld, both applied at He (Table 4, Web Doc 326 Section 9.1).
      - φ = 1.0 for sliding and for overturning; load factor 1.0 (extreme event).
      - Sliding resistance: P = W tan φr. W is the weight of the barrier, slab, coping and the material on the slab,
        over the monolithic length between joints, which is at most 60 ft.
        - Cast-in-place slab: φr = φ of the backfill.
        - Precast slab: tan φr = ⅔ tan φ.
      - Coupling to adjacent slabs, the overburden's shear strength and friction on the slab's sides are neglected.
      - Overturning resistance: M = W × l, about rotation point A (the coping isolated from the panel) or B (the
        coping bearing on the panel).
      - The moment slab is at least the width Wmin in Table 4.
   3. **Joints:** moment slabs have no transverse joints other than construction joints. Adjacent slabs are joined
      by shear dowels (AASHTO 11.10.10.2).
   4. **Separator:** expansion joint material, or another separator, between the moment slab's coping and the wall
      facing below, so the impact isn't transmitted to the facing (CDOT BDM 13.5.4).
   5. **Facing:** MSE and GRS facing panels and blocks are sacrificial for the vehicular collision force CT and aren't
      designed for it (CDOT BDM 11).
   6. **Impact on the soil reinforcement:** the reinforcement within the bands h1 and h2 below the top is designed
      for the dynamic pressures in Table 4 (Web Doc 326 Section 9.2), in addition to the static earth pressure.
      - Pullout: pressures pdp; resistance over the reinforcement's full length; φ = 1.0.
      - Rupture (yield): pressures pdy.
      - Each layer takes the pressure over its own tributary area At.
      - Geosynthetic reinforcement: the dynamic part is resisted without the creep reduction factor (AASHTO
        Eq. 11.10.10.2-1).
      - The required strength of the top layers is tabulated by test level and spacing on the reinforcement
        sheet `[sheet number]`.
   7. **Post-and-beam (flexible) barriers:**
      - at least 3.0 ft from the wall face;
      - driven 5.0 ft below grade;
      - spaced to miss the reinforcement where possible; otherwise the reinforcement is designed for the
        obstruction (AASHTO 11.10.10.4);
      - the upper two rows of reinforcement are designed for an added 300 lb/ft, half to each row (AASHTO 11.10.10.2).
   8. **Walls without a moment slab:** the top layers are designed for `[Decide]` (see decision D4).
8. **Seismic (changed).**
   - No seismic analysis is required for walls in Seismic Zones 1, 2 and 3 (or where As ≤ 0.4) that use the CDOT
     earthquake-resistant wall details on these sheets (AASHTO 11.5.4.2), except where:
     1. liquefaction-induced lateral spreading or slope failure, or seismically induced slope failure from sensitive
        clays, may affect the wall's stability; or
     2. the wall supports another structure that must be designed for seismic loading (for example, a bridge
        abutment foundation on the wall), where poor wall performance could affect that structure.
   - The no-analysis provision never applies to walls acting as support piers for bridges.
   - Where the wall is part of a larger slope, the overall seismic stability of the wall and slope together shall
     still be evaluated.
9. **Reinforcement length.**
   - **Core walls:** RL ≥ 0.7 DH and 8 ft (AASHTO 11.10.2.1). For walls up to 7'-4" high, the lengths tabulated on
     B-504-D1 (6 ft up to 6 ft high, 7 ft up to 7'-4") may be used.
   - **Truncated-base walls:** RL at the bottom ≥ 0.45 DH or 4 ft, whichever is greater. The reinforcement grows with
     the excavation slope above.
   - **Top two layers:** extended to 2.0 × RL (B-504-D1).
10. **Overall and compound stability (changed).**
    - Evaluated by the geotechnical engineer at Strength I with limit equilibrium methods (AASHTO 11.6.3.7). This is
      required for truncated-base, A-frame and tiered walls, and for walls on slopes or soft ground.
    - Resistance factor `[Decide]` (see decision D2):
      - φ = 0.75 (FS ≈ 1.3) where the geotechnical parameters and stratigraphy are well defined;
      - φ = 0.65 (FS ≈ 1.5) where they are highly variable or based on limited information.
11. **Embedment (changed)** (AASHTO 11.10.2.2, Table C11.10.2.2-1). Unless founded on rock, the embedment at the face
    shall be at least:
    - the frost penetration depth, where the foundation soil is frost-susceptible;
    - 2.0 ft on sloping ground (4H:1V or steeper), or where the soil in front of the toe could be removed by erosion
      or future excavation;
    - 1.0 ft on level ground with no potential for erosion or excavation;
    - along rivers and streams, 2.0 ft below the total scour depth (AASHTO 11.6.3.4).

    Table C11.10.2.2-1's guide values (H/20 for walls on level ground, H/10 for abutments, H/10, H/7 and H/5 for
    slopes of 3:1, 2:1 and 1.5:1) may be used against local bearing failure.

    CDOT minimum: the top of the leveling pad at least 1'-6" below the finished grade at the front face `[Decide]`
    (see decision D3).
12. **Bearing (changed).**
    - The bearing pressure (BP) tabulated on these sheets is the factored Strength I pressure, Meyerhof distribution,
      over L − 2e.
    - It shall not exceed the factored bearing resistance in the geotechnical report (φ = 0.65, MSE walls).
    - The geotechnical engineer confirms the factored resistance at the toe for the design height.
13. **Soil reinforcement (changed).**
    - Geosynthetic long-term strength: Tal = Tult / (RF_ID × RF_CR × RF_D) (AASHTO 11.10.6.4.3b). Unless product
      data supports lower values: RF_ID = 1.3, RF_D = 1.1; RF_CR = 2.55 (HDPE) or 1.8 (PP and PET).
    - Steel reinforcement: sacrificial thickness for the 75-year design life per AASHTO 11.10.6.4.2a.
    - Top two layers (B-504-D1): woven geotextile with Tult ≥ 4,800 lb/ft (MARV) in both directions, or an equivalent
      geogrid.
      - Under a TL-4 barrier on a moment slab, 4,800 lb/ft is adequate only with the top two layers about 1 ft apart
        or closer, so they share the impact pressure.
      - At wider spacing, or for TL-5, use the required strength on the reinforcement sheet.
14. **Engineer of Record.** The EOR may modify these worksheets in part or in whole. These design criteria and the
    Damage Avoidance Details (DAD) are CDOT's minimum requirements. The DAD include, but are not limited to:
    - coping, rail anchor slab or beam;
    - waterproofing membrane and drains;
    - truncated base excavation and backfill;
    - extended top layers of soil reinforcement;
    - panel joints, closely spaced GRS, wire basket or wrap-around facing;
    - RSF and RSW, and the leveling pad, steps and FRP stopper.

---

## TABLE 1: SOILS AND MATERIALS

| Item | Value | Note |
|---|---|---|
| Backfill (Class 1), reinforced zone: unit weight | 125 pcf | Geotechnical report governs |
| Backfill (Class 1): friction angle φ | 34° | Geotechnical report governs |
| Retained soil: unit weight, friction angle | `[Fill in]` per geotechnical report | |
| Foundation soil: factored bearing resistance | `[Fill in]` per geotechnical report | Note 12 |
| Pavement (HMA): thickness, unit weight | 12 in, 140 pcf | DW; **(new)** |
| Concrete Class D (wall) | f'c = 4,500 psi | |
| Unit weight of reinforced concrete | 150 pcf | |
| Reinforcing steel | Grade 60, fy = 60,000 psi | Epoxy coated unless noted |
| Concrete exposed to soil | Cementitious materials Class 2 (sulfate exposure Class 2) | |
| Geomembrane | 30 mil `[Decide: LLDPE or HDPE]` | D1 and W1 disagree (decision D5) |

## TABLE 2: LOADS AND LOAD FACTORS (AASHTO Table 3.4.1-2)

| Load | γ max | γ min | Note |
|---|---|---|---|
| EV, vertical earth pressure (reinforced zone, soil over it) | 1.35 | 1.00 | |
| EH, horizontal earth pressure (active) | 1.50 | 0.90 | |
| ES, earth surcharge | 1.50 | 0.75 | |
| DW, pavement | 1.50 | 0.65 | **(new)** |
| LS, live load surcharge, 2.0 ft of soil | 1.75 | 1.75 | Over the reinforced zone for bearing only |
| CT, vehicular collision (Extreme Event II) | 1.00 | | Table 4 loads |
| EQ (Extreme Event I), where analyzed | 1.00 | | γEQ for LL per AASHTO 3.4.1 |

## TABLE 3: RESISTANCE FACTORS (AASHTO 10th, Tables 11.5.7-1 and 11.5.8) **(changed)**

| Resistance | Strength | Extreme event |
|---|---|---|
| Bearing, MSE walls | 0.65 | 0.90 |
| Sliding, soil shear | 1.00 | 1.00 |
| Sliding, passive component | 0.50 | 1.00 |
| Tensile, steel strips (and connectors) | 0.75 | 1.00 |
| Tensile, steel grids (and connectors) | 0.65 | 0.85 |
| Tensile, geotextiles and geogrids (and connectors) | **0.80** | 1.00 |
| Tensile, geostrips (and connectors) | **0.55** | 1.00 |
| Pullout, steel strips and grids | 0.90 | 1.20 |
| Pullout, geotextiles, geogrids, geostrips | **0.70** | 1.00 |
| Overall and compound stability, soil failure | 0.75 or 0.65, Note 10 | 0.90 |
| Compound stability, reinforcement tensile: strips / grids / geosynthetics | 0.75 / 0.65 / 0.90 | |
| Compound stability, reinforcement pullout | 0.90 | |
| Barrier on a moment slab: sliding, overturning (Note 7) | | 1.00 |

Notes:
- Metallic reinforcement: on the gross section less the sacrificial thickness; grids connected to a rigid facing
  (AASHTO Table 11.5.7-1, notes 4 and 5).
- Bold values are lower than in earlier editions (0.90). Charts or calculations using 0.90 shall be revised.

## TABLE 4: TRAFFIC BARRIER DESIGN LOADS (NCHRP Web Document 326, Tables 9-1, 9-2, 9-4) **(new)**

| Test level | Ld (kips) | Ls (kips) | Hmin (in) | He (in) | Wmin (ft) | BL (ft) | pdp layer 1 / 2 (psf) | pdy layer 1 / 2 (psf) | h1 / h2 (ft) |
|---|---|---|---|---|---|---|---|---|---|
| TL-3 | 70 | 23 | 32 | 24 | 4.0 | 10 | 370 / 165 | 1,415 / 300 | 2.25 / 2.5 |
| TL-4-1 | 70 | 28 | 36 | 25 | 4.5 | 10 | 370 / 270 | 1,755 / 300 | 2.25 / 2.5 |
| TL-4-2 | 80 | 28 | > 36 | 30 | 4.5 | 10 | 370 / 270 | 1,755 / 300 | 2.25 / 2.5 |
| TL-5-1 | 160 | 80 | 42 | 34 | 7.0 | 15 | 725 / 400 | 3,250 / 485 | 1.6 / 2.5 |
| TL-5-2 | 260 | 132 | > 42 | 43 | 12.0 | 15 | 1,240 / 680 | 4,440 / 675 | 1.6 / 2.5 |

What each column is:

| Column | Meaning |
|---|---|
| Ld | Dynamic impact load, for the barrier and coping's structural design |
| Ls | Equivalent static load, for the moment slab's sliding and overturning |
| Hmin | Least barrier height |
| He | Height of Ld and Ls above the top of the slab |
| Wmin | Least moment slab width |
| BL | Least precast barrier length |
| pdp, pdy | Dynamic pullout and yield pressures |
| h1, h2 | Heights of the first and second pressure bands below the top of the wall |

Notes:
- Ls is governed by overturning for TL-3, TL-4 and TL-5-1, and by sliding for TL-5-2.
- The pressures act in addition to the static earth pressure. Traffic surcharge isn't added; it is included in the
  measured loads (NCHRP Report 663 C1.5.2.1).

---

## GENERAL NOTES (carried over from the current B-504-A C, unchanged except where marked)

1. All work shall be done in accordance with the latest edition of the Colorado Department of Transportation
   Standard Specifications for Road and Bridge Construction and the project special provisions.
2. Structure excavation and backfill shall be as shown on the plans.
3. Expansion joint material shall meet AASHTO M 213.
4. Grade 60 reinforcing steel is required. All reinforcing steel shall be epoxy coated unless otherwise noted; æ
   denotes non-coated reinforcing steel.
5. Concrete color for all MSE blocks shall be Dark Brown, Color No. 30108.
6. Structural concrete exposed to soil shall conform to cementitious materials requirements Class 2, corresponding to
   sulfate exposure Class 2.
7. The top of leveling pad elevations shown for MSE walls are the highest allowable elevations. In no case shall the
   top of the leveling pad be less than 1'-6" below the finished grade at the front face (see Design Criteria
   Note 11).
8. **Storm water:** the Contractor is responsible for controlling storm water drainage near the wall during
   construction. Runoff shall be discharged away from the wall and reinforced backfill, to keep them dry.
9. **Compaction:**
   - Compaction and operating equipment shall be kept at least 3'-0" from the back face of GRS or MSE walls.
   - Compaction within 3'-0" of the wall shall be at least three passes of lightweight compaction equipment
     (mechanical tamper, roller or vibratory system). No density tests shall be taken within the 3-foot zone.
10. **Walls over 20 ft:** the finished grade in front of the wall shall be placed and compacted before the wall exceeds
    20 ft in height. The finished grade backfill shall be compacted to 95% of ASTM D698, Method C or D, unless
    otherwise directed by the Engineer.
11. **Handling and erection:** the Contractor shall make an independent review and analysis of all handling, loading,
    lifting and erection. The Contractor shall devise and execute project-specific procedures for handling, loading
    and lifting that comply with all federal, state and local safety laws, regulations and requirements, and all
    contract requirements.
12. The Contractor shall be responsible for the stability of the structure and the excavation during construction.
13. **Dimensions:** stations, elevations and dimensions on these plans are calculated from a recent field survey. The
    Contractor shall verify all dependent dimensions in the field before ordering or fabricating any material.
14. **Utilities:**
    - Information on these plans about the type and location of underground utilities is not guaranteed to be
      accurate or all-inclusive. The Contractor is responsible for determining the type and location of underground
      utilities as necessary to avoid damage to them.
    - The Contractor shall contact the Utility Notification Center of Colorado at 811 (1-800-922-1987) at least
      3 business days before any excavation or other earthwork (2 full business days, not counting the day of
      notification).
15. **Shop drawings:** shall be submitted to the Project Engineer for the precast coping, geomembrane and down drain
    before fabrication.
16. **Stations and offsets** are along the wall layout line, with wall stations as shown on the Contract Plans.
17. **Adjacent walls:** for the location and alignment of adjacent walls or structures, see the other contract wall
    plans and the related as-built plans.
18. **Manholes, piles, drop inlets:** if present, these shall be detailed in the shop drawings.
19. **Piles:** piles within the reinforced earth volume shall be driven before the reinforced earth or GRS wall is
    built, unless the Contractor proposes a method to protect the structure that the Engineer approves in writing.
20. **Wall facing geometry** controls and shall be checked every 20 feet.
21. **Interferences:** the Contractor shall coordinate where existing or future structures, pipes, foundations or
    guardrail posts within the reinforced earth volume interfere with the normal placement of the reinforcement. If
    the plans give no specific direction, the Contractor shall notify the Engineer to determine the course of action.
22. **Near pavement:** the Contractor is responsible for gradually deflecting the upper reinforcement and the
    geomembrane downward, to avoid conflicts with paving and subgrade preparation.

---

## ABBREVIATIONS

Carried over from the current B-504-A C:

| Term | Meaning |
|---|---|
| ABC | Aggregate Base Course |
| β | Angle of slope |
| BM1 | Quantity of Structure Backfill (Class 1) without shoring (CY/LF) |
| BP | Bearing Pressure (TSF) |
| BP03 | BP for a 2:1 infinite slope |
| BP04 | BP for a 2:1 broken slope |
| Bott | Bottom |
| D | Depth of block or total panel depth |
| DH or z | Design height (or average height for quantity calculations) (ft) |
| DH (Avg) | Average wall design height |
| DHl, DHu | Design heights of the lower and upper tiered walls |
| DHWE | Design height water elevation |
| DRSF, WRSF | Depth and width of the Reinforced Soil Foundation (ft), as specified by the Engineer |
| DRSW, WRSW | Depth of RSW (the soil reinforcement spacing), and its width (3'-0" typical) |
| EJM | Expansion joint material |
| EM1 | Quantity of Structure Excavation without shoring (CY/LF) |
| H | Height of excavation at the wall layout line (ft) |
| Le | Length of reinforcement in the resisting zone (ft) |
| MRS | Quantity of Mechanical Reinforcement of Soil for the prescribed soil zone (CY/LF) |
| OS | Offset |
| PCF | Pounds per cubic foot |
| PLG | Pay length for geomembrane (ft) |
| RL | Reinforcement length (ft) |
| RSF | Reinforced Soil Foundation (CY: excavation, reinforcement and backfill) |
| RSW | Reinforced Soil Wrapper (SY of reinforcement) |
| σH | Factored horizontal stress |
| θ | Existing slope angle |
| Tmax | Applied factored load in the reinforcement |
| Zl, Zu | Lower and upper reinforcement depths |

New:

| Term | Meaning |
|---|---|
| At | Tributary area of a reinforcement layer |
| BL | Least precast barrier length (ft) |
| CT | Vehicular collision force |
| h1, h2 | Heights of the first and second impact pressure bands (ft) |
| He | Height of the impact load above the top of the moment slab (in) |
| Hmin | Least barrier height (in) |
| Ld | Dynamic impact load (kips) |
| Ls | Equivalent static load (kips) |
| pdp, pdy | Dynamic pullout and yield pressures (psf) |
| RF_ID, RF_CR, RF_D | Reduction factors for installation damage, creep and durability |
| Tal, Tult | Long-term and ultimate tensile strength of the reinforcement (lb/ft) |
| TL | Test level (MASH) |
| W | Weight of the barrier and moment slab system between joints (kips) |
| Wmin | Least moment slab width (ft) |
| φr | Friction angle at the base of the moment slab |

---

## REVISION BLOCK

| Date | Description |
|---|---|
| `[date]` | Revised for AASHTO LRFD 10th Edition and MASH (NCHRP Web Document 326): resistance factors, barrier loads on the moment slab and reinforcement, seismic exceptions, embedment, pavement load. |

---

# Decisions needed (for the owner or CDOT Staff Bridge)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Project test level on the sheet | A blank per project (TL-3 to TL-5-2), or a CDOT default | A blank, with TL-4-2 noted as the usual case for Type 9 and 10 MASH. Also settle Type 9's level: A-C calls it TL-4, while B-606-9 details it for TL-5. |
| D2 | Global stability φ | 0.75 (FS 1.3, as now) or 0.65 (FS 1.5) | Follow AASHTO 11.6.3.7: 0.75 with well-defined parameters and detailed borings, else 0.65. The geotechnical engineer chooses. |
| D3 | Least embedment | CDOT's 1'-6" below finished grade, or AASHTO 10th's 1.0 ft (level ground, no erosion) and 2.0 ft (slopes, erosion) | Keep 1'-6" as CDOT's floor, and add AASHTO's 2.0 ft for slopes, erosion and streams, and frost depth. |
| D4 | Top layers without a moment slab | Keep the H charts' 900 lb/ft "rail impact", or use AASHTO 11.10.10.2's PH = 10 kips over 5 ft (rupture) and 20 ft (pullout) | AASHTO 11.10.10.2. The 900 lb/ft has no stated basis, and the charts flag it as needing an update for MASH. |
| D5 | Geomembrane material | LLDPE (D1 and the sections) or HDPE (W1) | Pick one, or allow both per the specification. |
| D6 | Top-layer geotextile | Keep 4,800 lb/ft with a spacing rule (about 1 ft apart under TL-4) or require strength by test level | Specify the required Tult by test level and spacing on the new reinforcement sheet; keep 4,800 lb/ft as the floor. |

# What changed from the current B-504-A C (for the review)

- **Design specifications:** AASHTO 10th (the set cited the 7th and 8th elsewhere), and Web Doc 326 / NCHRP 663 added.
- **Soil values:** the geotechnical report governs them explicitly.
- **Pavement:** a DW load, with its factors.
- **Resistance factors:** a full table. The geosynthetic tensile and pullout factors are lowered per AASHTO 10th, and
  the extreme event values are listed.
- **Barrier:** "10 Kip horizontal impact" is replaced by the MASH test-level table and the moment slab design rules.
- **Seismic note:** now quotes AASHTO 11.5.4.2's exceptions.
- **Embedment:** per AASHTO 10th.
- **Bearing pressure:** what it means is stated.
- **Global stability:** per AASHTO 11.6.3.7, with its two resistance factors.
- **Top-layer geotextile:** its limit stated.
- **Abbreviations:** added for the new terms.

# LRFR load rating (plan)

The next tools on the schedule: **LRFR load rating of prestressed girders** (Mon 2026-11-16 slot) and then **of steel
girders, slab bridges and box culverts** (Mon 2026-11-30 slot). Load and Resistance Factor Rating by the AASHTO Manual for
Bridge Evaluation (MBE) Section 6A, with CDOT's vehicles and rules.

> **Article numbers and the legal and permit load factors below are from memory.** The MBE and the CDOT Bridge Rating
> Manual (BRM) aren't in the reference library; I check every one against your copies before the calc package cites it.

## 1. Where it lives

**Recommended: inside the design checks, not a separate tool.** The LRFD Bridge Design Check (prestressed) already
works out everything a rating needs at every point of interest: the staged dead loads, the HL-93 envelopes, the
distribution factors, the moment and shear capacities and the service stresses. A "Load rating (LRFR)" section adds the
rating factors from those same numbers, so a design and its rating can never disagree, and the Bridge's girders get their
ratings with no extra input. The Steel Girder Design Check, the Slab Bridge and the Box Culvert get the same section in
phase 2.

The alternative, a separate "LRFR Load Rating" tool beside the Double-Tee rating (LFR), would duplicate the inputs; it
only pays for bridges without a design in allcon, and those can come in through the girder check's "from plans" import
(`girders/from-plans.ts`).

## 2. The method (MBE 6A)

- **Rating factor (6A.4.2.1):** RF = (C − γDC·DC − γDW·DW ± γP·P) / (γLL·(LL + IM)).
  - Strength: C = φc·φs·φ·Rn, with φc·φs ≥ 0.85.
  - Service: C = fR, the allowable stress.
- **Condition factor φc (Table 6A.4.2.3-1):** 1.00 good or satisfactory, 0.95 fair, 0.85 poor (from the deck's,
  superstructure's or culvert's NBI or SNBI condition).
- **System factor φs (Table 6A.4.2.4-1):** 1.00 for multi-girder and slab bridges; 0.85–0.95 for two- to four-girder
  layouts, as the table says.
- **Load factors (Table 6A.4.2.2-1):**
  - DC 1.25, DW 1.50 (1.25 where the wearing surface is measured).
  - Design load, Strength I: 1.75 inventory, 1.35 operating.
  - Legal loads: γL by ADTT (Table 6A.4.4.2.3a-1). I recall 1.45 at 5000 or more and 1.30 at 1000 or less, interpolated
    between, and 1.45 where unknown; to verify.
  - Permits, Strength II, by the permit's type and ADTT (Table 6A.4.5.4.2a-1); to verify.
  - Service III for prestressed concrete: 0.80 for the design load, 1.00 for legal loads.
- **Live load:**
  - HL-93 with IM 33%, distributed by LRFD 4.6.2.2 (the girder check's factors).
  - Legal and permit vehicles moved along the span with IM 33%. IM may be cut for a smooth riding surface (6A.4.4.3).
  - A permit's single-lane factor with the multiple presence factor divided out (6A.4.5.4.2b).
- **Levels (6A.4.3–6A.4.5):** design load inventory and operating. Legal loads where HL-93 operating is under 1.0, or
  always (CDOT reports them). Permits.
- **Posting (6A.8.3):** RF from 0.3 to 1.0 posts at W/0.7·(RF − 0.3); under 0.3, closed. CDOT's posting rule (BRM)
  where it differs.
- **Prestressed concrete (6A.5):**
  - Flexure and shear at Strength I, from the girder check's capacities.
  - Service III tension at the design load, inventory, with the LRFD tension limit.
  - Shear rated for the design load and permits. For legal loads, only where the girder shows shear distress
    (6A.5.8); to verify.

## 3. Vehicles

- **Design:** HL-93.
- **Legal (CDOT):** the vehicles already in `rating/vehicles.ts`: CO Type 3, 3S2, 3-2, SU4, SU5, CO SU6, CO SU7, NRL,
  EV2, EV3.
- **Permit (CDOT):** CO Permit and CO Modified Tandem. CDOT BDM Section 3 asks for the permit vehicle's operating rating
  on the Bridge Rating Summary Sheet.
- **AASHTO legal loads** (Type 3, 3S2, 3-3, and the lane-type loads for spans over 200 ft) as a generic setting for
  other users.

## 4. Outputs

- In the girder check: a table of the vehicles' inventory and operating RF and tons, each with its controlling point
  and limit state (flexure, shear, service tension), the posting result, and RF along the span.
- The calc package: a "Load rating (LRFR)" chapter worked live, citing MBE articles.
- **CDOT's Bridge Rating Summary Sheet:** HL-93 inventory and operating, the legal loads, the permit's operating,
  the controlling member and limit state.
- In the Bridge: each girder group's ratings in the results, and the governing rating for the bridge.

## 5. Phases and effort

1. **Prestressed girders** (the girder check): the RF engine, factors and settings, the vehicles moved over the simple
   and continuous spans (the girder check's influence lines), the service check, posting, the editor section, the
   calc chapter, the summary sheet, tests. **Medium to large.**
2. **Steel, slab and culvert:**
   - Steel girders: flexure and shear at Strength I and II; Service II's flange stress, 0.95 Fyf composite and 0.80
     non-composite (6A.6.4.2.2). Fatigue life evaluation (MBE Section 7) is left out.
   - Slab bridges: the equivalent strips.
   - Box culverts: the earth load and the live load through the fill (6A.5.12), with the CDOT BDM's lane surcharge.
   - **Medium.**

## 6. Validation

- Hand checks of the RF equation and each factor.
- The MBE's illustrative example for a prestressed I-girder (Appendix A6), if in your copy.
- A CDOT LRFR rating package, the best benchmark. E-16-FZA (I-70 over Harlan, in your Drive with its rating package
  and XML) looks like one; to confirm it's LRFR.
- The girder check's HL-93 inventory RF against PGSuper's load rating report for the PGSuper benchmarks we already have.

## 7. To decide

1. Inside the design checks (recommended), or a separate tool?
2. Your copies of the MBE (which edition and interims) and the CDOT Bridge Rating Manual, uploaded to the reference
   library, so the factors and articles are exact.
3. The benchmark: is E-16-FZA's rating package LRFR, and may I use it?

## Decided (2026-11-20)
- Inside the LRFD girder check, kept apart from the Double-Tee Load Factor Rating (`rating/double-tee.ts` is untouched).
- Sources given: the CDOT Bridge Rating Manual (September 2022, read in full) and an AASHTO MBE 2nd edition sample
  (front matter and contents only, which confirm the 6A article numbers but not the tables' values).

## What the CDOT BRM settles
- LRFR for everything designed after September 30, 2010 (1.4 A); moment and shear for interior and exterior girders
  (15-1, 1.4 M).
- Full impact for every rating (15-4). Multi-lane distribution for bridges built after 1985 (1.3 C); one lane only
  with approval (1.3 D); no refined distribution without approval (1.3 I).
- Load factors per the MBE (15-6, 1.3 L); ADTT from the SIA (ADT × % trucks), the most conservative value when
  unknown. γL may be 1.30 for the emergency vehicles (1.3 L). φc 1.0 for new bridges (15-6).
- The service limit states may be skipped for legal and permit vehicles (1.3 P).
- Permits: unlimited crossings, mixed with traffic (1.4 X).
- Vehicles (1.2):
  - the Colorado legal trucks on state routes (Figure 1-4, already in `rating/vehicles.ts`);
  - the Interstate legal trucks on Interstate routes and ramps (Figure 1-5: Type 3 12/18/18 kip, 24 T; 3S2
    10/15/15/18/18, 38 T; 3-2 12/18/18/15/15, 39 T);
  - NRL, SU4–SU7, EV2 and EV3, the Colorado Permit Vehicle and the Modified Tandem;
  - the AASHTO legal loads and the lane-type legal load are **not** required (1.2.2).
- Posting (1.15):
  - the legal trucks against Tables 1-4 to 1-6;
  - no MBE Eq. 6A.8.3-1;
  - an operating RF of 0.95 or more is exempt;
  - under 0.3, restrict all legal loads; under 3 tons, close the bridge;
  - SU4–SU7 only when the NRL rates under 40 T.
- Color code (1.16, Table 1-7): from the interior girders' permit ratings; the tandem may set it.
- Reporting (1.14, 15-9): HL-93 as an RF, the others in tons, truncated; the LRFR Rating Summary Sheet (Form 1187a).

## Still from memory (to confirm with a full MBE)
- The legal load factors (Table 6A.4.4.2.3a-1). An edition setting chooses between them:
  - 3rd edition: 1.45 at ADTT 5000 or more and when unknown, 1.30 at 1000 or less;
  - 2nd edition: 1.80, 1.65, 1.40 at 5000, 1000 and 100.
- The routine permit's factors (Table 6A.4.5.4.2a-1): 1.80, 1.60, 1.40 at 5000, 1000 and 100.

## Status (2026-11-20): phase 1 built
- `girders/lrfr.ts` (`rateGirder`, factors, vehicles, posting, color code), `girders/lrfr-calc.ts` (the calc chapter
  and the Summary Sheet's values), `components/design/lrfr-panel.tsx` (the settings in "Load rating (LRFR)" and the
  results under the checks). `GirderInputs.rating` turns it on.
- At every point of interest of every span's interior and exterior girder, the rating works out:
  - flexure (positive, and negative over the piers with the restraint moments at γP 1.0);
  - shear (the design's φVn);
  - Service III bottom tension for HL-93 inventory (γL 0.80).
- The vehicles move over the girder check's own continuous beam, enveloped with the simple span as it does.
- Tests: `lrfr.test.ts` (hand check of HL-93 inventory, the factor tables, the Interstate weights, posting, color code,
  a continuous girder, the calc chapter against the engine).
- Not yet:
  - the Bridge's results;
  - a CDOT LRFR package as a benchmark;
  - the permit's lane load for negative moments and spans over 200 ft (BRM 15-8, MBE 6A.4.5.4.1);
  - phase 2 (steel, slab, culvert).

## Status (2026-11-20, later): the follow-ups and phase 2
- **Permit lane load** (MBE 6A.4.5.4.1, BRM 15-8): 0.2 klf per lane over the influence line's adverse area, on spans of
  200 ft or more and over the piers of continuous spans, no impact (`laneEffect`).
- **In the Bridge:** the Designs list shows each girder group's HL-93 inventory and operating RF, the permit's tons and
  the color code, and a line for the bridge, the lowest of its girders. Each girder design's settings are used, or
  CDOT's defaults.
- **Steel girders** (`girders/lrfr-steel.ts`):
  - every check of the girder line is rated: flexure, shear, and Service II's flange stresses (γL 1.30 for inventory
    and legal loads, 1.00 for operating and permits);
  - the engine runs twice, with the live load scaled to 0.001 and to 1 (`SteelGirderInputs.llScale`), to split each
    check's demand into its dead and live parts;
  - other vehicles scale the live part by their effect over HL-93's on the same beam;
  - fatigue (MBE Section 7) isn't rated.
- **Slab bridges** (`slabs/lrfr-slab.ts`):
  - the interior and edge strips' flexure; the edge strip stands in for the exterior girder;
  - shear isn't rated (AASHTO 5.12.2.1).
- **Box culverts** (`culverts/lrfr-culvert.ts`):
  - every station's faces in flexure and its shear, against each Strength I combination's permanent loads;
  - the vehicles are moved across the top through the fill (`designCbc(...).vehicleEnv`);
  - BRM 1.3 M: HL-93 1.75 / 1.35 with m 1.2; legal 2.0 and permits 1.4, one lane with m 1.0.
- Each has the "Load rating (LRFR)" section in its editor and a calc chapter. Tests: `lrfr-phase2.test.ts`.
- Not yet: the single-lane option on steel and slab (multi-lane only there; the culvert is one lane by BRM 1.3 M), and a CDOT LRFR package as a
  benchmark.

## Checked against the full MBE 3rd edition (2018), with the BRM governing where they differ
- Confirmed:
  - Table 6A.4.2.2-1, the load factors by limit state;
  - Table 6A.4.4.2.3a-1, the legal loads' 1.45 / 1.30 (the default edition setting);
  - Table 6A.4.4.2.3b-1, the specialized hauling vehicles, the same;
  - the condition and system factor tables;
  - 6A.4.5.4.1, the permit's 0.2 klf lane load.
- Changed:
  - Permits take Table 6A.4.5.4.2a-1 (3rd ed.) by ADTT and their weight ratio, gross weight over front-to-rear axle
    length. For ADTT over 5000 or unknown, 1.40, 1.35 and 1.30 for ratios under 2.0, 2.0–3.0 and over 3.0 kip/ft. The
    CO Permit (192 kip over 77 ft, 2.5) takes 1.35; the Modified Tandem (100 kip over 20 ft) takes 1.30.
  - Shear takes φs = 1.0 (C6A.4.2.4).
- BRM over MBE (the owner's rule):
  - the culvert factors (1.3 M);
  - posting without Eq. 6A.8.3-1 (1.15);
  - full impact always (15-4);
  - Colorado or Interstate legal trucks, no AASHTO lane-type legal load (1.2.2; 15-7's older note is superseded);
  - the permit's lane load on spans of 200 ft or more (15-8; the MBE says 200–300 ft);
  - no service limit states for legal and permit loads on concrete (1.3 P).

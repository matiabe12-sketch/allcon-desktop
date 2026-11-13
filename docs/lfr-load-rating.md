# LFR Load Rating — spec (approved)

A load rating tool under Superstructures that runs the rating analysis the way AASHTOWare BrR does:
every vehicle moved across the span, rating factors at every point of interest for strength and
service, inventory and operating, the controlling result and the posting check. It starts with
simple-span precast prestressed double-tee bridges without plans, where the prestress is
back-calculated (CDOT BRM 1.7.2(A)), and grows to other precast types. Approved 2026-11-06; see
"Decisions taken" at the end.

> **House rule.** allcon's design tools are AASHTO LRFD only, with no state DOT rules unless the owner
> asks. This tool is Load Factor Rating (the AASHTO Standard Specifications, 17th ed., and the MBE's
> Section 6B) with CDOT's Bridge Rating Manual (BRM) rules, at the owner's request (2026-11-06). The
> CDOT rules are kept together in one agency setting (section 7).

> **Article numbers** below are as I know them; I can't open the Standard Specifications, the MBE or
> the BRM here. They're checked against your copies before the calc package cites them.

## 1. The principle

- **ALLCON does the analysis; BrR is the check, unless CDOT accepts ALLCON's output.** CDOT's
  submittals include the BrR output and model. ALLCON computes the
  same ratings and does the iterating; BrR becomes one confirming run from ALLCON's BrR input sheet,
  and its results are pasted back for a side-by-side comparison.
- **The same method choices as BrR**, found by benchmarking against BrR's own reports (section 8), as
  the girder check was against PGSuper.
- **Every assumed value is flagged with its source** (sketch, inspection report, BRM default table,
  engineering judgment), as in yesterday's bridge files.

## 2. Scope

**First:** simple-span precast prestressed double-tee units, side by side, with or without a
composite deck or topping; one or more identical simple spans; skew; sidewalks; straight strands.
The prestress is either:
- **back-calculated** (no plans): the force that makes the HS-20 inventory rating factor exactly 1.0
  (BRM 1.7.2(A)), modeled in BrR by force and eccentricity; or
- **known**: strands by row, or a force and eccentricity, from plans or shop drawings.

**Later, each validated before it's called done:** precast I-girders and box beams, prestressed
slabs; LRFR (MBE Section 6A), which reuses ALLCON's LRFD girder engine (already benchmarked against
PGSuper); a BrR XML import file.

**Not planned:** steel, continuous spans, culverts, timber: BrR's other modules.

## 3. Inputs

From the inspection sketch and report, one design per bridge (yesterday's bridge files map onto
these field by field):

- **Bridge:** structure number, facility, feature, owner, year built, NBI superstructure code,
  inspection date, rater and checker.
- **Layout:** span (bearing to bearing), structure length, number of spans, skew.
- **Units:** count; each unit's flange width and thickness, stem count, stem depth, top and bottom stem
  widths, stem spacing (uniform or per unit), trimmed exterior flanges.
- **Deck or topping:** thickness, f′c, unit weight; composite or not.
- **Roadway:** rail and curb positions, travelway width, sidewalks (width, thickness, mountable or not).
- **Loads:** rails (or rail components), sidewalks, asphalt (and whether it's in place when the force
  is solved), utilities (weight and the girder carrying each), diaphragms.
- **Materials:** f′c, strand type, grade and area, by the BRM's table for the year built unless known.
- **Prestress:** back-calculated (the strand centroid assumption, whole strands or not), or known.
- **Condition:** notes from the inspection (cracks, spalls, exposed or lost strands, joint
  condition), a strand loss per girder, and a capacity reduction where the rater judges one is needed.
- **Options:** the interior distribution method (SSHB Table 3.23.1 or the multi-beam S/D of 3.23.4.3),
  distribution factor overrides (as BrR allows), the tension limit, whether shear is checked.

## 4. The analysis (as BrR does it)

1. **Sections** per unit, interior and exterior: non-composite, and composite with the deck
   transformed.
2. **Dead loads by stage:** the girder, deck and diaphragms on the girder (DC1); rails, sidewalks,
   asphalt and utilities on the composite section, shared by all girders or assigned to one.
3. **Points of interest:** the bearings, tenth points, transfer length and debond ends, the critical
   section for shear (when shear is checked).
4. **Live load:** each vehicle moved along the span in both directions in small steps, by influence
   lines at every point (moment and shear), wheel lines on the girder by its distribution factor:
   - HS-20 truck or lane load, whichever governs (SSHB 3.7);
   - the agency's legal, specialized hauling, emergency and permit vehicles;
   - impact I = 50/(L + 125) ≤ 0.30 (SSHB 3.8.2.1);
   - pedestrian load on sidewalks (SSHB 3.14), with CDOT's two models (trucks curb to curb with
     pedestrians; trucks on a mountable sidewalk without), the worse governing.
5. **Distribution factors:** interior by SSHB Table 3.23.1 or 3.23.4.3; exterior by the lever rule
   (wheel 2 ft from the rail or curb face); or the rater's overrides.
6. **Prestress:** losses by SSHB 9.16.2 (lump sum, or itemized shrinkage, elastic shortening and
   creep, as BrR's setting), transfer and development (SSHB 9.27–9.28).
7. **Capacity at every point:**
   - flexure, SSHB 9.17 (fps by Eq. 9-17; rectangular or flanged), φ = 1.0; maximum steel, 9.18.1;
   - shear, SSHB 9.20 (Vci, Vcw, Vs), unless waived (BRM 1.4(O));
   - service stresses at the girder's top and bottom, and the strand stress.
8. **Rating factors** (MBE 6B.4.1 and 6B.5.3) at every point, for every vehicle and girder:
   - strength: RF = (φRn − A1·D) / (A2·L(1 + I)), A1 = 1.3, A2 = 2.17 inventory and 1.3 operating;
   - prestressed concrete at service, inventory: concrete tension, concrete compression (with all
     loads, and with live load plus half the dead load and prestress), strand stress; operating:
     strand stress (MBE 6B.5.3.3);
   - the controlling factor per vehicle: the lowest over every point, girder and check, with where it
     occurs; tons = RF × the vehicle's weight.
9. **Posting** by the agency's rule (CDOT BRM 1.15.1).

## 5. Back-calculating the prestress (no plans)

- The force (at the assumed strand centroid) is solved so that the lowest HS-20 inventory rating
  factor over all girders and points, in flexure, is exactly 1.0, by the same full analysis (not a
  midspan hand check), so ALLCON's force rates as BrR will rate it.
- As it's modeled in BrR: the final tension limit raised (1 ksi) so strength governs; shear waived per
  BRM 1.4(O); the force the greater of what the factored moment and the cracking moment need
  (BRM 1.7.2).
- Options, as in yesterday's files: whole strands (the jacking force rounded down to the kip) or the
  exact force; the asphalt in place or removed while solving.
- Reported: the force and strand centroid to enter in BrR, the equivalent strands, and the resulting
  ratings with the current dead loads.

## 6. Outputs

- **Results view:** a table of girders × vehicles (inventory and operating RF and tons, the
  controlling point and check), the governing girder per vehicle, the posting result, envelopes of
  moment and rating factor along the span, and the cross-section sketch with the units, deck and
  loads.
- **Calc package in Calcs**, worked step by step with the article for each step, in the order of
  CDOT's supplemental calcs: materials, cracking moment and prestressing steel, stress limits,
  dead loads, distribution factors, live load, ratings, posting; and the review items (assumptions,
  condition) at the end.
- **BrR input sheet:** every value in BrR's entry order, with the expected section properties to check
  against BrR's.
- **BrR comparison:** paste BrR's rating table (and distribution factors); each vehicle compared and
  anything more than 5% apart flagged, as yesterday's compare.js.
- **Later:** a BrR XML file to import, from one BrR model as the template.

## 7. Agency settings

- **CDOT** (first): the 13 vehicles (HS-20; CO Type 3, 3S2, 3-2; SU4, SU5, CO SU6, CO SU7, NRL; EV2,
  EV3; CO Permit, CO Modified Tandem, with axle loads and spacings from CDOT's rating workbook), the
  back-calculation rule, the posting rule, the materials by year, the pedestrian load and two
  sidewalk models, the tension-limit setting and the shear waiver, and the rating summary sheet's
  wording.
- **AASHTO MBE** (generic): the AASHTO legal loads and posting rules, for other users. Other agencies
  can be added the same way without changing the engine.

## 8. Validation

1. **Hand checks:** the LFR equations, the impact factor, a truck's moment by hand, the lump-sum
   losses.
2. **CDOT's workbook:** the truck moments (HS-20 162.10 kip·ft at 32.75 ft), as yesterday.
3. **Yesterday's five bridges** (CENT 19-2.5, CENT 17.6-2.9, AUR07.0-H.0, AUR08.0-J.3, AUR12.0-Y.0):
   the midspan flexure results reproduce the hand calcs; any difference comes from a point or check
   the hand calc didn't cover, and is explained.
4. **BrR, the benchmark:** your BrR runs of these bridges, with BrR's detailed reports (losses,
   actions and stresses at the points of interest, distribution factors, rating factors), plus
   CDOT's sample BrR models (TELLRD-PINE ST and B-17-DL) (their inputs are readable from the XML).
   Targets: actions within 1%, rating factors within 2%; any method difference documented, as for
   PGSuper.

## Order and effort

1. **The engine:** double-tee sections, staged dead loads, moving loads at every point, impact,
   distribution factors, Standard Spec losses, flexure and stresses, MBE 6B rating factors, the CDOT
   setting. **Largest piece.**
2. **Back-calculation**, and yesterday's five bridges as regression fixtures. **Medium.**
3. **The editor, results, calc package, BrR input sheet and comparison.** **Medium.**
4. **The BrR benchmark**, as your BrR reports come in. **Medium**, and it decides when the tool is
   ready for use.
5. **Later:** shear (Std Spec 9.20) fully, I-girders and box beams, LRFR, BrR XML.

Overall about the size of the girder check's Phases 2 and 3 together.

## Status (2026-11-06)

Built in the desktop copy (not pushed):

- **Engine** `src/lib/design/rating/double-tee.ts` and `vehicles.ts`: sections, staged dead loads,
  the 13 CDOT vehicles moved along the span, impact, distribution (Table 3.23.1 or S/D, lever rule,
  the two sidewalk models), lump-sum losses, transfer and development, flexure (SSHB 9.17, 9.18.1),
  the MBE 6B.5.3.3 service checks, optional shear (SSHB 9.20), back-calculation over the points of
  interest (or at midspan by the hand method), posting (BRM 1.15.1).
- **Validation 1–3 done:** hand checks, the workbook's HS-20 moment, and the five bridges reproduce
  the rating scripts exactly at midspan (`double-tee.test.ts`). One correction to the scripts: 15
  strands × 0.144 in² × 175 ksi is 378 kip, which they floored to 377 (floating point).
- **Editor** (Design › Superstructures › Double-Tee Load Rating): inputs, import of the scripts'
  bridge files, ratings and posting, each girder's ratings, the prestress, the hand check, the BrR
  input sheet and the BrR comparison (paste BrR's table; ±5% flagged).
- **Calc package** (`double-tee-calc.ts`), worked live in Calcs and tested against the engine.
- People credited by name in the scripts' notes are reworded on import.
- **From the SIA** (`sia.ts`): the report is read in the browser (never uploaded), in both layouts
  (SNBI items from 2025, NBI items before). Every value comes with its item, beside the current
  input, and is used only if picked. Values the SIA can't give exactly are flagged: item 48 isn't
  always bearing to bearing, the multi-span girder length includes the pier gap, and G07/G08 give
  the walkway without a rail edge. Checked against all ten SIAs of the five bridges.
- **Inspection sketch:** attached to the design (a PDF's pages stored as pictures under it), shown
  beside ALLCON's **typical section** drawing, which is drawn from the inputs with dimensions,
  updates as you type, and goes into the calc package. Deleting the design deletes the sketch.
- **Not yet:** validation 4 (the BrR benchmark; needs your BrR reports), the generic AASHTO MBE
  setting, I-girders and box beams, LRFR, BrR XML.

**Finding:** with a composite deck the service tension check can govern HS-20 inventory even at the
1 ksi limit (AUR08: 0.938 on the trucks-on-sidewalk exterior girder, 0.945 on the interiors; flexure
1.02). BrR, with that model, would report the same. The editor flags it; the limit is a setting.

**BrR benchmark, TELLRD-PINE ST (2026-11-07, `brr-benchmark.test.ts`):** CDOT's sample BrR rating of
this bridge, with its model's values read from the BrR export:
- P = 404 kip at a 7.5 in centroid, A*s from the 0.75 jacking ratio;
- 155 pcf girder concrete, the 6.5 in flange, 3 in asphalt;
- final tension 1 ksi, no pedestrian load, no utilities.

All 16 ratings (girders B and E: HS-20 inventory and operating, the legal, EV and permit vehicles)
are within 0.5%, flexure governing; the dead load moments match BrR's to 0.1 kip·ft.

Aligned with BrR: strand modulus 28,500 ksi, modulus of rupture 0.24√f′c, deck compression 0.4f′c,
BrR's distribution factors checked within 5% in the comparison and the calc package, and the
cracking moment step shown per girder. The final tension limit stays 1 ksi (BrR's model uses it
for the reported ratings too); 6√f′c or an entered value can be chosen. Pedestrian load can be
switched off to match a BrR model that leaves it out.

**BrR's report read in (2026-11-07, `brr-report.ts`):** the comparison reads BrR's Rating Results
Summary Report from a PDF (alone, or inside a rating package), on the user's computer. It matches
BrR's live load names to the CDOT vehicles and its members to the girders (GA = G1…). For HS-20 it
takes the lower of BrR's axle load and lane ratings. With two runs (the two sidewalk models) it takes
the lower of each, and compares each girder with ALLCON's lower case. On the TELLRD package, all 13
vehicles on both girders are within 0.5% (the largest difference 0.26%). The report is printed
rotated; its names row is found by content. Excel not yet: no sample.

**Sketch callouts (2026-11-07, `sketch-callouts.ts`):** when a sketch with text is attached (a CAD
sketch; a scan has none), its labeled callouts are read without AI and offered like the SIA's values:
- the units and their spacing, with edge units of another width as a unit layout;
- the topping or deck, the precast flange and the asphalt;
- the span under "C BRG.", a structure length on its line, the out-to-out width;
- curb to curb, the sidewalks beside it, and the diaphragms' weight when the spacing is labeled.

Bare dimensions (stem depth, stem spacing, stem widths) aren't read. Checked on the three 2025 AUR
sketches against the ratings' inputs. The note above the drawing lists only what has no source yet.

**No ALLCON values for the bridge (2026-11-07, `sources.ts`):** a new rating starts blank. Each
bridge input records its source: the SIA (with its item), the sketch (with its callout), the BRM
table for the year built, a bridge file, or the engineer (entered, assumed, or a starting value
confirmed). Nothing is drawn, rated or put in a calc package until every input the rating needs has
a source; the editor lists what's missing.
- **BRM materials by year built** (to confirm against the BRM):
  - before 1980: 1/2" 250 ksi stress-relieved strand, 0.144 in²;
  - 1980s: 270 ksi, 0.153 in²;
  - deck: 3.0 ksi for 1960–1976 and 4.5 ksi after 1981;
  - the precast girder 6 ksi, as assumed in CDOT's double-tee ratings.
- **Method settings** keep CDOT's values: losses, tension limit, strand rows, unit weights,
  distribution choices.
- **Designs saved before this** keep their SIA and sketch sources and take changed values as
  entered; values still at the old starting ones need confirming.

**Calc package tables:** the rating summary (grouped as CDOT's LFR Rating Summary Sheet: inventory
and operating RF and tons, governing girder and check, posting) after posting, and, once BrR's results
are in, the comparison with BrR (each rating and the distribution factors, ±5%). Both are drawn as
pictures: a calc sheet's table regions hold numbers only.

## Status (2026-11-07)

Added in the desktop copy (not pushed):

- **The prestress is set with trucks between the curbs.** The back-calculation (BRM 1.7.2(A)) uses
  only the cases the original design would have used: every girder, with trucks between the curbs
  and the sidewalk's dead and pedestrian loads, must rate HS-20 inventory 1.0 or more under the dead
  loads used in the rating. Trucks on a mountable sidewalk are then rated with that prestress, not
  used to set it, and may rate below 1.0. The calc package says so.
- **Final tension "Ignored (strength governs, BRM 1.7.2)":** a third choice of the final tension
  limit, for a back-calculated prestress only. The girder's final tension isn't rated (a tension
  check on an assumed prestress tests the assumption, not the bridge); the calc package says why, and
  the BrR input sheet gives BrR 10 ksi so tension can't govern there either. Needed where the 1 ksi
  limit still governs (AUR08.0-J.3, a 45 in section with an 8 1/2 in deck: tension 0.912 against
  flexure 1.000). The default stays 1 ksi.
- **The 1982 double-tee standard** (`dt-standard.ts`): the CDOH Double T Bridge Standard (Dwg. B-3,
  45 spans and widths, transcribed and checked: each row's forces and ratios give whole strands). The
  editor compares the bridge with it (year built 1982 or later, span, width, units, unit width, stem
  spacing, depth, the 7 in integral slab, no deck). A bridge built to it can take the standard's
  prestress (harped strands, Dwg. B-7; the engine models the harp) instead of back-calculating; one
  that isn't is told why, item by item, in the calc package. None of the bridges rated so far is
  built to it.
- **Curbs:** each side can be a sidewalk or a curb. A curb carries dead load only: no pedestrian load,
  and trucks can't mount it. Without a deck, a sidewalk's or curb's dead load now sits on the exterior
  unit of its side (it was left out before). The BrR input sheet lists curbs as curbs.
- **Within 1 mile of an Interstate** is read from the SIA (SNBI item LR09A), for posting emergency
  vehicles (BRM 1.15.1). Blank or older NBI reports leave it to the rater.
- **BrR reports printed with narrow columns** (names cut short, "Colorado Le…", and levels run
  together with tons) are read: a cut-short name is BrR's CDOT vehicle name it begins with, in BrR's
  column order.
- **Calc package layout:** every number at most three decimals; the calculations, the BrR input sheet
  and the appendix each start a page; headings, and the comparison's heading and note, stay on the
  page of what follows them; references cite design codes only.

**Bridges rated from their 2025 SIA and sketch** (designs and calc packages named by bridge, BrR
runs to follow): AUR07.0-H.0, AUR08.0-J.3, AUR12.0-Y.0, CENT 17.6-2.9, CENT 19-2.5. AUR12.0-Y.0's
girder depth is assumed (45 in overall) and must be field-measured.

## Decisions taken (2026-11-06)

1. **Scope:** double-tees first.
2. **Agencies:** CDOT only (the generic AASHTO MBE setting in section 7 is dropped for now).
3. **Back-calculation:** the force at an assumed strand centroid, whole strands, asphalt in place.
   No person is named anywhere in the tool, its calc package or its documents.
4. **Shear:** waived by default per BRM 1.4(O), with the check available.
5. **Documents:** the calc package and the BrR input sheet in ALLCON only.
6. **BrR's role:** ALLCON does the analysis; BrR is one confirming run.
7. Not decided: copying yesterday's scripts into the Ratings folder.
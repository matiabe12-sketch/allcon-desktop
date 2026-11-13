# Approach slab design (Bridge Components → Approach Slab)

A cast-in-place approach slab that bears on the abutment's approach slab notch at one end and on a
sleeper slab at the other, designed by AASHTO LRFD (10th Edition, 2024) and the CDOT Bridge Design
Manual (BDM), with its bars detailed, a bar schedule and its quantities under CDOT pay items.

## Sources

- AASHTO LRFD 10th: 3.6.1.3.3 (axle loads only on slabs spanning along traffic ≤ 15 ft; full HL-93
  beyond), 3.6.1.1.2, 3.6.2.1 (IM 33%, 15% fatigue), 3.6.1.4 (fatigue truck), 3.4.1,
  4.6.2.3 (equivalent strips for slab-type bridges, Eqs. 4.6.2.3-1/-2 and the skew factor -3),
  5.4.2.4, 5.4.2.6, 5.5.3.2 (bar fatigue), 5.6.3.2, 5.6.3.3, 5.6.7, 5.7.3.3 / 5.12.2.1 (shear),
  5.10.1 (cover), 5.10.6 (shrinkage and temperature), 5.10.8.2 (development), 9.7.1.1 (least
  depth), 9.7.3.2 (distribution reinforcement, 100/√S ≤ 50% for main bars parallel to traffic),
  10.6.3.1 / 10.5.5.2.2 (bearing under the sleeper slab, factored resistance given by the
  geotechnical engineer), A13.4.1 Case 1 (a barrier on the slab's edge).
- CDOT BDM (2026): 2.13 (approach slabs required on vehicular bridges, anchored to the abutment,
  notch on every abutment, drains on the high side), 2.2.1.1 (ends square to the roadway where
  practical when skew ≥ 30°), 5.4.3 (3 in cover cast against earth), 5.4.5 (approach slab bars
  corrosion resistant: epoxy), 11.3.5 (the abutment carries half the approach slab's dead load),
  **11.3.7** (the worksheet is "predesigned … for 50% of the slab span based on a PCI methodology";
  the same method is required for other lengths; settlement at the free end ≤ 1 in; design the slab
  like an overhang where a barrier is on it: the barrier is the fuse), 14.4.2 (a joint at the end
  of the approach slab: required against concrete pavement, otherwise when movement > ¾ in),
  Section 19 quantities (an approach slab column in the SOQ, measured from the back of the
  approach notch; the anchorage bar into the abutment carried in the superstructure quantities).
- **CDOT worksheet B-601-1EA** (Approach Slab Details, Asphalt with 0–4" Joint; the owner's main
  reference) and B-601-1 (the same without the device, for movement ≤ ¾ in). Both are served at
  codot.gov's `structural-worksheets-pdfs/b-600/sheet_b-601-1ea.pdf` (and `sheet_b-601-1.pdf`)
  though the index pages don't list them. What the tool takes from B-601-1EA:
  - 20'-0" minimum along the roadway, ends parallel to the abutment (20'-0" sin θ normal to it),
    1'-0" thick, Concrete Class DF (Note 1, so 601-03056 is the default pay item), 2 in top and
    3 in bottom clear.
  - Bars: #6 @ 6" bottom along the roadway ("use #9 for approach slabs greater than 20' and less
    than 31' long"; an information check compares the design's bars with the worksheet's),
    #5 @ 1'-0" bottom and top transverse, #4 @ 1'-6" top longitudinal, #5 @ 1'-0" anchorage bars
    2'-9" with a 10" leg projecting 1'-6" into the slab (Detail 1), #4 ⊏ @ 1'-6" at the slab's end.
  - Sleeper slab 4'-0" by 1'-0", the slab on a 1'-6" ledge, a 1'-0" block under the 0–4 in device,
    #5 @ 1'-0" bent bars (two at each place), #5 (Tot 10) along it, #5 (Tot 2) in the block.
    The C-bars' legs and the bent bars' shapes are read off the sketches: check against the sheet.
  - The ½ in expansion joint material and 20 Ga sheet metal are included in the work; the poured
    joint at the abutment end (both ends without the device) is Item 408-01100 Joint Sealant (LF);
    the device is 518-01004 (LF) along the skewed end.
  - CDOT's worksheet is predesigned (PCI method) and doesn't check fatigue: with its #6 @ 6" the
    AASHTO 5.5.3 fatigue check doesn't pass (≈29 ksi against ≈25 ksi), so fatigue is shown for
    information only.
- Other worksheets: the sleeper versions of the rail transitions (B-606-9B, -9D, -10MASHA-S,
  -10MASHC-S), B-206-F1 / M1, B-518-1, B-100-1.

## Method

1. The slab is a one-way slab spanning along the roadway. CDOT's policy (BDM 11.3.7): it is
   designed as a simple span equal to **50% of its length** (the PCI approach: the fill under it is
   assumed to settle away over half its length, so the slab bridges that void). The fraction is an
   input (1.0 gives the conservative full-length simple span AASHTO would otherwise imply). The
   span is measured along the roadway (skewed slabs: along the centerline).
2. Dead load: the slab (DC), the wearing surface if any (DW). Live load: for a span ≤ 15 ft the
   axles of the design truck (32 kip) or tandem (2 × 25 kip at 4 ft) only (3.6.1.3.3); beyond
   15 ft the full HL-93 (truck or tandem with the 0.64 klf lane). IM 33%. Distributed over the
   equivalent strip of 4.6.2.3 (the lesser of one lane, Eq. -1, and several lanes, Eq. -2, ≤ 12W/NL),
   times the skew factor r = 1.05 − 0.25 tan θ ≤ 1.0 (Eq. 4.6.2.3-3).
3. Bottom main bars (along the roadway): Strength I flexure (5.6.3.2), minimum (5.6.3.3), service
   crack control (5.6.7, Class 1 exposure, top cover 2.5 in for chain wear, bottom 3 in cast on
   earth per BDM 5.4.3), service stress ≤ 0.6 fy, fatigue (Fatigue I, one 32 kip axle of the
   fatigue truck with 15% IM over the single-lane strip without the 1.2 multiple presence,
   ΔF_TH = 26 − 22 fmin/fy, 5.5.3.2).
4. Shear: 5.12.2.1 lets slab bridges designed for moment by 4.6.2.3 be taken as satisfactory for
   shear; it is still shown against φVc with β = 2 (5.7.3.3) as a check.
5. Bottom transverse (distribution) bars: 100/√S ≤ 50% of the main bars (9.7.3.2).
6. Top bars both ways: shrinkage and temperature, 1.3bh/(2(b+h)fy), 0.11–0.60 in²/ft (5.10.6),
   with spacing ≤ 3h and ≤ 18 in.
7. Least depth 7 in (9.7.1.1).
8. Anchorage to the abutment (BDM 2.13): dowels from the backwall's notch into the slab, hooked
   in the abutment; their embedments against ℓd (straight, epoxy) in the slab and ℓdh in the
   abutment (5.10.8.2.1, 5.10.8.2.4).
9. Sleeper slab (BDM's "strip of concrete that supports the free end"): the slab's end reaction
   (Strength I, the span adjacent to the sleeper) spread over the sleeper's width; factored bearing
   pressure against the factored bearing resistance from the geotechnical report (an input), and
   the sleeper's bottom bars across its width as two cantilevers from the slab's seat.
10. A barrier on the slab's edge (optional; the transitions' sleeper versions): A13.4.1 Case 1 on
    the top transverse bars at the barrier face, Mc and T entered from the barrier's design.

## Outputs

- Checks with article citations, grouped: main bars, distribution and temperature bars, shear,
  anchorage, sleeper slab, barrier.
- Calc package in the owner's style (3 decimals, "Label:- text" lead-ins, code-only references,
  input sheet / calculations / summary each on a new page, checks summary as a table).
- Details: plan of the slab with the bars, longitudinal section through the notch, slab and
  sleeper; bar schedule (CDOT callouts by size and use, splices on 40/60 ft stock, lengths rounded
  down to the inch).
- Quantities (CDOT SOQ approach slab column): 601-03056 Concrete Class DF (B-601-1EA Note 1; slab from the
  back of the notch, plus the sleeper slab and its block), 602-00020 Reinforcing Steel (Epoxy
  Coated), 515-00120 Waterproofing (Membrane) under an HMA overlay, 518-01004 for the 0–4 in device
  and 408-01100 Joint Sealant for the poured joint, by the skewed lengths.

## Where CDOT differs from AASHTO

- Span: CDOT designs for 50% of the slab length (PCI); AASHTO gives no approach slab span rule
  (3.11.7 and C3.11.6.5 only mention approach slabs for surcharge), so a strict reading is a
  simple span over the full length. The tool uses CDOT's 50% by default and shows the fraction.
- Cover: CDOT 3 in against earth for coated bars (BDM 5.4.3); AASHTO Table 5.10.1-1 also 3 in.
- Corrosion protection: CDOT requires epoxy-coated bars in approach slabs (BDM 5.4.5).
- Quantities: CDOT measures from the back of the notch and carries the anchorage bars in the
  superstructure column; the schedule lists the anchorage bars and says so.
- CDOT's B-601-1EA is "predesigned"; the defaults are its slab and bars, and the design check
  shows where a project departs from it (fatigue, which the worksheet doesn't check, for information).

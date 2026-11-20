# Steel girder check: benchmarks

## AISC/NSBA Standard Plans for Steel Bridges, two-span continuous (Jan 2025, Rev 0)

Source: https://www.aisc.org/media/msnnmjfz/aisc-nsba-standard-plans-for-steel-bridges_2-span_2025-01_rev-0.pdf
(free from the NSBA Bridge Resource Center). All designs by NSBA LRFD SIMON, AASHTO LRFD 10th.

Criteria (sheets 2-3): A709 Gr 50W webs and flanges (HPS 70W flanges marked); f'c = 4 ksi deck,
fy = 60 ksi bars; HL-93; fatigue ADTTSL = 1000, 75 years; Category C studs, C' stiffeners;
skew 20 deg; L/800 live load deflection; DFs by 4.6.2.2, "BOTH" (one girder for the governing
interior/exterior DF), effective width of an exterior girder; all sections composite in positive
and negative bending; negative-moment deck steel 1% of the gross deck section; single-sided
transverse stiffeners; no longitudinal stiffeners; studs 7/8 in, 3 per row (flange <= 16 in) or 4.
Dead loads per girder (plf): 8 ft spacing DC1 930, DC2 300, DW 160; 10 ft DC1 1220, DC2 300,
DW 200; 12 ft DC1 1540, DC2 300, DW 240; 14 ft DC1 2000, DC2 300, DW 280.
Overhang slab = slab + 4 in; haunch 50 plf/girder; SIP forms 15 psf; misc steel 30 plf (45 at 14 ft);
TL-5 barrier 600 plf to two girders; 2 in asphalt at 140 pcf; wind 44 psf on the completed bridge.

### 8 ft spacing (sheets 6-8): 5 girders @ 8'-0", 2'-6" overhangs, 37'-0" deck, 34'-0" roadway, 8 in slab

Plates (width x thickness x length, in x in x ft). Segment A from the abutment to field splice 1
(~0.7L); segment C over the pier (mirrored). TA1/BA1, TC1/BC1 are the plates next to the
abutment / splice; TA2/BA2, TC2/BC2 the main ones.

| Spans | WA | TA2 | BA1 | BA2 | WC | TC1 | TC2 | BC1 | BC2 |
|---|---|---|---|---|---|---|---|---|---|
| 2@100 | 42x0.5x70 | 16x1x70 | - | 18x1.25x70 | 42x0.5x60 | - | 22x1.25x60 | - | 22x1.75x60 |
| 2@115 | 48x0.5x81 | 16x1x81 | - | 18x1.25x81 | 48x0.5x68 | - | 22x1.25x68 | 22x1x17 | 22x1.5x34 |
| 2@130 | 54x0.5x91 | 16x1x91 | - | 18x1.25x91 | 54x0.5x78 | 22x1x19 | 22x1.5x40 | 22x1x19 | 22x1.75x40 |
| 2@145 | 60x0.5x102 | 18x1x102 | - | 20x1.25x102 | 60x0.5x86 | 24x1x21 | 24x1.75x44 | 24x1x21 | 24x1.75x44 |
| 2@160 | 66x0.5x112 | 18x1x112 | - | 20x1.25x112 | 66x0.5x96 | 24x1x24 | 24x1.75x48 | 24x1x24 | 24x2x48 |
| 2@175 | 72x0.5x123 | 18x1x123 | 20x1x65 | 20x1.25x58 | 72x0.5x104 | 24x1x26 | 24x2x52 | 24x1.25x26 | 24x2.25x52 |
| 2@190 | 76x0.625x133 | 20x1x133 | - | 22x1x133 | 76x0.625x114 | 26x1.25x28 | 26x2x58 | 26x1.25x28 | 26x2.25x58 |

Reactions per girder (sheet 7; truck and lane include DFs, skew correction and IM on the truck):

| Spans | End DC | End DW | End Truck | End Lane | Pier DC | Pier DW | Pier Truck | Pier Lane |
|---|---|---|---|---|---|---|---|---|
| 2@100 | 51 | 6 | 73 | 24 | 190 | 20 | 122 | 64 |
| 2@115 | 60 | 7 | 75 | 28 | 216 | 23 | 127 | 73 |
| 2@130 | 67 | 8 | 75 | 31 | 248 | 27 | 133 | 83 |
| 2@145 | 76 | 8 | 76 | 35 | 283 | 30 | 136 | 92 |
| 2@160 | 85 | 9 | 76 | 38 | 316 | 33 | 138 | 101 |
| 2@175 | 92 | 10 | 77 | 41 | 352 | 36 | 140 | 111 |
| 2@190 | 101 | 11 | 77 | 45 | 399 | 39 | 141 | 121 |
| 2@205 | 109 | 12 | 77 | 48 | 439 | 43 | 142 | 131 |

Expected of the tool: these girders pass every check (SIMON's designs are near-optimal, so the
governing ratios are close to 1.0), and the reactions are matched.

## FHWA Steel Bridge Design Handbook design examples (ALLCON library)

"FHWA-IF-12-052 Steel Bridge Design Handbook": Design Example 1 (3-span I-girder, section 765 on,
p1149), 2A (2-span I-girder, 866 on, p1320), 2B (2-span WF rolled beam, 928 on, p1450).

## AISC/NSBA Standard Plans, single span (Jan 2025, Rev 0)

Source: https://www.aisc.org/media/eqkjqceh/aisc-nsba-standard-plans-for-steel-bridges_1-span_2025-01_rev-0.pdf
Same criteria as the two-span set. Dead loads per girder (plf): 8 ft DC1 920, DC2 300, DW 160;
10 ft 1220/300/200; 12 ft 1540/300/240; 14 ft 1990/300/280. Misc steel 30/35/40/55 plf.

### 8 ft spacing (sheet 5): same section as above (5 girders, 37 ft deck, 8 in slab)

| Span | Web | T2 (top) | B1 (end) | B2 (main) |
|---|---|---|---|---|
| 80 | 32x0.5x80 | 14x1.25x80 | - | 14x1.25x80 |
| 90 | 36x0.5x90 | 14x1.25x90 | - | 14x1.5x90 |
| 100 | 42x0.5x100 | 15x1x100 | - | 16x1.25x100 |
| 110 | 44x0.5x110 | 16x1.25x110 | 16x1x28 | 16x1.5x54 |
| 120 | 46x0.5x120 | 17x1.25x120 | 18x1x28 | 18x1.5x64 |
| 130 | 50x0.5x130 | 18x1x130 | 18x1x27 | 18x1.75x76 |
| 140 | 54x0.5x140 | 20x1x140 | 20x1x30 | 20x1.5x80 |

Reactions per girder (kip): 80 ft DC 56, DW 6, truck 74, lane 23; 90: 64/7/75/25; 100: 71/8/76/28;
110: 79/9/77/31; 120: 87/10/77/33; 130: 95/10/77/36; 140: 103/11/78/39.
Transverse stiffeners only at 130 ft (4.5 x 0.5 at 6.25 ft, 123.75 ft) and 140 ft.

Transverse stiffeners, two-span 8 ft spacing (sheet 7; 1/2 in thick, single-sided), from each end support:
2@100 none; 2@115 at 103 ft (5.5 in wide); 2@130 at 103 and 116.5 ft (5.5 in); 2@145 at 7.5, 115, 130 ft (6 in);
2@160 at 8.25, 24.75, 95.5, 112, 127, 143.5 ft; 2@175 at 8.75, 26.75, 87, 105, 123, 140.75, 158.75 ft;
2@190 at 152, 171 ft; 2@205 at 143.5, 164, 184.5 ft. Bearing stiffeners 7.25-9.25 in (ends), 10.25-12.25 in (piers).

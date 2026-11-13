# Strut-and-Tie Model 1: anchorage fix options

Run 2026-11-09 on a copy of "Strut-and-Tie Model 1" (`6f71455b-…`, read-only snapshot), each option
rebuilt from the design's own template and girder link. The saved design is unchanged. AASHTO
LRFD 10th Edition: development for the tie's full yield (5.8.2.4.2, λer = 1), measured from where
the bars leave the extended nodal zone.

| Option | Failing checks | Anchorage, needed / available (in) |
|---|---|---|
| As saved: 26 #11 hooked | column bars at T3; top bars at T1 and T6 | T3: 36.1 / 27.3; T1: 44.8 / 36.7; T6: 44.8 / 37.1 |
| 68 #7 hooked (the same area) | none | T3: 27.3 / 27.6; T1: 34.4 / 36.7; T6: 34.4 / 37.1 |
| 36 #9 hooked (less area) | all three anchorages; column nodes C1, C2 | T3: 31.9 / 27.5; T1: 39.7 / 36.7; T6: 39.7 / 37.1 |
| Cap ends 8 in longer (26 #11) | column bars at T3; a strut-tie angle under 25° | T3: 36.1 / 27.3; T1: 44.8 / 44.8; T6: 44.8 / 45.2 |
| Ends 8 in longer, cap 9 in deeper (26 #11) | column bars at T3 | T3: 36.1 / 29.8 |
| Ends 8 in longer with 68 #7 | a strut-tie angle under 25° | all anchorages pass |

What this says, for the engineer to decide:

- Only the bar size fixes all three anchorages without changing the geometry. 68 #7 in three
  layers of 23 is a lot of bars to place; a mix (#8 or #9 with more bars, or #11 top bars with #7 or
  #8 column bars) is worth trying in the template.
- The column bars (the tie T3–M1–S3) are taken as the top bars' size and number, the template's
  assumption. Their real size and number come from the column's design; enter them under Ties and
  the anchorage at T3 is rechecked.
- Lengthening the ends fixes the top bars' hooks but changes the struts' geometry, and it doesn't
  help the column bars, which need more height over the column.
- Headed bars (5.10.8.2.7) are allowed at this spacing but need more length than hooks here.

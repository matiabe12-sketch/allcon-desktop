**Subject:** No-plans double-tee load ratings: problems with the iterated-BrR approach, and a defensible back-calculation

Hi,

Below is a summary of what I found reviewing no-plans LFR load rating packages for prestressed double-tee bridges. Each package rates the bridge in AASHTOWare BrR, with supplemental hand calculations. I re-rated each bridge independently from its SIA and inspection sketch, then compared the results with the BrR output in the package.

**1. How the packages set the unknown prestress**

The method note says the strand area and jacking ratio "are determined by iteration" in BrR to give the exterior girder an HS-20 inventory rating factor of 1.0, assuming 0 in of HMA "for conservatism" (BRM 1.7.2). In practice, the rater enters a trial jacking force in the BrR model, runs the rating, reads the exterior girder's rating factor, adjusts the force and repeats. Only the final rating runs are printed.

**2. What's wrong with this approach**

- **The iteration isn't documented and can't be checked.** The package has no trial runs, no table of attempts and no output from the 0 in HMA run that supposedly reached 1.0. A reviewer has to take the final strand count on trust. When I re-ran one model, its exterior girder did reach about 1.0 at 0 in HMA. In another, the reported exterior rating was 1.10 even with the wearing surface in place. Either the iteration didn't land on 1.0, or the model was changed afterwards.
- **It solves for two unknowns with one target.** Both the strand area and the jacking ratio are "iterated", so many combinations give the same exterior rating and the answer isn't unique. As a result, the supplemental calcs and the BrR model disagree: the calcs use one strand area at a jacking ratio of 0.70, and the model uses the same force at 0.75. That is about 7% less prestressing steel in the model, and strand area drives flexural capacity.
- **Only one girder is set, so the method contradicts its own premise.** BRM 1.7.2(A) assumes the girders were designed for HS-20. If that holds, no girder should rate below 1.0 at HS-20 inventory under its actual dead load. Setting only the exterior girder left the interior girders rating about 0.81 at inventory, which a 1985 designer would not have produced. The low rating is an artifact of how the prestress was solved, not a property of the bridge.
- **The prestress is solved for one bridge and the rating is run on a heavier one.** The prestress is solved with 0 in of HMA, then the bridge is rated with an overlay (3 in of asphalt in one case). The overlay doesn't match the SIA, which records 0 in and a concrete wearing surface. Each choice looks conservative alone, but together they are inconsistent, and the overlay's source isn't given.
- **The BrR model's inputs don't trace to the field records.** Examples:
  - a 6.5 in flange where the sketch shows a 2 in flange under a 6 in topping;
  - an asphalt overlay where the SIA records none;
  - a utility load worked out in the supplemental calcs but missing from the dead-load moments they quote, and from the model run that produced the reported ratings;
  - exterior girder section properties entered by hand that, by the model's own description, don't match the shape shown.

  None of these differences is explained in the package.
- **The supplemental calcs don't check BrR's ratings.** They list inputs (concrete, strand, stress limits, dead loads) and take BrR's own moments as given ("Total live load moment, BrR"). The only independent check is the distribution factors. An error in the BrR model therefore passes straight through to the submittal.
- **Supplemental calcs are reused between bridges without being updated.** In one package, the section modulus, the "BrR" moments, the bridge width, the "values from BrR" distribution factors, the year built and the NBI condition all belonged to a different bridge. Its distribution-factor check came out 10–17% apart on its own numbers, yet each comparison was marked "acceptable".
- **The lane rule for legal loads isn't stated.** One model applies multi-lane distribution factors to legal and permit vehicles. For a bridge built before 1985, BRM 1.3(D) calls for single-lane factors. That alone changed the interior girder's legal ratings by about 29%. Whichever rule is used has to be chosen and stated on the rating summary sheet.

**3. What the independent comparison showed**

With the inputs taken from the SIA and sketch, BrR's ratings came out 9–22% lower on every girder, outside the 5% check, for every vehicle. The difference was a constant ratio across all vehicles on each girder, and the distribution factors agreed within about 2.5%. That pattern means the two calculations agree on the live load, and the gap comes from the prestress and dead-load inputs.

Given the BrR model's own inputs, the hand rating matched BrR within 0.3% on all ratings. So BrR computes correctly. What's in question is the inputs it was given and how the prestress was set.

**4. A defensible back-calculation**

The rating stays in BrR as the rating of record, but the prestress and inputs are set by a stated, reproducible procedure:

1. **Every input traces to a record or a stated assumption.**
   - **From the SIA and inspection sketch:** geometry (span, units, flange and stem dimensions, deck, curbs, sidewalks, rails, utilities).
   - **From the BRM tables by year built:** materials and strand.
   - **Stated assumptions:** anything scaled or assumed, such as stem widths and utility weights, is listed for review.
2. **One unknown, solved directly.** Strand size, strength and jacking ratio come from the BRM table, so the strand area is the only unknown. Solve for the smallest strand area that gives every girder an HS-20 inventory rating of at least 1.0 in strength flexure at every point, under the dead loads actually used in the rating (BRM 1.7.2(A)). Check the cracking moment per BRM 1.7.2, and round up to whole strands.
3. **Solve with the cases the original design would have used.** Use trucks between the curbs, with the sidewalk dead load and pedestrian load. Rate other cases afterwards with that prestress, such as trucks on a mountable sidewalk, rather than using them to set it.
4. **Show the solution.** The calculation shows the strand count, the check that every girder rates at least 1.0, and that one strand fewer would put the governing girder below 1.0. A checker can reproduce it.
5. **Add any extra conservatism as a separate, stated step.** If a future overlay allowance is wanted, apply it in the rating after the back-calculation, with its basis stated, not inside the solve.
6. **Build the BrR model from the same inputs and compare.** Model BrR from the hand calculation's input sheet, read its rating report back and compare. Accept within 5%, and confirm BrR's distribution factors the same way. Agreement shows the model was built correctly. Disagreement points to a modeling slip, such as a wrong strand centroid, a missing dead load or a wrong travelway, before the package is submitted.

**Why this is defensible**

- **It is consistent with its premise.** No girder rates below the design load it was assumed to be designed for.
- **The result is unique and reproducible.** With one unknown and a defined target, any checker gets the same strand count.
- **Every number is traceable** to the SIA, the sketch, a BRM table or a stated assumption.
- **It is independently verified.** The hand rating and BrR confirm each other, so an input error in either one shows up.

Regards

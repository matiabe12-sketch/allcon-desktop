import type { Line } from "@/lib/calcs/library/templates";
import { cell, COLOR_NOTE, INPUT_COLOR, isInput, num } from "../calc-style";
import type { Figure } from "../figures";
import { CHECK_LABEL, codeTension, Ec, strandCG, interiorMethod, isSidewalkTruckCase, legalLanes, needsPosting, postTons, rateDoubleTee, roadwayWidth, strainCompat, tensionIgnored, unitDamaged, type DtInputs } from "./double-tee";
import { checkStandard, DT_STANDARD_FC, DT_STANDARD_NAME, DT_STANDARD_SLAB } from "./dt-standard";

const ftInText = (inches: number) => {
  const ft = Math.floor(inches / 12 + 1e-9);
  return `${ft}'-${+(inches - ft * 12).toFixed(3)}"`;
};

// The double-tee load rating as a Calcs worksheet, in the order of CDOT's supplemental calcs:
// materials, the prestressing steel, stress limits, dead loads, distribution, live load, the ratings
// and posting, then the items for review. The moving-load moments and the
// section properties come from ALLCON's analysis as given values; every step from them is live math.

const kft = "\\mathrm{kip}\\cdot\\mathrm{ft}";
const ok = (demand: string, capacity: string) => `\\operatorname{if}\\left(${demand}\\le ${capacity},\\text{OK},\\text{NG}\\right)=`;
/** A vehicle's subscript in the worksheet. */
const VCODE: Record<string, string> = {
  "HS-20": "HS",
  "CO Type 3": "T3",
  "CO Type 3S2": "T3S2",
  "CO Type 3-2": "T32",
  SU4: "SU4",
  SU5: "SU5",
  "CO SU6": "SU6",
  "CO SU7": "SU7",
  NRL: "NRL",
  EV2: "EV2",
  EV3: "EV3",
  "CO Permit": "PMT",
  "CO Mod Tandem": "MT",
};

/** Notes are plain text: a small number written in powers of ten for the math (6.52·10⁻²) is written out (0.065). */
const plain = (s: string) => s.replace(/(-?\d+(?:\.\d+)?)\\cdot10\^\{(-?\d+)\}/g, (_, m: string, e: string) => cell(+m * 10 ** +e));

/** A check as it reads in a sentence. */
const checkName = (c: keyof typeof CHECK_LABEL) => (c === "flexure" ? "strength flexure" : c === "shear" ? "strength shear" : CHECK_LABEL[c].charAt(0).toLowerCase() + CHECK_LABEL[c].slice(1));

const andList =(xs: (string | false | 0)[]) => {
  const w = xs.filter((x): x is string => !!x);
  return w.length > 1 ? `${w.slice(0, -1).join(", ")} and ${w[w.length - 1]}` : (w[0] ?? "");
};

/** The design vehicle as the calc names it. */
function designVehicleName(v: string) {
  return v === "HS25" ? "HS25 (1.25 × HS-20)" : v === "H20" ? "H20" : "HS-20";
}

/** What the back-calculation takes from the original design's time, and what the rating takes from the current Specifications. */
function originalNote(i: DtInputs, r: ReturnType<typeof rateDoubleTee>) {
  const o = r.original;
  const y = i.bridge.yearBuilt;
  const vehicle =
    o.vehicle === "HS25" ? `HS25, CDOT's design vehicle for bridges built from 1994 to 2001` : o.vehicle === "H20" ? `H20, CDOT's design vehicle for bridges built before 1944` : `HS-20, CDOT's design vehicle for bridges built from 1944 to 1993`;
  const dev = `its strands are developed over (f*su − ⅔fse)D, without the 1.6 multiplier that SSHB 9.28.1 now carries (17th Edition errata). FHWA required the multiplier from October 1988, but a bridge designed without it has fewer strands than a back-calculation with it would give, so it is left out of the back-calculation in every era, on the safe side`;
  const dist = r.era && r.era.rule !== "current" ? "The live load distribution of the multi-beam deck is that of its era (section 6); the strand stress at ultimate is that of the current Specifications." : "The live load distribution and the strand stress at ultimate are those of the current Specifications.";
  const d = o.devCompare;
  const cost = !d
    ? ""
    : d.withOriginal - d.rated > 5e-4
      ? ` The rating uses the current rule (SSHB 9.28.1, with the 1.6 multiplier), so near the ends of the span the strands carry less stress than the design assumed: in flexure, HS-20 rates ${num(d.withOriginal, 3)} at inventory with the development length of the design, and ${num(d.rated, 3)} with the current one.`
      : ` The rating uses the current rule (SSHB 9.28.1, with the 1.6 multiplier); HS-20 governs where the strands are fully developed either way, so it doesn't change the rating.`;
  return `Original design:- The prestress is set by the rules of the bridge's time, taken from the year it was built (${y}). The design vehicle is ${vehicle} (BRM 1.7.2(A)), and ${dev}. ${dist} The ratings then follow the current Specifications, the MBE and the BRM (BRM 1.3).${cost}`;
}

/** The original design's distribution for an interior unit of a multi-beam deck, where its era's rule differs from the current Specifications. */
function eraDistribution(
  i: DtInputs,
  r: ReturnType<typeof rateDoubleTee>,
  g: ReturnType<typeof rateDoubleTee>["girders"][number],
  m: (math: string, ref?: string, unit?: string) => void,
  text: (t: string, style?: "heading" | "subheading" | "note") => void,
) {
  const e = r.era;
  if (!e || e.rule === "current" || g.ext || i.prestress.mode !== "back-calculate") return;
  text(
    e.rule === "slab"
      ? `Original design:- Built in ${i.bridge.yearBuilt}, before the 12th Edition (1977). The 9th to 11th Editions (1965–1973) distributed the wheels of a multi-beam deck as for a slab: each wheel over a width E = 4 + 0.06L, at most 7 ft (1973, Art. 1.3.2(C), Case B). That factor sets the prestress; the rating uses the current S/D.`
      : `Original design:- Built in ${i.bridge.yearBuilt}, under the 12th or 13th Edition (1977–1983). Their multi-beam formula (from NCHRP Report 83) used an effective spacing (12NL + 9)/Ng over D = 5 + NL/10 + (3 − 2NL/7)(1 − C/3)² for C ≤ 3, or 5 + NL/10 for C > 3, with C = K·W/L and K = √(EI/2GJ), the same K as the current Specifications' without a deck slab. That factor sets the prestress; the rating uses the current S/D.`,
    "note",
  );
  if (e.rule === "slab") {
    m("E_0\\coloneq\\min\\left(4\\mathrm{ft}+0.06\\cdot L,7\\mathrm{ft}\\right)=", "Width over which a wheel spreads", "ft");
    m(`DF_{0}\\coloneq\\frac{${num(g.S, 10)}\\mathrm{ft}}{E_0}=`, `${g.name}, the original design's factor: its width over E`);
    return;
  }
  const t = e.typical!;
  m(`N_{L0}\\coloneq ${r.geo.NL}`, "Design lanes");
  m(`N_g\\coloneq ${i.units.count}`, "Units across the bridge");
  m("S_{e}\\coloneq\\frac{\\left(12\\cdot N_{L0}+9\\right)\\mathrm{ft}}{N_g}=", "Effective spacing", "ft");
  m(`C_0\\coloneq ${num(t.K!, 10)}\\cdot\\frac{${num(r.geo.roadW, 10)}\\mathrm{ft}}{L}=`, `C = K·W/L, K = √(1.2 I/J) = ${num(t.K!, 3)}, W the overall width`);
  if ((t.C ?? 0) <= 3) m("D_0\\coloneq\\left(5+\\frac{N_{L0}}{10}+\\left(3-\\frac{2\\cdot N_{L0}}{7}\\right)\\cdot\\left(1-\\frac{C_0}{3}\\right)^{2}\\right)\\cdot\\mathrm{ft}=", "C ≤ 3", "ft");
  else m("D_0\\coloneq\\left(5+\\frac{N_{L0}}{10}\\right)\\cdot\\mathrm{ft}=", "C > 3", "ft");
  m("DF_{0}\\coloneq\\frac{S_{e}}{D_0}=", `${g.name}, the original design's factor`);
}

/**
 * Each stem's share of the live load, against its unit's factor: interior stems by the same table
 * (S/5.5 with S the stem's own spacing), the exterior unit by the lever rule hinged at each stem.
 * The units are rated whole; this shows that no stem takes more than its half.
 */
function stemCheck(i: DtInputs, r: ReturnType<typeof rateDoubleTee>): string | null {
  const u = i.units;
  if (!i.deck.present || interiorMethod(i) !== "table" || r.condition.alone || i.options.dfOverride) return null;
  const units = u.layout ?? Array.from({ length: u.count }, () => ({ flangeWidth: u.flangeWidth, stemSpacing: u.stemSpacing }));
  if (units.length < 3) return null;
  // Stem lines across the bridge (ft from the left edge), two per unit.
  const stemX: number[] = [];
  let left = 0;
  for (const un of units) {
    stemX.push((left + (un.flangeWidth - un.stemSpacing) / 2) / 12, (left + (un.flangeWidth + un.stemSpacing) / 2) / 12);
    left += un.flangeWidth + (u.jointGap || 0);
  }
  const spacingOf = (k: number) => ((k > 0 ? stemX[k] - stemX[k - 1] : 0) + (k < stemX.length - 1 ? stemX[k + 1] - stemX[k] : 0)) / (k > 0 && k < stemX.length - 1 ? 2 : 1);
  const unitDf = (gi: number) => r.girders.find((g) => g.i === gi && !isSidewalkTruckCase(g.name))?.dfMulti;
  const parts: string[] = [];
  let fine = true; // no stem governs or takes more than its half
  let more = false; // some unit's stems together take more than the unit's factor
  // The typical interior unit and the one next to the exterior.
  const gTyp = units.length >= 5 ? 3 : r.geo.iTyp + 1;
  for (const gi of [...new Set([2, gTyp])]) {
    if (gi < 2 || gi > units.length - 1) continue;
    const a = spacingOf(2 * gi - 2) / 5.5;
    const b = spacingOf(2 * gi - 1) / 5.5;
    const whole = unitDf(gi);
    if (whole === undefined) continue;
    const ratio = (a + b) / whole;
    const rated = r.ratings[0].per.find((p) => p.g === `G${gi}`);
    const gov = r.ratings[0].govInv.inv.inv;
    const takes = Math.abs(a - b) < 1e-3 ? `each stem takes ${num(a, 3)}` : `its stems take ${num(a, 3)} and ${num(b, 3)}`;
    let tail: string;
    if (ratio <= 1 + 1e-3) tail = ratio >= 1 - 1e-3 ? `, the same as the unit's factor.` : `, less than the unit's ${num(whole, 3)}.`;
    else {
      const perStem = rated ? rated.inv.inv / ratio : null;
      const governs = perStem !== null && perStem < gov - 1e-9;
      if (governs) fine = false;
      more = true;
      tail = `, ${((ratio - 1) * 100).toFixed(1)}% more than the unit's ${num(whole, 3)}.${
        perStem === null ? "" : governs ? ` That would lower G${gi}'s HS-20 inventory rating to about ${num(perStem, 2)}, below the governing ${num(gov, 3)}: G${gi} should be rated per stem.` : ` That would lower G${gi}'s HS-20 inventory rating to about ${num(perStem, 2)}, still above the governing ${num(gov, 3)}.`
      }`;
    }
    parts.push(`G${gi}: ${takes} (S/5.5, with S the distance to the stems on either side), ${num(a + b, 3)} together${tail}`);
  }
  // The exterior unit by the lever rule, hinged at each stem: wheels 6 ft apart, trucks 12 ft apart,
  // the first wheel 2 ft from the curb or rail face (BRM 1.3(F)).
  const share = (face: number) => {
    const wheels = [2, 8, 14, 20].map((d) => face + d);
    const at = [0, 0];
    for (const w of wheels)
      for (let k = 0; k < stemX.length - 1; k++)
        if (w >= stemX[k] - 1e-9 && w <= stemX[k + 1]) {
          const t = (w - stemX[k]) / (stemX[k + 1] - stemX[k]);
          if (k < 2) at[k] += (1 - t) * 0.5;
          if (k + 1 < 2) at[k + 1] += t * 0.5;
          break;
        } else if (k === 0 && w < stemX[0]) {
          at[0] += 0.5 * (1 + (stemX[0] - w) / (stemX[1] - stemX[0]));
          at[1] -= 0.5 * ((stemX[0] - w) / (stemX[1] - stemX[0]));
          break;
        }
    return at.map((v) => v * 2); // wheel lines
  };
  const ext = r.girders.filter((g) => g.ext && g.i === 1);
  // The case that loads the exterior unit (trucks on a mountable sidewalk, if rated).
  for (const g of ext.some((q) => isSidewalkTruckCase(q.name)) ? ext.filter((q) => isSidewalkTruckCase(q.name)) : ext) {
    const onWalk = isSidewalkTruckCase(g.name);
    const face = onWalk || !r.ped.sidewalks.length ? i.roadway.railFaceOffset / 12 : i.roadway.curbFaceOffset / 12;
    const [o, n] = share(face);
    const half = g.dfMulti / 2;
    const over = Math.max(o, n) > half + 1e-3;
    if (over) fine = false;
    parts.push(
      `${g.name}: by the lever rule, the outer stem takes ${num(o, 3)} and the inner ${num(n, 3)}. ${
        over ? `The ${o > n ? "outer" : "inner"} stem takes more than half the unit's ${num(g.dfMulti, 3)} (${num(half, 3)}), so it should be rated on its own.` : `Neither takes more than half the unit's ${num(g.dfMulti, 3)} (${num(half, 3)}).`
      }`,
    );
  }
  if (!parts.length) return null;
  return `Per stem:- Each unit is rated as a whole, both stems together. As a check, each stem is also given its own share of the wheels, with the deck carrying them to the stems on either side. ${parts.join(" ")}${fine ? (more ? " No stem's share changes the governing rating, so the unit ratings stand." : " No stem takes more than the unit ratings allow for, so they stand.") : ""}`;
}

/** Why the final tension is 1.0 ksi when the prestress is back-calculated. */
const TENSION_NOTE = "Final tension: 1.0 ksi, as entered. Not a code limit: SSHB 9.15.2.2 gives 6√f′c, which MBE 6B.5.3.3 requires at the inventory level";

/** The package's opening note: the purpose, the method and how the inputs were found, for this bridge. */
function methodNote(i: DtInputs, r: ReturnType<typeof rateDoubleTee>, text: (t: string, style?: "heading" | "subheading" | "note") => void) {
  const back = r.solve.mode === "back-calculate";
  const kinds = new Set(Object.values(i.sources ?? {}).map((s) => s.kind));
  const records = [kinds.has("sia") && "the Structure Inventory and Appraisal (SIA) report", (kinds.has("sketch") || i.sketch) && "the bridge inspection sketch"].filter(Boolean) as string[];
  // The walkways (pedestrians; mountable or not) and the curbs (dead load only).
  const sw = i.loads.sidewalks.filter((s) => !s.curb);
  const curbs = i.loads.sidewalks.filter((s) => s.curb);
  const tension = i.options.tensionLimit;

  text("Approach and method", "subheading");
  const brrVer = i.brrResults.match(/Engine\s+(\d+\.\d+\.\d+)/)?.[1];
  text(`Purpose:- The load rating tool of record for this bridge is the AASHTOWare BrR${brrVer ? ` V ${brrVer}` : ""}. These calculations in this package support it. They:`);
  text("• document the inputs and where they come from;");
  if (back) text("• back-calculate the prestress, which is not known;");
  else if (i.prestress.mode === "known" && i.prestress.harp) text("• take the prestress from the standard plans the bridge was built to;");
  text("• check the live load distribution factors; and");
  text("• rate each vehicle by hand, to confirm the BrR ratings and the posting recommendation.");
  text(
    `Method:- The bridge is rated by Load Factor Rating (LFR), following the AASHTO Standard Specifications for Highway Bridges, 17th Edition (SSHB); the AASHTO Manual for Bridge Evaluation (MBE), Section 6, Part B; and the CDOT Bridge Rating Manual (BRM). HS-20 is rated at the inventory and operating levels, and the Colorado legal and permit vehicles at the operating level.`,
  );
  text(
    `The rating factor is RF = (C − A₁D) / (A₂L(1 + I)), where A₁ = 1.3, and A₂ = 2.17 at inventory or 1.3 at operating (MBE 6B.4.3). The impact factor is I = 50/(L + 125) ≤ 0.30 (SSHB 3.8.2.1), which gives I = ${num(r.impact)} for this span. Each vehicle is moved across the span in both directions, and every girder is rated at each point of interest (MBE 6B.4.1).`,
  );
  if (back)
    text(
      `No plans:- There are no design plans or shop drawings for this bridge. The geometry (${andList(["span", "number and spacing of units", "flange and stem dimensions", i.deck.present && "deck", "asphalt", curbs.length > 0 && "curbs", sw.length > 0 && "sidewalks", "railings", "diaphragms"])}) comes from ${records.length ? records.join(" and ") : "the field records"}. The material properties are those the BRM gives for a bridge built in ${i.bridge.yearBuilt}. Because the prestress is not known, it is back-calculated per BRM 1.7.2(A): it is set so that every girder's ${designVehicleName(r.original.vehicle)} inventory rating factor for strength flexure is at least 1.0${i.options.roundStrands ? ", then rounded up to whole strands" : ""}, ${i.options.solveWithOverlay ? "under the dead loads used in the rating, the asphalt included as original to the bridge" : "under the dead load of the original design, without the asphalt: an overlay added later is rated, not designed for, so it lowers the ratings"}.`,
    );
  if (back) {
    text(
      `It is assumed the girders were designed for HS-20.${
        sw.length && i.loads.sidewalkMountable ? " The prestress is set with trucks between the curbs, the cases the original design would have used; trucks on the mountable sidewalk are then rated with that prestress, not used to set it." : ""
      } The service checks then use this prestress. Section 7 works out the back-calculation.`,
    );
    text(
      "Basis:- BRM 1.7.2(A) is written for on-system bridges. BRM 1.9 applies the same rating procedures to off-system bridges, and step 6 of 1.7.2(A) rates the back-calculated steel in BrR, as done here. The assigned rating of BRM 1.7.2(B) would omit the single-unit and emergency vehicles, which this rating includes.",
    );
  }
  if (back) text(originalNote(i, r));
  const harp = i.prestress.mode === "known" ? i.prestress.harp : null;
  const std = harp ? checkStandard(i) : null;
  if (harp && std?.row) {
    const row = std.row;
    text(
      `Standard plans:- There are no as-built plans for this bridge, but it was built in ${i.bridge.yearBuilt} and matches the ${DT_STANDARD_NAME}, Dwg. B-3, for a ${row.span} ft span ${ftInText(row.width * 12)} wide: ${row.units} units ${ftInText(row.unitWidth)} wide, stems ${ftInText(row.S)} apart, ${row.D} in deep with a ${DT_STANDARD_SLAB} in integral top slab. The geometry comes from ${records.length ? records.join(" and ") : "the field records"}, and the prestress from the standard: ${num(r.solve.nStrands, 0)} strands of 1/2 in, 270 ksi stress-relieved strand per unit, jacked to Fi = ${row.Fi} kip (${row.ri} f′s A*s) and ${row.Ff} kip after losses, harped at 0.4 span with the strand centroid ${row.EE} in above the bottom at the ends and ${row.EMS} in at midspan (Dwg. B-7); f′c ${DT_STANDARD_FC * 1000} psi and f′ci ${row.fci} psi.`,
    );
  }
  text(
    `Checks:- The girders are rated for flexural strength (SSHB 9.17) and for concrete stresses at service (SSHB 9.15.2.2, MBE 6B.5.3.3): ${tensionIgnored(i) ? "" : "tension at the bottom of the girder, and "}compression in the girder${i.deck.present ? " and the deck" : ""}. ${
      tensionIgnored(i)
        ? "The final tension in the girder is not rated. The prestress is back-calculated for strength (BRM 1.7.2), so a tension check on it would only test the assumed prestress, not the bridge, and the strength back-calculation is a lower bound on the prestress of girders designed to service limits. The tension at the code limit, 6√f′c (SSHB 9.15.2.2), is reported for information; the bridge's service performance is shown by its inspection history (no flexural cracking or other load-induced distress, MBE 6.1.4). This departs from MBE 6B.5.3.3, which requires the service stresses at the inventory level; it is kept because this rating was made that way."
        : tension === 1 && back
        ? "The final tension limit is 1.0 ksi, as entered. That isn't a code limit: SSHB 9.15.2.2 gives 6√f′c, and MBE 6B.5.3.3 requires it at the inventory level."
        : tension === null
          ? "The final tension limit is 6√f′c (SSHB 9.15.2.2), rated at the inventory level as MBE 6B.5.3.3 requires."
          : `The final tension limit is ${num(tension)} ksi.`
    } ${
      i.options.checkShear
        ? "Shear is rated (SSHB 9.20)."
        : r.shearRequired.length
          ? `Shear is not rated, but BRM 1.4 requires it: ${r.shearRequired.join("; ")}.`
          : `Shear is not rated: the bridge was built in ${i.bridge.yearBuilt}, before 2002, its superstructure condition is ${i.bridge.nbiSuper} (5 or more) and it shows no visible signs of shear distress, so BRM 1.4(O) allows the shear rating to be ignored with the Bridge Rating Engineer's approval. The inspection findings at the girder ends are listed under the items for review for that decision; without visible shear distress, a field load test for shear is not required either (BRM 1.7, note 3).`
    }`,
  );
  text(
    `Loads:- The dead loads are ${andList(["the self-weight", i.deck.present && "the deck", "asphalt", curbs.length > 0 && "curbs", sw.length > 0 && "sidewalks", "railings", i.loads.diaphragmKip && "diaphragms"])}. The live load on each girder uses the distribution factors calculated in section 6 (SSHB 3.23). ${
      sw.length
        ? i.loads.sidewalkMountable
          ? `Because the sidewalk is mountable, two cases are rated and the lower rating governs (BRM 1.4(T)): trucks between the curbs${i.loads.pedestrians ? ", with pedestrian load on the sidewalk (SSHB 3.14.1.1)" : ""}; and trucks on the sidewalk, without pedestrians.${i.loads.pedestrians ? " The other case of BRM 1.4(T), full pedestrian load without vehicles, is covered by the first: for the girders, vehicles and pedestrians together load them more than pedestrians alone." : ""}`
          : `Trucks stay between the curbs${i.loads.pedestrians ? ", with pedestrian load on the sidewalk (SSHB 3.14.1.1)" : ""}.`
        : curbs.length
          ? "There is no sidewalk. The curbs carry no pedestrians and can't be mounted, so trucks stay between the curb faces."
          : "There is no sidewalk."
    }`,
  );
  if (back && i.deck.present)
    text(
      "Deck:- The deck, the precast flange with its cast-in-place topping, is not rated by calculation: with no plans its reinforcement is unknown. It is rated by field inspection under BRM 1.7.2(B), as a concrete deck without plans in condition 5 or better with no distress due to load: 36 T inventory and 40 T operating for the design vehicle. MBE 6.1.5.1 likewise holds that stringer-supported concrete decks carrying normal traffic satisfactorily need not be routinely evaluated for load capacity. The deck's condition and its dead-load history (BRM 1.7.2(B) asks that the dead loads have not changed for an appreciable period) are given under the items for review.",
    );
  const cond = i.condition;
  if (r.condition.active) {
    const dmg = cond.units.filter(unitDamaged);
    text(
      `Condition:- The bridge is rated in its condition at the latest inspection (MBE 6.1.2).${back ? " The prestress is still back-calculated on the intact bridge, since the original design had none of this damage; the damage then lowers the ratings." : ""}${
        dmg.length
          ? ` Damaged strands are removed from the unit's prestressing steel over the damaged length and a development length (${num(r.condition.ldDev, 2)} ft) past each end of it, where they cannot yet carry their full stress (SSHB 9.28); concrete lost from the top reduces the depth and the compression flange.${dmg.some((c) => c.factor < 1) ? " Where the damage cannot be measured, a judgment factor reduces the unit's capacity; its reason is given below." : ""}`
          : ""
      }${cond.jointsFailed ? " The joints between the units no longer share load, so each unit carries the wheels that fit on it (the lever rule with a hinge at every joint) in place of the distribution of the original design." : ""} The ratings as designed and as inspected are compared after section ${back ? 10 : 9}.`,
    );
  }
  text(
    `Results:- The rating summary lists the governing rating factor for each vehicle, and posting follows BRM 1.15.1.${i.brrResults.trim() ? " The BrR ratings and distribution factors are then compared with the hand calculations from this package; they are taken to agree when they are within 5% of each other. The ratings reported for the bridge (load rating summary, SIA) are BrR's, given in the comparison table; this package's values verify them." : ""}`,
  );
}

export function dtRatingCalcLines(i: DtInputs, title: string, figures?: { section?: Figure; summary?: Figure; comparison?: Figure; girders?: Figure }): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note", newPage?: boolean) => lines.push({ text: plain(t), ...(style ? { style } : {}), ...(newPage ? { newPage } : {}) });
  const m = (math: string, ref?: string, unit?: string) =>
    lines.push({
      math,
      ...(ref ? { ref: plain(ref) } : {}),
      ...(unit ? { unit } : {}),
      ...(math.length > 110 && ref ? { wide: true } : {}),
      ...(isInput(math) ? { color: INPUT_COLOR } : {}),
    });
  const given = (math: string, ref?: string) => lines.push({ math, ...(ref ? { ref: plain(ref) } : {}) });
  // Inputs written so that three decimals keep their digits: loads in lbf/ft, small stresses in psi and
  // the strand centroid as its rows (an exact fraction), so the worked results match the engine's.
  const plf = (sym: string, klf: number, ref?: string) => given(`${sym}\\coloneq ${num(klf * 1000)}\\frac{\\mathrm{lbf}}{\\mathrm{ft}}`, ref);
  const psi = (sym: string, ksi: number, ref?: string) => given(`${sym}\\coloneq ${num(ksi * 1000)}\\mathrm{psi}`, ref);
  const cgRows = (sym: string, nIn: number, ref: string) => {
    const mt0 = i.materials;
    const nStrands = Math.abs(nIn - Math.round(nIn)) < 1e-6 ? Math.round(nIn) : nIn;
    const perStem = nStrands / 2;
    const r0 = mt0.strandsPerRowPerStem;
    const full = Math.floor(perStem / r0 + 1e-9);
    const rest = perStem - full * r0;
    if (!Number.isInteger(nStrands) || !(r0 > 0) || full < 1) return given(`${sym}\\coloneq ${num(strandCG(nStrands * mt0.aps, mt0), 9)}\\mathrm{in}`, ref);
    const rows = Array.from({ length: full }, (_, k) => num(mt0.firstRow + k * mt0.rowSpacing));
    const sum = r0 === 1 ? rows.join("+") : `${num(r0)}\\cdot\\left(${rows.join("+")}\\right)`;
    const top = rest > 1e-9 ? `+${num(rest)}\\cdot${num(mt0.firstRow + full * mt0.rowSpacing)}` : "";
    m(`${sym}\\coloneq\\frac{${sum}${top}}{${num(perStem)}}\\cdot\\mathrm{in}=`, ref, "in");
  };
  const r = rateDoubleTee(i);
  const s = r.solve;
  const mt = i.materials;
  const deck = i.deck.present ? i.deck : null;
  const back = s.mode === "back-calculate";
  const hs = r.ratings.find((x) => x.cls === "design")!;
  // The worked girder: the one governing HS-20 inventory in flexure, at its point.
  const hsFlex = hs.per.reduce((a, c) => (c.flexInv.inv < a.flexInv.inv ? c : a));
  const g = r.girders.find((x) => x.name === hsFlex.g)!;
  const x = hsFlex.flexInv.x;
  const L = i.span;
  const sw = i.loads.sidewalks.filter((s) => !s.curb); // walkways, not curbs
  // Two other runs for the back-calculation's notes: the MBE's default girder concrete, and the asphalt in the solve.
  const hsInvOf = (q: ReturnType<typeof rateDoubleTee>) => q.ratings.find((v) => v.cls === "design")!.govInv.inv.inv;
  const tryRate = (j: DtInputs) => {
    try {
      return rateDoubleTee(j);
    } catch {
      return null;
    }
  };
  const mbeFc = 3.75; // MBE Table 6B.5.2.4-1: 3.0 ksi for 1959 and later, increased 25% for prestressed concrete
  const altFc = back && i.bridge.yearBuilt >= 1959 && Math.abs(mt.fc - mbeFc) > 1e-9 ? tryRate({ ...i, materials: { ...mt, fc: mbeFc, fci: Math.min(mt.fci, 0.8 * mbeFc) } }) : null;
  const altAsphalt = back && !i.options.solveWithOverlay && i.loads.asphalt > 0 ? tryRate({ ...i, options: { ...i.options, solveWithOverlay: true } }) : null;

  text(title.toUpperCase(), "heading");
  text(
    `Load rating of ${i.bridge.id || "the bridge"}${i.bridge.facility ? `, ${i.bridge.facility}` : ""}${i.bridge.feature ? ` over ${i.bridge.feature}` : ""}. The superstructure is ${i.numSpans > 1 ? `${i.numSpans} simple spans` : "a simple span"} of ${num(L, 3)} ft, made of ${i.units.count} adjacent precast prestressed double-tee units${deck ? ` with a ${num(deck.thk)}" composite deck` : ""}${i.skew ? `, on a ${num(i.skew)}° skew` : ""}. Every girder is rated at ${r.pois.length - 2} points along the span.`,
  );
  methodNote(i, r, text);
  // The worked girder and why: every girder's HS-20 ratings, identical girders on one line.
  const governsAll = hs.govInv.g === g.name;
  text(
    `${g.name} governs${governsAll ? "" : " the HS-20 inventory rating in flexure"} and is worked out in full below, at x = ${num(x, 2)} ft; the other girders are rated using the same method at every point along the span and are shown in the table below.`,
  );
  // The table of every girder when the figures are drawn; the same as a list otherwise.
  if (!figures?.girders) text("HS-20 rating of each girder: the lowest over all points and checks (DF, two or more lanes)", "note");
  const rows: { names: string[]; suffix: string; key: string; line: string }[] = [];
  for (const p of hs.per) {
    const suffix = isSidewalkTruckCase(p.g) ? " (trucks on sidewalk)" : "";
    const line = `DF ${num(p.df, 3)}; inventory ${num(p.inv.inv, 3)}, ${checkName(p.inv.check)} at ${num(p.inv.x, 2)} ft; operating ${num(p.opr.opr!, 3)}, ${checkName(p.opr.check)} at ${num(p.opr.x, 2)} ft`;
    const row = rows.find((q) => q.key === suffix + line);
    if (row) row.names.push(p.g.replace(suffix, ""));
    else rows.push({ names: [p.g.replace(suffix, "")], suffix, key: suffix + line, line });
  }
  if (figures?.girders) lines.push({ region: figures.girders });
  else for (const q of rows) text(`• ${q.names.join(", ")}${q.suffix}: ${q.line}`);
  if (figures?.section) lines.push({ region: figures.section });
  text(COLOR_NOTE, "note");

  // 1. Materials
  // The calculations start a page.
  text("1. Materials", "subheading", true);
  m(`f'_{c}\\coloneq ${num(mt.fc)}\\mathrm{ksi}`, "Girder concrete");
  if (altFc)
    text(
      `Girder concrete:- No plans give it. ${mt.fc === 6 ? "6 ksi is the strength of CDOT's double-tee standard (CDOH, rev. 3-1-82)." : `${num(mt.fc)} ksi is assumed.`} The MBE default for unknown prestressed concrete is ${num(mbeFc)} ksi (Table 6B.5.2.4-1: 3.0 ksi for 1959 and later, increased 25%); with it the HS-20 inventory rating would be ${num(hsInvOf(altFc), 3)}, against ${num(hs.govInv.inv.inv, 3)} here${hsInvOf(altFc) > hs.govInv.inv.inv ? `, so ${num(mt.fc)} ksi is the conservative choice` : ""}.`,
      "note",
    );
  m("E_c\\coloneq33000\\cdot0.145^{1.5}\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}=", "Girder modulus, with 145 pcf (SSHB 8.7.1)", "ksi");
  if (deck) {
    m(`f'_{cd}\\coloneq ${num(deck.fc)}\\mathrm{ksi}`, "Deck concrete");
    m("n_d\\coloneq\\sqrt{\\frac{f'_{cd}}{f'_{c}}}=", "Modular ratio of the deck to the girder");
  }
  m(`f'_{s}\\coloneq ${num(mt.fpu)}\\mathrm{ksi}`, back && !mt.lowRelaxation ? `${mt.strand}: tensile strength by year built (MBE Table 6A.5.2.3-1); stress-relieved before December 1983 (BRM 9A-1 I.F)` : mt.strand);
  m(`a_{ps}\\coloneq ${num(mt.aps)}\\mathrm{in}^{2}`, "Area of one strand");
  m(`R_j\\coloneq ${num(mt.jackingRatio)}`, "Jacking stress ratio");
  m("f_{pj}\\coloneq R_j\\cdot f'_{s}=", "Jacking stress", "ksi");
  const ls = s.losses;
  if (ls) {
    text(`Losses:- Item by item (SSHB 9.16.2.1), on the typical interior unit at midspan, the section of maximum moment, with the strands ${back ? "back-calculated in section 7" : "given in section 2"}.`, "note");
    m(`RH\\coloneq ${num(ls.RH)}`, "Mean annual relative humidity, % (SSHB Figure 9.16.2.1.1)");
    m("\\Delta_{SH}\\coloneq\\left(17-0.150\\cdot RH\\right)\\cdot\\mathrm{ksi}=", "Shrinkage (Eq. 9-4)", "ksi");
    given(`E_{ci}\\coloneq ${num(ls.Eci, 8)}\\mathrm{ksi}`, `Concrete modulus at transfer, 33w^1.5√f′ci with w = 145 pcf (normal-weight concrete, as for Ec) and f′ci = ${num(mt.fci)} ksi`);
    psi("f_{cir}", ls.fcir,`At the strands just after transfer: ${num(ls.Pi, 4)} kip (${mt.lowRelaxation ? "0.69" : "0.63"} f′s in proportion to the jacking stress, as the article allows) and the unit's weight, ${num(ls.Mg, 4)} kip·ft`);
    m("\\Delta_{ES}\\coloneq\\frac{28000\\mathrm{ksi}}{E_{ci}}\\cdot f_{cir}=", "Elastic shortening (Eq. 9-6), Es = 28,000 ksi", "ksi");
    psi("f_{cds}", ls.fcds,"At the strands, from the dead loads added after transfer");
    m("\\Delta_{CR}\\coloneq\\max\\left(12\\cdot f_{cir}-7\\cdot f_{cds},0\\mathrm{ksi}\\right)=", "Creep (Eq. 9-9)", "ksi");
    if (mt.lowRelaxation) m("\\Delta_{R}\\coloneq\\max\\left(5\\mathrm{ksi}-0.10\\cdot\\Delta_{ES}-0.05\\cdot\\left(\\Delta_{SH}+\\Delta_{CR}\\right),0\\mathrm{ksi}\\right)=", "Relaxation, low-relaxation strand (Eq. 9-10A)", "ksi");
    else m("\\Delta_{R}\\coloneq\\max\\left(20\\mathrm{ksi}-0.4\\cdot\\Delta_{ES}-0.2\\cdot\\left(\\Delta_{SH}+\\Delta_{CR}\\right),0\\mathrm{ksi}\\right)=", "Relaxation, stress-relieved strand (Eq. 9-10)", "ksi");
    m("\\Delta_{fs}\\coloneq\\Delta_{SH}+\\Delta_{ES}+\\Delta_{CR}+\\Delta_{R}=", "Total losses (Eq. 9-3)", "ksi");
  } else m(`\\Delta_{fs}\\coloneq ${num(i.options.lossLumpSum)}\\mathrm{ksi}`, "Losses, lump sum (SSHB 9.16.2.2)");
  m("f_{se}\\coloneq f_{pj}-\\Delta_{fs}=", "Effective prestress", "ksi");
  if (s.fsuValid) m(ok("0.5\\cdot f'_{s}", "f_{se}"), "The effective prestress is at least 0.5 f′s, so Eq. 9-17 for f*su applies (SSHB 9.17.4.1)");
  else text(`The effective prestress, ${num(s.fse, 1)} ksi, is below 0.5 f′s = ${num(0.5 * mt.fpu, 1)} ksi, so Eq. 9-17 alone doesn't give f*su (SSHB 9.17.4.1): it is checked by strain compatibility in section 3.`, "note");
  m(`f_{ys}\\coloneq${mt.lowRelaxation ? "0.90" : "0.85"}\\cdot f'_{s}=`, mt.lowRelaxation ? "Strand yield stress, low relaxation" : "Strand yield stress, stress-relieved", "ksi");
  m("E_p\\coloneq28500\\mathrm{ksi}", "Strand modulus, AASHTO LRFD 5.4.4.2 (SSHB 9.16.2.1.2: 28,000 ksi)");

  // 2. Section and prestressing steel
  text(`2. ${g.name}: section and prestressing steel`, "subheading");
  given(`A_g\\coloneq ${num(g.sec.A, 9)}\\mathrm{in}^{2}`, "Area of the precast section");
  given(`y_b\\coloneq ${num(g.sec.yb, 9)}\\mathrm{in}`, "Centroid above the bottom");
  given(`I_g\\coloneq ${num(g.sec.I, 6)}\\mathrm{in}^{4}`, "Moment of inertia");
  m("S_b\\coloneq\\frac{I_g}{y_b}=", "Section modulus, bottom", "in^3");
  m(`S_t\\coloneq\\frac{I_g}{${num(i.units.depth)}\\mathrm{in}-y_b}=`, "Section modulus, top", "in^3");
  if (g.csec) {
    given(`y_{bc}\\coloneq ${num(g.csec.yb, 9)}\\mathrm{in}`, "Composite centroid above the bottom, with the deck transformed by n_d");
    given(`I_c\\coloneq ${num(g.csec.I, 6)}\\mathrm{in}^{4}`, "Composite moment of inertia");
    m("S_{bc}\\coloneq\\frac{I_c}{y_{bc}}=", "Composite section modulus, bottom", "in^3");
    m(`S_{tc}\\coloneq\\frac{I_c}{${num(i.units.depth)}\\mathrm{in}-y_{bc}}=`, "Composite section modulus, top of the girder", "in^3");
  }
  if (back)
    m(
      `N_s\\coloneq ${num(s.nStrands, 9)}`,
      `Strands per unit, back-calculated in section 7${i.options.roundStrands ? ` and rounded up to a whole strand (${num(s.nExact, 3)} exactly); the jacking force is rounded down to the nearest kip` : ", unrounded"}${s.crackGoverns ? ". The cracking moment governs (BRM 1.7.2)" : ""}`,
    );
  else m(`N_s\\coloneq ${num(s.nStrands, 9)}`, i.prestress.harp ? "Strands per unit, from the standard plans (Dwg. B-3)" : "Strands per unit");
  m("A_{ps}\\coloneq N_s\\cdot a_{ps}=", "Prestressing steel", "in^2");
  const hp = !back && i.prestress.harp ? i.prestress.harp : null;
  if (hp) {
    const rr = Math.min(x, L - x) / (hp.at * L);
    const cgx = rr >= 1 ? hp.mid : hp.end + (hp.mid - hp.end) * rr;
    m(`y_{ps}\\coloneq ${num(cgx, 9)}\\mathrm{in}`, `Strand centroid above the bottom at x = ${num(x, 2)} ft: harped from ${num(hp.end)} in at the ends to ${num(hp.mid)} in from 0.4 span (standard plans, Dwg. B-7)`);
  } else {
    cgRows("y_{ps}", s.nStrands, `Strand centroid above the bottom (assumed): rows of ${mt.strandsPerRowPerStem * 2} strands, the first at ${num(mt.firstRow)}", then every ${num(mt.rowSpacing)}", filled row by row from the bottom`);
    if (back) {
      // The CDOH (now CDOT) Double-T Standard (rev. 3-1-82), Dwg. B-3: 34.5–45 in units on 36–66 ft spans.
      const d = i.units.depth, yr = i.bridge.yearBuilt;
      const stdCheck = checkStandard(i);
      const outRange = yr < 1982 || d < 34.5 || d > 45 || L < 36 || L > 66;
      const why = stdCheck.applies
        ? ""
        : outRange
          ? `, and the CDOH Double-T Standard (rev. 3-1-82) does not cover this bridge built in ${yr} with ${num(d)}" deep units on a ${Math.round(L)} ft span, against the standard's 34.5–45" units on 36–66 ft spans`
          : `, and the bridge does not match the CDOH Double-T Standard (rev. 3-1-82): ${stdCheck.items.filter((q) => !q.ok).map((q) => `${q.label.toLowerCase()} ${q.bridge} (the standard's: ${q.standard})`).join("; ")}`;
      text(
        `Strand location:- No plans or shop drawings exist${why}. The strands are taken as straight and placed in a grid filling the stems from the bottom: ${num(mt.strandsPerRowPerStem)} strands per row per stem, the first row ${num(mt.firstRow)} in above the bottom, rows at ${num(mt.rowSpacing)} in. For ${num(s.nStrands, 9)} strands this gives a centroid of ${num(s.cg, 3)} in.`,
        "note",
      );
    }
  }
  m(
    back && i.options.roundStrands ? "P_j\\coloneq\\operatorname{floor}\\left(\\frac{f_{pj}\\cdot A_{ps}}{\\mathrm{kip}}\\right)\\cdot\\mathrm{kip}=" : "P_j\\coloneq f_{pj}\\cdot A_{ps}=",
    "Jacking force (BRM 1.7.2)",
    "kip",
  );
  m("P_e\\coloneq f_{se}\\cdot A_{ps}=", "Effective force", "kip");
  m("e\\coloneq y_b-y_{ps}=", "Eccentricity", "in");

  // 3. Flexural strength
  text("3. Flexural strength (SSHB 9.17)", "subheading");
  const cap = s.cap;
  const hf = i.units.flangeThk + (deck ? deck.thk : 0);
  m(`d\\coloneq ${num(i.units.depth + (deck ? deck.thk : 0))}\\mathrm{in}-y_{ps}=`, "Depth to the strands", "in");
  m(`b\\coloneq ${num(g.sec.bf, 9)}\\mathrm{in}`, "Flange width");
  m(`h_f\\coloneq ${num(hf)}\\mathrm{in}`, deck ? "Flange and deck" : "Flange");
  m(`f'_{cf}\\coloneq ${num(deck ? deck.fc : mt.fc)}\\mathrm{ksi}`, deck ? "Concrete of the compression flange (deck)" : "Concrete of the compression flange");
  m("\\beta_1\\coloneq\\max\\left(0.65,\\min\\left(0.85,0.85-0.05\\cdot\\left(\\frac{f'_{cf}}{\\mathrm{ksi}}-4\\right)\\right)\\right)=", "SSHB 8.16.2.7");
  m(`\\gamma_{p}\\coloneq ${num(mt.gammaStar)}`, "SSHB 9.17.4");
  m("\\rho_{p}\\coloneq\\frac{A_{ps}}{b\\cdot d}=");
  if (s.fsuValid) m("f_{su}\\coloneq f'_{s}\\cdot\\left(1-\\frac{\\gamma_{p}}{\\beta_1}\\cdot\\frac{\\rho_{p}\\cdot f'_{s}}{f'_{cf}}\\right)=", "SSHB Eq. 9-17", "ksi");
  else {
    const fcF = deck ? deck.fc : mt.fc;
    const sc = strainCompat(s.As, g.sec, i.units.depth + (deck ? deck.thk : 0) - s.cg, mt, hf, fcF, s.fse, Ec(mt.fc), s.cg);
    text("Strain compatibility:- At ultimate the strands carry the strain of the effective prestress, plus the concrete's decompression at the strands, plus the flexural strain from the concrete crushing at 0.003; the neutral axis is where the stress block balances the strands at the stress their stress-strain curve gives for that strain.", "note");
    m("\\varepsilon_1\\coloneq\\frac{f_{se}}{28500\\mathrm{ksi}}=", "Strain of the effective prestress");
    given(`\\varepsilon_2\\coloneq ${num(sc.e2, 8)}`, "Decompression of the concrete at the strands, (Pe/(A·Ec))(1 + e²/r²)");
    given(`c_{sc}\\coloneq ${num(sc.c, 8)}\\mathrm{in}`, "Neutral axis, where the stress block (0.85f′c, a = β1c) balances the strands (solved)");
    m("\\varepsilon_3\\coloneq\\frac{0.003\\cdot\\left(d-c_{sc}\\right)}{c_{sc}}=", "Flexural strain at the strands");
    m("\\varepsilon_{ps}\\coloneq\\varepsilon_1+\\varepsilon_2+\\varepsilon_3=", "Strand strain at ultimate");
    given(
      `f_{ps}\\coloneq ${num(sc.fps, 8)}\\mathrm{ksi}`,
      mt.fpu >= 260 ? "From the strand's stress-strain curve, 270 − 0.04/(ε − 0.007) ksi above ε = 0.0086 (PCI Design Handbook, ASTM A416 strand)" : `From the strand's stress-strain curve, ${mt.fpu === 250 ? "" : `${num(mt.fpu / 250, 3)} × `}(250 − 0.04/(ε − 0.0064)) ksi above ε = 0.0076 (PCI Design Handbook, ASTM A416 strand)`,
    );
    m("f_{su}\\coloneq\\min\\left(f'_{s}\\cdot\\left(1-\\frac{\\gamma_{p}}{\\beta_1}\\cdot\\frac{\\rho_{p}\\cdot f'_{s}}{f'_{cf}}\\right),f_{ps}\\right)=", sc.fps >= s.cap.fsuEq - 1e-6 ? "Eq. 9-17, which strain compatibility confirms: the strands reach more than it gives" : "Limited to the strain-compatibility stress, below Eq. 9-17's", "ksi");
  }
  m("a_{c}\\coloneq\\frac{1.4\\cdot d\\cdot\\rho_{p}\\cdot f_{su}}{f'_{cf}}=", "Depth of the stress block", "in");
  m(ok("a_{c}", "h_f"), "Rectangular section behavior (SSHB 9.17.2)");
  const flexMid = r.midspan[0].per.find((p) => p.g === g.name)!;
  // The section's Mn at x; minimum steel (MBE 6B.5.3.3) scales it by k in the rating factors below.
  const kpt = hsFlex.flexInv.k;
  const Mnx = kpt ? hsFlex.flexInv.C / kpt.inv : hsFlex.flexInv.C;
  const damage = r.condition.damageOf(g.name, x);
  const damagedHere = !!damage;
  const developed = Math.abs(Mnx - flexMid.C0) < 1e-6 * Math.max(1, flexMid.C0);
  if (cap.type === "rectangular" && !cap.overReinforced)
    m("M_n\\coloneq A_{ps}\\cdot f_{su}\\cdot d\\cdot\\left(1-0.6\\cdot\\frac{\\rho_{p}\\cdot f_{su}}{f'_{cf}}\\right)=", `SSHB Eq. 9-13; φ = 1.0 for prestressed concrete${damagedHere ? "; intact" : ""}`, "kip*ft");
  else given(`M_n\\coloneq ${num(flexMid.C0, 9)}${kft}`, cap.overReinforced ? "Limited to the maximum steel (SSHB 9.18.1)" : "Flanged section, SSHB Eq. 9-14");
  if (damagedHere) {
    const cu = i.condition.units.find((c) => c.unit === g.i)!;
    const parts = [
      cu.lostStrands > 0 && `${num(cu.lostStrands)} strand${cu.lostStrands === 1 ? "" : "s"} broken or missing`,
      cu.corrodedStrands > 0 && cu.areaLoss > 0 && `${num(cu.corrodedStrands)} exposed with ${num(cu.areaLoss)}% section loss`,
      cu.topLoss > 0 && `${num(cu.topLoss)} in lost from the top`,
      cu.factor < 1 && `a judgment factor of ${num(cu.factor)}`,
    ].filter(Boolean);
    given(`M_{nx}\\coloneq ${num(Mnx, 9)}${kft}`, `As inspected at x = ${num(x, 2)} ft (MBE 6.1.2): ${parts.join(", ")}${cu.zone ? `, from ${num(cu.zone.from, 2)} to ${num(cu.zone.to, 2)} ft` : ""}. The remaining section's strength, from the same equations`);
  } else if (!developed) given(`M_{nx}\\coloneq ${num(Mnx, 9)}${kft}`, `The strands are not fully developed at x = ${num(x, 2)} ft, so f*su is reduced (SSHB 9.28.1: development length 1.6(f*su − ⅔fse)D, 17th Edition errata)`);
  else m("M_{nx}\\coloneq M_n=", `The strands are fully developed at x = ${num(x, 2)} ft`, "kip*ft");

  // 4. Stress limits
  text("4. Stress limits (MBE 6B.5.3.3)", "subheading");
  if (tensionIgnored(i)) {
    text("Final tension in the girder: not rated. The prestress is back-calculated for strength (BRM 1.7.2), so the final tension limit is ignored in the rating; the tension at 6√f′c is shown for information.", "note");
    m("f_t\\coloneq\\frac{6}{1000}\\cdot\\sqrt{1000\\cdot\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}=", "Final tension, 6√f′c psi (SSHB 9.15.2.2), for information", "ksi");
  } else if (i.options.tensionLimit === null) m("f_t\\coloneq\\frac{6}{1000}\\cdot\\sqrt{1000\\cdot\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}=", "Final tension, 6√f′c psi (SSHB 9.15.2.2)", "ksi");
  else m(`f_t\\coloneq ${num(i.options.tensionLimit)}\\mathrm{ksi}`, i.options.tensionLimit === 1 && back ? TENSION_NOTE : "Final tension, as entered (SSHB 9.15.2.2)");
  m("f_{c1}\\coloneq0.6\\cdot f'_{c}=", "Compression under all loads", "ksi");
  m("f_{c2}\\coloneq0.4\\cdot f'_{c}=", "Compression under live load plus half the prestress and dead load", "ksi");
  if (deck) m("f_{cd}\\coloneq0.4\\cdot f'_{cd}=", "Deck compression (SSHB 9.15.2.2)", "ksi");
  m("f_{s,inv}\\coloneq0.8\\cdot f_{ys}=", "Strand stress, inventory", "ksi");
  m("f_{s,opr}\\coloneq0.9\\cdot f_{ys}=", "Strand stress, operating", "ksi");

  // 5. Dead loads
  text(`5. Dead loads on ${g.name}`, "subheading");
  m(`L\\coloneq ${num(L, 9)}\\mathrm{ft}`, "Span, bearing to bearing");
  m(`x\\coloneq ${num(x, 9)}\\mathrm{ft}`, "Point rated, from the left bearing");
  const dl = g.dlNow;
  plf(
    "w_{DC1}",
    dl.dc1,
    deck
      ? `Self-weight of the unit (${num(dl.self)} klf at ${num(i.loads.concPcf)} pcf${i.loads.concPcf === 163 ? ", reinforced precast concrete, BRM Table 1-1" : ""}) plus the deck it carries (${num(dl.deck)} klf), carried by the precast section`
      : `Self-weight of the unit, at ${num(i.loads.concPcf)} pcf${i.loads.concPcf === 163 ? " (reinforced precast concrete, BRM Table 1-1)" : ""}`,
  );
  plf(
    "w_{DC2}",
    dl.dc2,
    `Asphalt ${num(dl.asphalt)} klf, rail ${num(dl.rail)} klf, utilities ${num(dl.util)} klf${dl.sidewalk ? `, ${i.loads.sidewalks.every((s) => s.curb) ? "curbs" : i.loads.sidewalks.some((s) => s.curb) ? "sidewalks and curbs" : "sidewalks"} ${num(dl.sidewalk)} klf` : ""}${deck ? "; shared equally by all girders and carried by the composite section" : "; carried by the unit beneath them"}`,
  );
  m(`P_{dia}\\coloneq ${num(dl.diaph)}\\mathrm{kip}`, "Diaphragm load at midspan");
  m("M_{D1}\\coloneq\\frac{w_{DC1}\\cdot x\\cdot\\left(L-x\\right)}{2}+\\frac{P_{dia}\\cdot\\min\\left(x,L-x\\right)}{2}=", undefined, "kip*ft");
  m("M_{D2}\\coloneq\\frac{w_{DC2}\\cdot x\\cdot\\left(L-x\\right)}{2}=", undefined, "kip*ft");
  m("M_D\\coloneq M_{D1}+M_{D2}=", "Dead load moment", "kip*ft");
  if (g.pedKlf > 0) {
    plf("w_{ped}", g.pedKlf,`Pedestrian load: ${num(r.ped.pedPsf)} psf on ${num(r.ped.pedWidth, 2)} ft of sidewalk, shared by ${i.units.count} units (SSHB 3.14.1.1)`);
    m("M_{ped}\\coloneq\\frac{w_{ped}\\cdot x\\cdot\\left(L-x\\right)}{2}=", undefined, "kip*ft");
  } else m(`M_{ped}\\coloneq0${kft}`, sw.length ? (i.loads.pedestrians ? "No pedestrian load in this case (trucks on the sidewalk)" : "No pedestrian load") : "No sidewalk");

  // 6. Distribution factors
  text("6. Live load distribution (SSHB 3.23)", "subheading");
  if (r.condition.alone) {
    text(
      `The joints have failed (${i.condition.jointsNote.trim() || "from the inspection"}), so each unit carries the wheels that fit on it: the lever rule with a hinge at every joint, wheels 6 ft apart in a truck and 4 ft between trucks, 2 ft from the ${g.caseName.startsWith("trucks on") ? "rail" : r.ped.sidewalks.length ? "curb" : "rail"} faces; a wheel on a joint counts half to each unit. The original design's factors (${num(g.dfMultiDesign, 3)} for two or more lanes, ${num(g.dfSingleDesign, 3)} for one) set the prestress.`,
    );
    given(`DF_{m}\\coloneq ${num(g.dfMulti, 10)}`, `${g.name}, two or more lanes, as inspected`);
    given(`DF_{s}\\coloneq ${num(g.dfSingle, 10)}`, "One lane, as inspected");
  } else if (i.options.dfOverride) given(`DF_{m}\\coloneq ${num(g.dfMulti, 10)}`, "Two or more lanes, as entered");
  else if (!g.ext && g.lever && (g.lever.multi || g.lever.single)) {
    const why = r.df.int.outOfRange ? `S/D applies only up to √(I/J) = 5.0 and a skew of 45° (SSHB 3.23.4.3); here ${r.df.int.outOfRange}` : `Table 3.23.1 applies to prestressed girders up to S = 14 ft with two or more lanes and 10 ft with one (its footnote f); here S = ${num(g.S, 2)} ft`;
    text(`${why}. Outside the formulas' range the lever rule is used (BRM 1.3(E)): the deck hinged at the units on each side, wheels 6 ft apart and trucks 12 ft center to center (BRM 1.3(F)), placed for the largest reaction.`, "note");
    given(`DF_{m}\\coloneq ${num(g.dfMulti, 10)}`, g.lever.multi ? "Interior, two or more lanes, lever rule" : "Interior, two or more lanes, S/5.5 (SSHB Table 3.23.1)");
    given(`DF_{s}\\coloneq ${num(g.dfSingle, 10)}`, g.lever.single ? "Interior, one lane, lever rule" : "Interior, one lane, S/7.0");
  } else if (!g.ext && interiorMethod(i) === "table") {
    if (deck) text("Under the composite deck the units are prestressed girders carrying a slab, so the interior factors are those of SSHB Table 3.23.1.", "note");
    m(`S\\coloneq ${num(g.S, 10)}\\mathrm{ft}`, "Girder spacing");
    m("DF_{m}\\coloneq\\frac{S}{5.5\\mathrm{ft}}=", "Interior, two or more lanes (SSHB Table 3.23.1)");
    m("DF_{s}\\coloneq\\frac{S}{7.0\\mathrm{ft}}=", "Interior, one lane");
  } else if (!g.ext && r.df.int.method === "sd") {
    if (!deck) text("Without a composite deck the units sit side by side with their flanges as the deck, joined at the shear keys: a multi-beam deck, distributed by S/D (SSHB 3.23.4.3). K measures the units' stiffness in bending against twisting.", "note");
    const sec = r.secInt;
    m(`S\\coloneq ${num(g.S, 10)}\\mathrm{ft}`, "Width of the unit (center to center)");
    m(`N_L\\coloneq ${r.geo.NL}`, `Design lanes on the ${num(roadwayWidth(i), 2)} ft roadway between the curbs (SSHB 3.6.2, 3.6.3: 12 ft lanes, two from 20 to 24 ft)`);
    m(`W\\coloneq ${num(r.geo.roadW, 10)}\\mathrm{ft}`, "Overall width of the bridge");
    m(`K\\coloneq\\sqrt{\\frac{1.2\\cdot ${num(sec.I, 8)}\\mathrm{in}^{4}}{${num(sec.J, 8)}\\mathrm{in}^{4}}}=`, "K = √((1 + μ) I/J), μ = 0.2. J, the St. Venant torsion constant, is solved on the unit's shape (flange, tapered stems and their junctions) by finite elements, since it has no exact formula for a double tee");
    m("C\\coloneq K\\cdot\\min\\left(\\frac{W}{L},1\\right)=", "SSHB 3.23.4.3");
    m("D_m\\coloneq\\left(5.75-0.5\\cdot N_L+0.7\\cdot N_L\\cdot\\left(1-0.2\\cdot C\\right)^{2}\\right)\\cdot\\mathrm{ft}=", "With the bridge's design lanes", "ft");
    m("DF_{m}\\coloneq\\min\\left(\\frac{S}{D_m},1\\right)=", "Interior; the load fraction need not be greater than 1 (SSHB 3.23.4.3)");
    m("DF_{s}\\coloneq DF_{m}=", "The legal and permit vehicles too: SSHB 3.23.4.3 gives one fraction for multi-beam decks, with NL the bridge's design lanes, whatever the lanes loaded");
    if (r.df.int.rootIJ !== null) text(`√(I/J) = ${num(r.df.int.rootIJ, 2)}, within S/D's limit of 5.0, and the skew, ${num(i.skew)}°, within 45° (SSHB 3.23.4.3).`, "note");
  } else {
    given(
      `DF_{m}\\coloneq ${num(g.dfMulti, 10)}`,
      g.ext ? `Exterior, by the lever rule, with the wheel 2 ft from the ${g.caseName.startsWith("trucks on") ? "rail" : r.ped.sidewalks.length ? "curb" : "rail"} face and trucks 12 ft center to center (BRM 1.3(F))` : "Interior, multi-beam S/D (SSHB 3.23.4.3)",
    );
    given(`DF_{s}\\coloneq ${num(g.dfSingle, 10)}`, "One lane");
  }
  if (i.options.dfOverride && !r.condition.alone) given(`DF_{s}\\coloneq ${num(g.dfSingle, 10)}`, "One lane, as entered");
  const gTyp = r.girders.find((q) => !q.ext && q.i === r.geo.iTyp + 1);
  if (gTyp) eraDistribution(i, r, gTyp, m, text);
  const stems = stemCheck(i, r);
  if (stems) text(stems, "note");
  m("I_m\\coloneq\\min\\left(\\frac{50}{\\frac{L}{\\mathrm{ft}}+125},0.30\\right)=", "Impact (SSHB 3.8.2.1)");

  // The HS-20 moment at x, shared by the back-calculation and the rating.
  const llHS = hsFlex.flexInv.LL / (hsFlex.df * (1 + r.impact));
  const wheelHS = () => given(`M_{w,HS}\\coloneq ${num(llHS, 9)}${kft}`, `HS-20 moment per wheel line at x, from the truck or the lane load, whichever is greater (SSHB 3.7)`);
  const P_at = Math.min(1, (Math.min(x, L - x) + r.ext) / r.lt);
  const left = damage && damage.lostArea > 0 ? 1 - damage.lostArea / s.As : 1;
  const prestressAtX = () => {
    if (left < 1) m(`P_x\\coloneq ${num(P_at * left, 10)}\\cdot P_e=`, `The strands left at x (${num(left * 100, 1)}% of the area, as inspected)${P_at < 1 ? ", within the transfer length (SSHB 9.20.2.4)" : ""}`, "kip");
    else if (P_at < 1) m(`P_x\\coloneq ${num(P_at, 10)}\\cdot P_e=`, "Prestress reduced within the transfer length of 50 strand diameters (SSHB 9.20.2.4)", "kip");
    else m("P_x\\coloneq P_e=", "Full prestress: x is beyond the transfer length", "kip");
  };
  const Sb2 = g.csec ? "S_{bc}" : "S_b";
  const St2 = g.csec ? "S_{tc}" : "S_t";
  let pxShown = false;

  // 7. Back-calculation of the prestress: the original design, under its own loads.
  if (back) {
    text("7. Back-calculation of the prestress: original design (BRM 1.7.2(A))", "subheading");
    const sidewalkCase = isSidewalkTruckCase(g.name);
    const asInspected = damagedHere || r.condition.alone;
    // What the original design had that the existing bridge's rating doesn't: no later overlay; its era's distribution.
    const wAdded = g.dlNow.dc1 + g.dlNow.dc2 - (g.dlSolve.dc1 + g.dlSolve.dc2);
    const overlayOut = wAdded > 1e-9;
    const eraDf = Math.abs(g.dfSolve - g.dfMulti) > 1e-9;
    text(
      `The strands are not known, so they are found from the original design: the fewest whole strands that meet every condition of a ${i.bridge.yearBuilt} design of these girders${overlayOut || eraDf ? `, under its own loads (${[overlayOut && "without the asphalt, an overlay added later", eraDf && "with its era's distribution"].filter(Boolean).join("; ")})` : ""}, with trucks between the curbs. Every girder is checked at every point; ${s.gov} governs. The working below is for ${g.name} at x = ${num(x, 2)} ft.`,
    );
    wheelHS();
    if (overlayOut) {
      plf("w_{AS}", wAdded,"Asphalt, added after the design (in w_DC2, section 5)");
      m("M_{D2,0}\\coloneq M_{D2}-\\frac{w_{AS}\\cdot x\\cdot\\left(L-x\\right)}{2}=", "Superimposed dead load of the original design", "kip*ft");
    } else m("M_{D2,0}\\coloneq M_{D2}=", "Superimposed dead load of the original design", "kip*ft");
    m("M_{D,0}\\coloneq M_{D1}+M_{D2,0}=", "Dead load moment of the original design", "kip*ft");
    if (eraDf) given(`DF_{m,0}\\coloneq ${num(g.dfSolve, 10)}`, "The original design's distribution factor (section 6)");
    else m("DF_{m,0}\\coloneq DF_{m}=", "The same distribution factor as the existing bridge's");
    m("M_{L,0}\\coloneq M_{w,HS}\\cdot DF_{m,0}\\cdot\\left(1+I_m\\right)=", "Design live load moment", "kip*ft");
    // Strength under the design's loads.
    m("RF_{0}\\coloneq\\frac{M_{nx}-1.3\\cdot M_{D,0}-2.17\\cdot M_{ped}}{2.17\\cdot M_{L,0}}=", "Strength: HS-20 inventory rating under the design's loads (MBE Eq. 6B.4.1-1)");
    const md0 = ((g.dlSolve.dc1 + g.dlSolve.dc2) * x * (L - x)) / 2 + (g.dlSolve.diaph * Math.min(x, L - x)) / 2;
    const rf0 = (Mnx - 1.3 * md0 - (2.17 * g.pedKlf * x * (L - x)) / 2) / (2.17 * llHS * g.dfSolve * (1 + r.impact));
    if (!sidewalkCase && !asInspected && rf0 >= 1 - 1e-6) m(ok("1", "RF_{0}"), "At least 1.0 (BRM 1.7.2(A))");
    // The design's service tension (the design's own limit), when the solve uses it.
    if (i.options.solveForService) {
      prestressAtX();
      pxShown = true;
      m("f_{t0}\\coloneq\\frac{6\\cdot\\sqrt{1000\\cdot\\frac{f'_{c}}{\\mathrm{ksi}}}}{1000}\\cdot\\mathrm{ksi}=", "The design's tension limit, 6√f′c psi (SSHB 9.15.2.2; 1973 Art. 1.6.6(B)(2))", "ksi");
      m(`f_{b0}\\coloneq-\\frac{P_x}{A_g}-\\frac{P_x\\cdot e}{S_b}+\\frac{M_{D1}}{S_b}+\\frac{M_{D2,0}+M_{ped}+M_{L,0}}{${Sb2}}=`, "Bottom stress under the design's loads (tension positive)", "ksi");
      if (s.serviceMet && !asInspected) m(ok("f_{b0}", "f_{t0}"), "Within the design's tension limit");
    }
    // BRM 1.7.2: the steel for the greater of the factored moment and the cracking moment, girder by girder.
    const cr = r.crack.find((c) => c.g === g.name)!;
    m("f_r\\coloneq0.24\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}=", "Modulus of rupture, AASHTO LRFD 5.4.2.6 (SSHB 9.15.2.3: 7.5√f′c psi)", "ksi");
    m(`M_{cr}\\coloneq f_r\\cdot ${g.csec ? "S_{bc}" : "S_b"}=`, `Cracking moment of ${g.name}, ${g.csec ? "composite" : "precast"} section`, "kip*ft");
    given(`M_u\\coloneq ${num(cr.MuReq, 6)}${kft}`, `Factored moment of ${g.name} at midspan, 1.3·MD + 2.17·(ML(1 + I) + Mped), using the largest ${designVehicleName(r.original.vehicle)} moment`);
    m(
      ok("M_{cr}", "M_u"),
      s.crackGoverns ? "On at least one girder the cracking moment governs and sets the prestressing steel (BRM 1.7.2)" : "The factored moment exceeds the cracking moment on every girder, so it governs (BRM 1.7.2)",
    );
    // Minimum steel (SSHB 9.18.2.1): M*cr with the prestress and the staged dead load, at midspan.
    if (i.options.minSteel12 && g.csec && !sidewalkCase && !asInspected) {
      const Mdnc = (g.dlSolve.dc1 * (L / 2) * (L / 2)) / 2 + (g.dlSolve.diaph * (L / 2)) / 2;
      m("f_{rs}\\coloneq\\frac{7.5\\cdot\\sqrt{1000\\cdot\\frac{f'_{c}}{\\mathrm{ksi}}}}{1000}\\cdot\\mathrm{ksi}=", "Modulus of rupture, 7.5√f′c psi (SSHB 9.15.2.3)", "ksi");
      m("f_{pe}\\coloneq\\frac{P_e}{A_g}+\\frac{P_e\\cdot e}{S_b}=", "Compression at the bottom from the effective prestress, at midspan", "ksi");
      given(`M_{dnc}\\coloneq ${num(Mdnc, 9)}${kft}`, "Dead load on the precast section alone at midspan (the unit and the deck placed on it)");
      m("M_{crm}\\coloneq\\left(f_{rs}+f_{pe}\\right)\\cdot S_{bc}-M_{dnc}\\cdot\\left(\\frac{S_{bc}}{S_b}-1\\right)=", "Cracking moment of the composite section (SSHB 9.18.2.1)", "kip*ft");
      m(ok("\\min\\left(1.2\\cdot M_{crm},1.33\\cdot M_u\\right)", "M_n"), "Minimum steel: φMn at least 1.2 M*cr, or 1.33 times the factored moment (SSHB 9.18.2.1, 9.18.2.2), φ = 1.0");
    }
    const what = { strength: "strength flexure", cracking: "the cracking moment (BRM 1.7.2)", tension: "the design's service tension", "min-steel": "minimum steel" }[s.governs];
    const parts = [
      i.options.solveForService &&
        (s.serviceMet
          ? `the bottom tension under the design vehicle stays within 6√f′c at every point`
          : `the design's service tension, 6√f′c at the bottom (SSHB 9.15.2.2), can't be met before the strands fill the lower half of the stems; the strands are those the other conditions need, and the tension rating in section 9 shows the shortfall`),
      i.options.minSteel12 && (s.minSteelMet ? "φMn reaches 1.2 M*cr, or 1.33 times the factored moment (SSHB 9.18.2.1, 9.18.2.2; 1973 Art. 1.6.10(B))" : "minimum steel (1.2 M*cr, SSHB 9.18.2.1) can't be met before the stems fill"),
    ].filter(Boolean);
    // One strand fewer: the same checks at the same point, worked out, to show the count is the fewest.
    const nF = Math.round(s.nStrands) - 1;
    const rF = s.nStrands > 1 && i.options.roundStrands ? rateDoubleTee({ ...i, prestress: { ...i.prestress, mode: "known", strands: nF, harp: null } }) : null;
    const fewer = rF ? rF.solve.govRF : null;
    const fewerBlock = (() => {
      if (!rF || sidewalkCase || asInspected) return null;
      const AsF = nF * mt.aps;
      const cgF = strandCG(AsF, mt);
      const fseF = rF.solve.fse;
      const Dtot = i.units.depth + (deck ? deck.thk : 0);
      const dF = Dtot - cgF;
      const fcF = deck ? deck.fc : mt.fc;
      const b1 = Math.max(0.65, Math.min(0.85, 0.85 - 0.05 * (fcF - 4)));
      const rho = AsF / (g.sec.bf * dF);
      const fsu = mt.fpu * (1 - (mt.gammaStar / b1) * ((rho * mt.fpu) / fcF));
      // Eq. 9-17 and the rectangular section (9-13) hold for these strands, as for the solved ones.
      const rect = fseF >= 0.5 * mt.fpu && (1.4 * dF * rho * fsu) / fcF <= hf + 1e-9 && s.fsuValid && cap.type === "rectangular" && !cap.overReinforced;
      if (!rect) return null;
      const MnF = (AsF * fsu * dF * (1 - (0.6 * rho * fsu) / fcF)) / 12;
      const md0 = ((g.dlSolve.dc1 + g.dlSolve.dc2) * x * (L - x)) / 2 + (g.dlSolve.diaph * Math.min(x, L - x)) / 2;
      const mped = (g.pedKlf * x * (L - x)) / 2;
      const mL0 = llHS * g.dfSolve * (1 + r.impact);
      const rfF = (MnF - 1.3 * md0 - 2.17 * mped) / (2.17 * mL0);
      const P = P_at * fseF * AsF;
      const Sb2v = g.csec ? g.csec.Sb : g.sec.Sb;
      const m1 = (g.dlSolve.dc1 * x * (L - x)) / 2 + (g.dlSolve.diaph * Math.min(x, L - x)) / 2;
      const fbF = -P / g.sec.A - (P * (g.sec.yb - cgF)) / g.sec.Sb + (m1 * 12) / g.sec.Sb + ((md0 - m1 + mped + mL0) * 12) / Sb2v;
      const failsT = i.options.solveForService && fbF > codeTension(mt.fc) + 1e-9;
      if (rfF >= 1 && !failsT) return null; // fails elsewhere, not here: the note says so
      return { AsF, cgF, fseF, showT: i.options.solveForService, rfF, failsT };
    })();
    const fewerWorked = () => {
      if (!fewerBlock) return;
      text(`One strand fewer:- The same checks with ${nF} strands, at the same point. They are expected to fail (NG): that is what makes ${num(s.nStrands, 9)} the fewest.`, "note");
      m("N_f\\coloneq N_s-1=", "One strand fewer");
      m("A_{ps,f}\\coloneq N_f\\cdot a_{ps}=", "Prestressing steel", "in^2");
      cgRows("y_{ps,f}", nF, "Strand centroid, the same grid as above");
      given(`f_{se,f}\\coloneq ${num(fewerBlock.fseF, 8)}\\mathrm{ksi}`, `Effective prestress, the losses of section 1 worked out with ${nF} strands`);
      m(`d_f\\coloneq ${num(i.units.depth + (deck ? deck.thk : 0))}\\mathrm{in}-y_{ps,f}=`, "Depth to the strands", "in");
      m("\\rho_{p,f}\\coloneq\\frac{A_{ps,f}}{b\\cdot d_f}=");
      m("f_{su,f}\\coloneq f'_{s}\\cdot\\left(1-\\frac{\\gamma_{p}}{\\beta_1}\\cdot\\frac{\\rho_{p,f}\\cdot f'_{s}}{f'_{cf}}\\right)=", "SSHB Eq. 9-17", "ksi");
      m("M_{n,f}\\coloneq A_{ps,f}\\cdot f_{su,f}\\cdot d_f\\cdot\\left(1-0.6\\cdot\\frac{\\rho_{p,f}\\cdot f_{su,f}}{f'_{cf}}\\right)=", "SSHB Eq. 9-13", "kip*ft");
      m("RF_{0,f}\\coloneq\\frac{M_{n,f}-1.3\\cdot M_{D,0}-2.17\\cdot M_{ped}}{2.17\\cdot M_{L,0}}=", "Strength under the design's loads");
      m(ok("1", "RF_{0,f}"), fewerBlock.rfF < 1 ? "Below 1.0: not enough strands (expected NG)" : "Strength alone would be met");
      if (fewerBlock.showT) {
        m(`P_f\\coloneq ${P_at < 1 ? `${num(P_at, 10)}\\cdot ` : ""}f_{se,f}\\cdot A_{ps,f}=`, "Effective force at x", "kip");
        m("e_f\\coloneq y_b-y_{ps,f}=", "Eccentricity", "in");
        m(`f_{b0,f}\\coloneq-\\frac{P_f}{A_g}-\\frac{P_f\\cdot e_f}{S_b}+\\frac{M_{D1}}{S_b}+\\frac{M_{D2,0}+M_{ped}+M_{L,0}}{${Sb2}}=`, "Bottom stress under the design's loads", "ksi");
        m(ok("f_{b0,f}", "f_{t0}"), fewerBlock.failsT ? "Above the design's tension limit: not enough strands (expected NG)" : "The tension limit would be met");
      }
    };
    text(
      `Result:- The strands are the fewest that meet every condition of the original design: strength, the cracking moment${parts.length ? `, and ${parts.join("; and ")}` : ""}. Here ${what} sets them: it needs ${num(s.nExact, 3)} strands, ${i.options.roundStrands ? `rounded up to ${num(s.nStrands, 9)}` : "unrounded"}. With them the lowest strength rating under the design's loads is ${num(s.govRF, 3)} (${s.gov})${fewer !== null ? `; with ${nF} strands it would be ${num(fewer, 3)}${s.governs === "tension" ? " and the design's tension limit would be exceeded" : ""}${fewerBlock ? " (worked below)" : ""}` : ""}.${
        sidewalkCase ? ` The case worked here, ${g.name}, is not used to set the prestress: it is rated with it.` : ""
      }${asInspected ? " The strands are set on the intact bridge; the damage then lowers the ratings." : ""}`,
      "note",
    );
    fewerWorked();
    const rl = s.release;
    text(
      rl.ok
        ? `Release (a check, not a rating):- Just after transfer, with the prestress at ${num(rl.fi, 1)} ksi, the top tension is ${num(rl.top.top * 1000, 0)} psi (limit 7.5√f′ci = ${num(rl.topLim * 1000, 0)} psi) and the bottom compression ${num(rl.bottom.bottom, 3)} ksi (limit 0.60 f′ci = ${num(rl.botLim, 3)} ksi) (SSHB 9.15.2.1): a design with these strands was buildable.`
        : `Release (a check, not a rating):- Just after transfer, with the prestress at ${num(rl.fi, 1)} ksi, ${rl.top.top > rl.topLim ? `the top tension, ${num(rl.top.top * 1000, 0)} psi at ${num(rl.top.x, 2)} ft, exceeds 7.5√f′ci = ${num(rl.topLim * 1000, 0)} psi` : ""}${rl.top.top > rl.topLim && rl.bottom.bottom > rl.botLim ? " and " : ""}${rl.bottom.bottom > rl.botLim ? `the bottom compression, ${num(rl.bottom.bottom, 3)} ksi at ${num(rl.bottom.x, 2)} ft, exceeds 0.60 f′ci = ${num(rl.botLim, 3)} ksi` : ""} (SSHB 9.15.2.1). A design with straight strands like these couldn't have been built, so the original likely had harped or debonded strands, a higher release strength, or a different layout: the assumed strand arrangement should be reviewed. A release strength of ${num(Math.max(rl.bottom.bottom / 0.6, ((rl.top.top * 1000) / 7.5) ** 2 / 1000), 2)} ksi would satisfy it. The release strength enters the ratings only through the elastic shortening loss, and the ratings govern away from the ends, where any practical layout has about the same strand centroid.`,
      "note",
    );
    // What else the back-calculation rests on: the asphalt left out, the pedestrians kept in.
    const notes = [
      altAsphalt &&
        `The asphalt (${num(i.loads.asphalt)}") is left out of the back-calculation because the records don't show it as part of the original design; that is the conservative choice. With it in, the strands would be ${num(altAsphalt.solve.nStrands, 9)} and the HS-20 inventory rating ${num(hsInvOf(altAsphalt), 3)}.`,
      sw.length && i.loads.pedestrians && "The pedestrian load is in the back-calculation with the trucks between the curbs, as the original design combined them (SSHB 3.14.1.1).",
    ].filter(Boolean);
    if (notes.length) text(`Loads of the original design:- ${notes.join(" ")}`, "note");
  }

  // HS-20 rating of the existing bridge (its loads and the current distribution).
  text(back ? `8. HS-20 rating of the existing bridge, ${g.name} at x` : `7. HS-20 rating of ${g.name} at x`, "subheading");
  if (back) text("From here on the existing bridge is rated: the dead loads of section 5 (with the asphalt) and the distribution of section 6. These are its ratings, and they can be below the original design's.", "note");
  else wheelHS();
  m("M_{L,HS}\\coloneq M_{w,HS}\\cdot DF_{m}\\cdot\\left(1+I_m\\right)=", undefined, "kip*ft");
  if (kpt) {
    given(`M_{crs}\\coloneq ${num(kpt.Mcr, 9)}${kft}`, "Cracking moment at x, (fr + fpe)Sc − Mdnc(Sc/Sb − 1), fr = 7.5√f′c (SSHB 9.18.2.1, 9.15.2.3)");
    given(`k_{inv}\\coloneq ${num(kpt.inv, 10)}`, "Mn < 1.2 M*cr: k, the larger of Mn/(1.2 M*cr) and Mn/(1.33 Mu), Mu = 1.3MD + 2.17(ML(1 + I) + Mped) (MBE 6B.5.3.3, the owner's option)");
    given(`k_{opr}\\coloneq ${num(kpt.opr, 10)}`, "The same with Mu at the operating level");
    m("RF_{inv,HS}\\coloneq\\frac{k_{inv}\\cdot M_{nx}-1.3\\cdot M_D-2.17\\cdot M_{ped}}{2.17\\cdot M_{L,HS}}=", "Flexure, inventory: A1 = 1.3, A2 = 2.17 (MBE Eq. 6B.4.1-1, 6B.4.3)");
    m("RF_{opr,HS}\\coloneq\\frac{k_{opr}\\cdot M_{nx}-1.3\\cdot M_D-1.3\\cdot M_{ped}}{1.3\\cdot M_{L,HS}}=", "Flexure, operating: A2 = 1.3");
  } else {
    m("RF_{inv,HS}\\coloneq\\frac{M_{nx}-1.3\\cdot M_D-2.17\\cdot M_{ped}}{2.17\\cdot M_{L,HS}}=", "Flexure, inventory: A1 = 1.3, A2 = 2.17 (MBE Eq. 6B.4.1-1, 6B.4.3)");
    m("RF_{opr,HS}\\coloneq\\frac{M_{nx}-1.3\\cdot M_D-1.3\\cdot M_{ped}}{1.3\\cdot M_{L,HS}}=", "Flexure, operating: A2 = 1.3");
  }

  // Service at the same point
  text(`${back ? 9 : 8}. HS-20 service limits for ${g.name} at x`, "subheading");
  if (!pxShown) prestressAtX();
  m(`f_{bD}\\coloneq-\\frac{P_x}{A_g}-\\frac{P_x\\cdot e}{S_b}+\\frac{M_{D1}}{S_b}+\\frac{M_{D2}+M_{ped}}{${Sb2}}=`, "Bottom stress from prestress and dead load (tension positive)", "ksi");
  m(`f_{bL}\\coloneq\\frac{M_{L,HS}}{${Sb2}}=`, "Bottom stress from live load", "ksi");
  m("RF_{t,HS}\\coloneq\\frac{f_t-f_{bD}}{f_{bL}}=", tensionIgnored(i) ? "Concrete tension, inventory: for information, not a rating (BRM 1.7.2)" : "Concrete tension, inventory");
  m(`f_{tD}\\coloneq\\frac{P_x}{A_g}-\\frac{P_x\\cdot e}{S_t}+\\frac{M_{D1}}{S_t}+\\frac{M_{D2}+M_{ped}}{${St2}}=`, "Top stress from prestress and dead load (compression positive)", "ksi");
  m(`f_{tL}\\coloneq\\frac{M_{L,HS}}{${St2}}=`, "Top stress from live load", "ksi");
  m("RF_{c1,HS}\\coloneq\\frac{f_{c1}-f_{tD}}{f_{tL}}=", "Concrete compression under all loads, inventory");
  m("RF_{c2,HS}\\coloneq\\frac{f_{c2}-0.5\\cdot f_{tD}}{f_{tL}}=", "Concrete compression under live load plus half the prestress and dead load, inventory");
  text(
    `Over all girders, points and checks, the lowest HS-20 inventory rating is ${num(hs.govInv.inv.inv, 3)}, for ${checkName(hs.govInv.inv.check)} on ${hs.govInv.g} at ${num(hs.govInv.inv.x, 2)} ft.${(() => {
      // The same check at the worked point, from the same run, where it isn't the governing one.
      const here = hsFlex.points.find((p) => p.check === hs.govInv.inv.check && Math.abs(p.x - x) < 1e-9);
      if (!here || (hs.govInv.g === g.name && Math.abs(hs.govInv.inv.x - x) < 1e-9)) return " It is worked above.";
      return num(here.inv, 3) === num(hs.govInv.inv.inv, 3) && hs.govInv.g === g.name
        ? ` At x = ${num(x, 2)} ft, worked above, it is the same to three decimals.`
        : ` At x = ${num(x, 2)} ft on ${g.name}, worked above, the same check gives ${num(here.inv, 3)}.`;
    })()} The strand stress and the deck stress are checked the same way at every point.`,
  );

  // Ratings
  text(`${back ? 10 : 9}. Ratings: CDOT vehicles`, "subheading");
  // One legal vehicle worked out in full, as an example: CO Type 3 when rated.
  const workedName = (r.ratings.find((v) => v.name === "CO Type 3") ?? r.ratings.find((v) => v.cls !== "design"))?.name;
  text(
    `Each vehicle is moved across the span in both directions. The legal and permit vehicles use the ${legalLanes(i)}-lane distribution factor (BRM ${i.bridge.yearBuilt > 1985 ? "1.3(C): multi-lane for a bridge built after 1985" : legalLanes(i) === "single" ? "1.3(D): built in 1985 or earlier" : "1.3"}). The governing ratings are listed below.${workedName ? ` ${workedName} is worked out as an example of the operating rating for flexure; the other vehicles are rated the same way.` : ""}`,
  );
  const vehicleWorking = () => {
    for (const v of r.ratings) {
      if (v.name !== workedName) continue;
      const c = VCODE[v.name] ?? v.name.replace(/[^A-Za-z0-9]/g, "");
      const p = v.per.reduce((a, b) => (b.flexOpr.opr! < a.flexOpr.opr! ? b : a));
      const fp = p.flexOpr;
      const gg = r.girders.find((q) => q.name === p.g)!;
      const Mw = fp.LL / (p.df * (1 + r.impact));
      const Mped = (gg.pedKlf * fp.x * (L - fp.x)) / 2;
      // The operating capacity: with minimum steel, φMn scaled by the operating level's k (MBE 6B.5.3.3).
      const Copr = fp.k ? (fp.C / fp.k.inv) * fp.k.opr : fp.C;
      given(
        `M_{w,${c}}\\coloneq ${num(Mw, 9)}${kft}`,
        `${v.name} (${num(v.tons, 2)} T): moment per wheel line on ${p.g} at x = ${num(fp.x, 2)} ft. DF = ${num(p.df)}, MD = ${num(fp.Dl, 2)} kip·ft, ${fp.k ? `k·Mn = ${num(fp.k.opr, 3)} × ${num(fp.C / fp.k.inv, 2)} = ${num(Copr, 2)} kip·ft (minimum steel, MBE 6B.5.3.3)` : `Mn = ${num(fp.C, 2)} kip·ft`}${Mped ? `, Mped = ${num(Mped, 2)} kip·ft` : ""}`,
      );
      m(
        `RF_{opr,${c}}\\coloneq\\frac{${num(Copr, 9)}${kft}-1.3\\cdot ${num(fp.Dl, 9)}${kft}-1.3\\cdot ${num(Mped, 9)}${kft}}{1.3\\cdot M_{w,${c}}\\cdot ${num(p.df, 10)}\\cdot\\left(1+I_m\\right)}=`,
        "Operating rating factor, flexure",
      );
      m(`W_{${c}}\\coloneq RF_{opr,${c}}\\cdot ${num(v.tons, 4)}=`, "Operating rating, tons");
    }
  };

  text("Governing ratings (all girders, points and checks)", "subheading");
  // The summary table when the figures are drawn; the same as a list otherwise.
  if (figures?.summary) lines.push({ region: figures.summary });
  else for (const v of r.ratings)
    text(
      `${v.name}: inventory RF ${num(v.govInv.inv.inv, 3)} (${num(v.invTons, 1)} T), ${checkName(v.govInv.inv.check)} on ${v.govInv.g} at ${num(v.govInv.inv.x, 2)} ft; operating RF ${num(v.govOpr.opr.opr, 3)} (${num(v.oprTons, 1)} T), ${checkName(v.govOpr.opr.check)} on ${v.govOpr.g} at ${num(v.govOpr.opr.x, 2)} ft.${v.posting !== "—" ? ` ${v.posting}.` : ""}`,
    );
  if (workedName) {
    text(`Example: ${workedName}, operating rating for flexure`, "note");
    vehicleWorking();
  }

  if (r.condition.active && r.condition.asDesigned) {
    text("Condition: as designed and as inspected (MBE 6.1.2)", "subheading");
    if (i.condition.jointsFailed) text(`• Joints: ${i.condition.jointsNote.trim() || "failed"}. Each unit carries the wheels on it.`);
    for (const c of r.condition.units) {
      const what = [
        c.lostStrands > 0 && `${num(c.lostStrands)} strand${c.lostStrands === 1 ? "" : "s"} broken or missing`,
        c.corrodedStrands > 0 && c.areaLoss > 0 && `${num(c.corrodedStrands)} exposed with ${num(c.areaLoss)}% section loss`,
        c.topLoss > 0 && `${num(c.topLoss)} in lost from the top`,
        c.factor < 1 && `judgment factor ${num(c.factor)}`,
      ].filter(Boolean);
      text(
        `• ${c.g}: ${c.note.trim() ? `${c.note.trim().replace(/\.$/, "")}. ` : ""}Rated with ${what.join(", ")}${c.zone ? `, from ${num(c.zone.from, 2)} to ${num(c.zone.to, 2)} ft` : " over the whole span"}. At ${num(c.at, 2)} ft, A*s ${num(c.intact.As, 3)} in² intact and ${num(c.inspected.As, 3)} in² left; Mn ${num(c.intact.Mn, 1)} kip·ft intact and ${num(c.inspected.Mn, 1)} kip·ft as inspected.`,
      );
    }
    r.ratings.forEach((v, k) => {
      const d = r.condition.asDesigned![k];
      text(`${v.name}: operating RF ${num(d.opr, 3)} as designed (${d.oprG}), ${num(v.govOpr.opr.opr, 3)} as inspected (${v.govOpr.g}); inventory ${num(d.inv, 3)} and ${num(v.govInv.inv.inv, 3)}.${d.posting !== v.posting && v.posting !== "—" ? ` As designed: ${d.posting.toLowerCase()}; as inspected: ${v.posting.toLowerCase()}.` : ""}`);
    });
  }

  // Posting
  text(`${back ? 11 : 10}. Posting (BRM 1.15.1)`, "subheading");
  const posted = r.ratings.filter((v) => needsPosting(v.posting));
  const nrl = r.ratings.find((v) => v.name === "NRL");
  text(
    `Legal and specialized hauling vehicles are posted when their operating rating factor is below 0.95. Between 0.95 and 1.0 they are not posted (the 95% rule). None is posted at or above its weight limit (BRM Tables 1-4 to 1-6; SU6 and SU7 by the Colorado Bridge Formula, 33 and 35 T). The single-unit trucks SU4 to SU7 aren't posted when the NRL rates 40 tons or more${nrl ? `; here it rates ${num(postTons(nrl.oprTons), 1)} T` : ""}. An operating rating factor under 0.3 for any legal load restricts all legal loads. Emergency vehicles are posted only when the bridge is within 1 mile of an Interstate; this bridge ${i.bridge.nearInterstate ? "is" : "is not"}${i.sources?.["bridge.nearInterstate"]?.note ? ` (SIA ${i.sources["bridge.nearInterstate"].note.replace(/ \(.*$/, "")})` : ""}. Postings are in truncated tons.`,
  );
  text(r.restricted ? "A legal load rates under 0.3: the bridge is restricted for all legal loads." : posted.length ? `Posting is required for: ${posted.map((v) => `${v.name}, ${num(postTons(v.oprTons), 1)} T`).join("; ")}.` : "No posting is required.");
  if (figures?.comparison) {
    // The heading and its note stay on the table's page.
    lines.push({ text: "Comparison with AASHTOWare BrR", style: "subheading", keepWithNext: true });
    lines.push({
      text: "The table compares the BrR ratings with these calculations for each vehicle, level and girder. Where BrR gives two sidewalk runs, or both an axle and a lane rating for HS-20, the lower is used. The distribution factors are compared the same way. The two are taken to agree when they are within 5% of each other.",
      keepWithNext: true,
    });
    lines.push({ region: figures.comparison });
  }

  // 11. Review
  const items = i.review.items.filter((t) => t.trim());
  if (items.length || i.review.assumption.trim()) {
    text(`${back ? 12 : 11}. Items for review`, "subheading");
    if (i.review.assumption.trim()) text(i.review.assumption.trim());
    for (const t of items) text(`• ${t.trim()}`);
  }

  return lines;
}

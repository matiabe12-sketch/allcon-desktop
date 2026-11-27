import { POSTING_LIMIT } from "../girders/lrfr";
import { DesignError } from "../walls/cip";
import type { SiaConditionData } from "./sia";
import { unitJ } from "./torsion";
import { CDOT_VEHICLES, laneAt, tons, trainAt, trainMax, type Vehicle, type VehicleClass } from "./vehicles";

// Load Factor Rating of a simple-span bridge of adjacent precast, prestressed double-tee units, as
// AASHTOWare BrR rates one: the AASHTO Standard Specifications (17th ed., "SSHB") and the MBE's
// Section 6B, with CDOT's Bridge Rating Manual (BRM). Each vehicle is moved along the span and every
// girder is rated at every point of interest for strength (flexure, and shear when it isn't waived)
// and, for prestressed concrete, service (concrete stresses and strand stress), inventory and
// operating. Without plans the prestress is back-calculated so the design vehicle (HS-20) rates
// exactly 1.0 at inventory in flexure (BRM 1.7.2(A)); the girder is then modeled in BrR by that force
// at an assumed strand centroid.
//
// Units: ft for lengths along the span, in for section dimensions, kip, ksi, kip·ft.

// --- inputs ----------------------------------------------------------------------------------------

export type DtUnitLayout = { flangeWidth: number; stemSpacing: number };
export type DtInputs = {
  bridge: { id: string; facility: string; feature: string; owner: string; yearBuilt: number; nbiSuper: number; loadInducedDistress: boolean; nearInterstate: boolean; inspection: string; rater: string; checker: string };
  span: number; // ft, bearing to bearing
  structureLength: number; // ft
  numSpans: number; // identical simple spans
  skew: number; // degrees (no LFD moment reduction; entered in BrR)
  units: {
    count: number;
    spacing: number; // in, center to center of units
    flangeWidth: number; // in
    depth: number; // in, precast, overall
    flangeThk: number; // in
    stemSpacing: number; // in, center to center within a unit
    stemTop: number; // in
    stemBot: number; // in
    fillet?: number; // in, legs of the triangular fillet (chamfer) under the flange each side of each stem; 0 for none
    exteriorTrimmed: boolean; // exterior flanges trimmed flush with the outer stem
    layout: DtUnitLayout[] | null; // per unit, when they differ
    jointGap: number; // in, between units with a layout
  };
  deck: { present: boolean; thk: number; fc: number; pcf: number };
  roadway: { railToRail: number; railFaceOffset: number; curbToCurb: number; curbFaceOffset: number }; // ft, in, ft, in
  loads: {
    asphalt: number; // in
    asphaltPcf: number;
    concPcf: number; // girder concrete for dead load, pcf: 163 for reinforced precast concrete (BRM Table 1-1)
    // ft, in; side 1 on the first unit, side 2 on the last. A curb carries no pedestrians and isn't mountable.
    sidewalks: { width: number; thk: number; curb?: boolean }[];
    pedWidth: number; // ft carrying pedestrian load (0: the sidewalks' width)
    sidewalkMountable: boolean;
    pedestrians: boolean; // pedestrian live load on the sidewalks (SSHB 3.14.1.1), with the trucks curb to curb
    railKlf: number; // each side
    railComponents: { name: string; plf: number; desc: string }[];
    utilities: { desc: string; klf: number; unit: number }[];
    diaphragmKip: number; // per girder, at midspan
  };
  materials: { fc: number; fci: number; strand: string; fpu: number; aps: number; gammaStar: number; jackingRatio: number; lowRelaxation: boolean; strandsPerRowPerStem: number; firstRow: number; rowSpacing: number };
  // harp: strands harped (from a standard), their centroid above the bottom at the ends and from `at` × span to midspan.
  prestress: { mode: "back-calculate" | "known"; strands: number; harp?: { end: number; mid: number; at: number } | null };
  options: {
    /**
     * The asphalt in place while the force is solved. Off by default: the solve rebuilds the original
     * design, under the dead load of its time (BRM 1.7.2(A)); an overlay added later is rated, not
     * designed for. On only where the overlay is known to be original.
     */
    solveWithOverlay: boolean;
    /**
     * Interior units: SSHB Table 3.23.1 for prestressed girders (S/7.0, S/5.5), the multi-beam S/D of
     * 3.23.4.3, or by the deck (the default): the table under a composite deck, S/D for units side by
     * side whose flanges are the deck (3.23.4).
     */
    lldfInterior: "auto" | "table" | "sd";
    roundStrands: boolean; // whole strands, the jacking force rounded down to the kip
    legalLldf: "single" | "multi";
    /**
     * ksi, final tension allowed in the girder; null: the code's 6√f′c (SSHB 9.15.2.2). CDOT's
     * back-calculated model raises it to 1.0 so strength governs (BRM 1.7.2), in the runs that set the
     * force and in the reported ratings (as CDOT's sample BrR model does).
     */
    tensionLimit: number | null;
    /**
     * With a back-calculated prestress: the final tension isn't rated, only reported at the code limit.
     * Off by default: MBE 6B.5.3.3 says the inventory rating must consider the service stresses of the
     * Standard Specifications, and the back-calculation now meets the design's service tension. Kept
     * for designs that were rated that way.
     */
    ignoreTension: boolean;
    /**
     * Back-calculate the prestress to meet the original design's service tension as well, 6√f′c at the
     * bottom under the design vehicle (SSHB 9.15.2.2; 1973 Art. 1.6.6(B)(2)), with the losses chosen.
     */
    solveForService: boolean;
    /**
     * Minimum steel: the back-calculation gives φMn ≥ 1.2 M*cr (SSHB 9.18.2.1; 1973 Art. 1.6.10(B)), or
     * 1.33 times the factored moment (9.18.2.2); the rating scales φMn by k where it falls short
     * (MBE 6B.5.3.3, the owner's option).
     */
    minSteel12: boolean;
    /** Prestress losses: item by item (SSHB 9.16.2.1), or the lump sum of 9.16.2.2 (as a file or a standard gives). */
    losses: "itemized" | "lump";
    lossLumpSum: number; // ksi, SSHB 9.16.2.2
    humidity: number; // %, mean annual (SSHB Figure 9.16.2.1.1), for shrinkage
    poi: "tenth" | "tenth-and-max"; // tenth points (BrR's default), or also each vehicle's maximum moment
    solveAt: "points" | "midspan"; // back-calculate over the points of interest (as BrR rates), or at midspan by the hand method
    checkShear: boolean; // SSHB 9.20; waived by default per BRM 1.4(O)
    stirrups: { bar: number; legs: number; spacing: number; fy: number }; // for shear, per stem
    dfOverride: { intSingle: number; intMulti: number; extSingle: number; extMulti: number } | null;
  };
  /** What the inspection found, rated on the section as it stands (MBE 6.1.2); the back-calculation stays on the intact bridge. */
  condition: DtCondition;
  /** The latest SIA's element table, notes and maintenance items: prompts for the condition, never applied. */
  siaCondition: SiaConditionData | null;
  review: { items: string[]; assumption: string };
  notes: Record<string, string>; // the source of a value, by input path
  brrResults: string; // BrR's rating table, pasted, for the comparison
  /** BrR's moment distribution factors (from its input or LLDF report), to check against ALLCON's within 5%. */
  brrDf: { intSingle: number | null; intMulti: number | null; extSingle: number | null; extMulti: number | null };
  /** The inspection sketch, its pages stored as pictures under the design. */
  sketch: DtSketch | null;
  /** The units' (and deck's) dimensions entered or confirmed for this bridge, not the starting values. */
  dimsChecked: boolean;
  /** Where each bridge input came from (sources.ts); one without a source is still needed. */
  sources: Record<string, { kind: "sia" | "sketch" | "brm" | "file" | "standard" | "entered" | "assumed" | "confirmed"; note?: string }>;
  /** Started blank: inputs without a source show empty, not ALLCON's placeholders. */
  blankStart: boolean;
};
/**
 * One unit's damage from the inspection. Strand losses apply over the zone (the whole span without one)
 * and a development length past each end of it, where a damaged strand can't yet carry its full stress
 * (SSHB 9.28); the top loss over the zone; the judgment factor everywhere, with its reason.
 */
export type DtUnitCondition = {
  unit: number; // 1-based, G1 on side 1
  lostStrands: number; // broken or missing
  corrodedStrands: number; // exposed with section loss
  areaLoss: number; // %, of each corroded strand's area
  zone: { from: number; to: number } | null; // ft from the left bearing
  topLoss: number; // in, lost from the top of the flange (or deck): spalls, delamination
  factor: number; // engineering judgment on the capacity, ≤ 1; 1: none
  note: string; // what the inspection found; required with a factor
};
export type DtCondition = {
  /** The joints (shear keys) no longer share load: each unit carries the wheels on it (a hinge at every joint). */
  jointsFailed: boolean;
  jointsNote: string;
  units: DtUnitCondition[];
};
export const NO_UNIT_CONDITION: Omit<DtUnitCondition, "unit"> = { lostStrands: 0, corrodedStrands: 0, areaLoss: 0, zone: null, topLoss: 0, factor: 1, note: "" };
/** Whether a unit's condition changes anything. */
export const unitDamaged = (c: DtUnitCondition) => c.lostStrands > 0 || (c.corrodedStrands > 0 && c.areaLoss > 0) || c.topLoss > 0 || c.factor < 1;
/** Whether the bridge is rated on anything other than its intact section. */
export const conditionActive = (c: DtCondition | undefined) => !!c && (c.jointsFailed || c.units.some(unitDamaged));

/** text: a PDF sketch's text lines, for its callouts (none for a scan or a picture). */
export type DtSketch = { name: string; pages: { key: string; width: number; height: number }[]; text?: string[] };

export const DT_DEFAULTS: DtInputs = {
  bridge: { id: "", facility: "", feature: "", owner: "", yearBuilt: 1970, nbiSuper: 6, loadInducedDistress: false, nearInterstate: false, inspection: "", rater: "", checker: "" },
  span: 30,
  structureLength: 30.5,
  numSpans: 1,
  skew: 0,
  units: { count: 6, spacing: 62, flangeWidth: 60, depth: 17, flangeThk: 5, stemSpacing: 36, stemTop: 8, stemBot: 6, fillet: 0, exteriorTrimmed: false, layout: null, jointGap: 0 },
  deck: { present: false, thk: 6, fc: 4.5, pcf: 150 },
  roadway: { railToRail: 30, railFaceOffset: 3, curbToCurb: 0, curbFaceOffset: 0 },
  loads: { asphalt: 3, asphaltPcf: 146.667, concPcf: 163, sidewalks: [], pedWidth: 0, sidewalkMountable: true, pedestrians: true, railKlf: 0.02, railComponents: [], utilities: [], diaphragmKip: 0 },
  materials: { fc: 6, fci: 4, strand: '1/2" 250 ksi stress-relieved', fpu: 250, aps: 0.144, gammaStar: 0.4, jackingRatio: 0.7, lowRelaxation: false, strandsPerRowPerStem: 2, firstRow: 2, rowSpacing: 2 },
  prestress: { mode: "back-calculate", strands: 0 },
  options: {
    solveWithOverlay: false,
    lldfInterior: "auto",
    roundStrands: true,
    legalLldf: "single",
    tensionLimit: null,
    ignoreTension: false,
    solveForService: true,
    minSteel12: true,
    losses: "itemized",
    lossLumpSum: 45,
    humidity: 55,
    poi: "tenth",
    solveAt: "points",
    checkShear: false,
    stirrups: { bar: 3, legs: 1, spacing: 12, fy: 40 },
    dfOverride: null,
  },
  condition: { jointsFailed: false, jointsNote: "", units: [] },
  siaCondition: null,
  review: { items: [], assumption: "" },
  notes: {},
  brrResults: "",
  brrDf: { intSingle: null, intMulti: null, extSingle: null, extMulti: null },
  sketch: null,
  dimsChecked: false,
  sources: {},
  blankStart: true,
};

const BAR_AREA: Record<number, number> = { 3: 0.11, 4: 0.2, 5: 0.31, 6: 0.44 };
export const EP = 28500; // ksi, strand: BrR's value (SSHB 9.16.2.1.2 gives 28,000)
/** Modulus of rupture, ksi: 0.24√f′c, BrR's value (SSHB 9.15.2.3's 7.5√f′c psi is 1% less). */
export const ruptureModulus = (fc: number) => 0.24 * Math.sqrt(fc);
/** The final tension limit, ksi. */
export const finalTension = (i: Pick<DtInputs, "options" | "materials">) => i.options.tensionLimit ?? codeTension(i.materials.fc);
/** The code's final tension limit, 6√f′c psi (SSHB 9.15.2.2), ksi. */
export const codeTension = (fc: number) => (6 * Math.sqrt(fc * 1000)) / 1000;
/** Whether the final tension is left out of the rating: asked for, with a back-calculated prestress (BRM 1.7.2). */
export const tensionIgnored = (i: Pick<DtInputs, "options" | "prestress">) => !!i.options.ignoreTension && i.prestress.mode === "back-calculate";
/**
 * The interior distribution used: as chosen, or by the deck. Under a composite deck the units are
 * girders carrying a slab (SSHB Table 3.23.1); without one, units side by side with the flanges as
 * the deck are a multi-beam deck (SSHB 3.23.4).
 */
export const interiorMethod = (i: Pick<DtInputs, "options" | "deck">): "table" | "sd" => (i.options.lldfInterior === "auto" ? (i.deck.present ? "table" : "sd") : i.options.lldfInterior);

// --- sections ----------------------------------------------------------------------------------------

function trap(h: number, b1: number, b2: number, y0: number) {
  const A = ((b1 + b2) / 2) * h;
  const yc = y0 + (h * (b1 + 2 * b2)) / (3 * (b1 + b2));
  const Io = (h ** 3 * (b1 * b1 + 4 * b1 * b2 + b2 * b2)) / (36 * (b1 + b2));
  return { A, yc, Io };
}
export type DtSection = ReturnType<typeof section>;
/**
 * A double-tee unit: its flange (width bf), two tapered stems and, if given, a triangular fillet of
 * legs f under the flange on each side of each stem (one fewer on a trimmed exterior flange). With
 * fillets, as BrR's PS tee shape: each stem tapers from its bottom width to its top width at the
 * fillets' bottom, then runs straight at the top width through the fillets' depth to the flange.
 */
function section(u: DtInputs["units"], bf: number, fillets = 4) {
  const hs = u.depth - u.flangeThk;
  const f = Math.max(0, Math.min(u.fillet || 0, hs));
  const stem = f > 0 ? [trap(hs - f, u.stemBot, u.stemTop, 0), trap(f, u.stemTop, u.stemTop, hs - f)] : [trap(hs, u.stemBot, u.stemTop, 0)];
  const parts = [trap(u.flangeThk, bf, bf, hs), ...stem, ...stem];
  // Each fillet: a triangle with its legs on the flange's underside and the stem's face.
  if (f > 0) for (let k = 0; k < fillets; k++) parts.push({ A: (f * f) / 2, yc: hs - f / 3, Io: f ** 4 / 36 });
  const A = parts.reduce((s, p) => s + p.A, 0);
  const yb = parts.reduce((s, p) => s + p.A * p.yc, 0) / A;
  const I = parts.reduce((s, p) => s + p.Io + p.A * (p.yc - yb) ** 2, 0);
  const tAvg = (u.stemTop + u.stemBot) / 2;
  return {
    bf,
    A,
    yb,
    yt: u.depth - yb,
    I,
    Sb: I / yb,
    St: I / (u.depth - yb),
    /** St. Venant torsion constant, solved on the unit's shape without fillets (torsion.ts); worked out when first asked for. */
    get J() {
      return unitJ({ bf, depth: u.depth, flangeThk: u.flangeThk, stemSpacing: u.stemSpacing, stemTop: u.stemTop, stemBot: u.stemBot });
    },
    bw: 2 * tAvg,
  };
}
/** Ec, SSHB 8.7.1, 145 pcf. */
export const Ec = (fc: number) => 33000 * 0.145 ** 1.5 * Math.sqrt(fc);

// --- flexural strength, SSHB 9.17 ----------------------------------------------------------------

export type Flexure = ReturnType<typeof flexure>;
/** Mn (kip·ft) for strands As at depth d; fsuCap limits the strand stress (development, 9.28). */
function flexure(As: number, sec: { bf: number; bw: number }, d: number, m: DtInputs["materials"], hf: number, fcFlange: number, fsuCap: number | null = null) {
  const fc = fcFlange;
  const fpu = m.fpu;
  const g = m.gammaStar;
  const b1 = Math.max(0.65, Math.min(0.85, 0.85 - 0.05 * (fc - 4)));
  const b = sec.bf;
  const bw = sec.bw;
  const rho = As / (b * d);
  let fsu = fpu * (1 - (g / b1) * ((rho * fpu) / fc)); // 9-17
  if (fsuCap !== null) fsu = Math.min(fsu, fsuCap);
  const a = (1.4 * d * rho * fsu) / fc;
  let Mn: number;
  let type: "rectangular" | "flanged";
  if (a <= hf) {
    type = "rectangular";
    Mn = As * fsu * d * (1 - (0.6 * rho * fsu) / fc); // 9-13
  } else {
    type = "flanged";
    const Asf = (0.85 * fc * (b - bw) * hf) / fsu;
    const Asr = As - Asf;
    Mn = Asr * fsu * d * (1 - (0.6 * Asr * fsu) / (bw * d * fc)) + 0.85 * fc * (b - bw) * hf * (d - 0.5 * hf); // 9-14
  }
  const index = (rho * fsu) / fc;
  const limit = 0.36 * b1;
  let overReinforced = false;
  if (type === "rectangular" && index > limit) {
    overReinforced = true;
    Mn = Math.min(Mn, (0.36 * b1 - 0.08 * b1 * b1) * fc * b * d * d); // 9.18.1
  }
  return { Mn: Mn / 12, fsu, rho, beta1: b1, a, type, index, limit, overReinforced };
}

/**
 * Stress in seven-wire strand (ASTM A416) at a strain, ksi, by the PCI Design Handbook's curves:
 * 270 ksi, 28,500ε up to 0.0086, then 270 − 0.04/(ε − 0.007); 250 ksi, 28,500ε up to 0.0076, then
 * 250 − 0.04/(ε − 0.0064) (other strengths on the 250 ksi curve, scaled).
 */
export function strandStress(eps: number, fpu: number) {
  if (fpu >= 260) return eps <= 0.0086 ? 28500 * eps : 270 - 0.04 / (eps - 0.007);
  const k = fpu / 250;
  return k * (eps <= 0.0076 ? 28500 * eps : 250 - 0.04 / (eps - 0.0064));
}

/**
 * f*su by strain compatibility, for when Eq. 9-17 doesn't apply (fse < 0.5 f′s, SSHB 9.17.4.1): the
 * strand strain at ultimate is that of the effective prestress (fse/Es), plus the decompression of the
 * concrete at the strands (Pe/(A·Ec))(1 + e²/r²), plus the flexural strain 0.003(d − c)/c, with the
 * neutral axis c where the stress block (0.85f′c, a = β1·c, the flange then the stems) balances the
 * strands at the stress the curve gives for that strain.
 */
export function strainCompat(As: number, sec: { bf: number; bw: number; A: number; I: number; yb: number }, d: number, m: DtInputs["materials"], hf: number, fc: number, fse: number, EcGirder: number, cg: number) {
  const b1 = Math.max(0.65, Math.min(0.85, 0.85 - 0.05 * (fc - 4)));
  const e = sec.yb - cg;
  const e1 = fse / 28500;
  const e2 = ((fse * As) / (sec.A * EcGirder)) * (1 + (e * e * sec.A) / sec.I);
  const C = (c: number) => {
    const a = b1 * c;
    return a <= hf ? 0.85 * fc * sec.bf * a : 0.85 * fc * ((sec.bf - sec.bw) * hf + sec.bw * a);
  };
  const eps = (c: number) => e1 + e2 + (0.003 * (d - c)) / c;
  const T = (c: number) => As * strandStress(eps(c), m.fpu);
  let lo = 1e-4;
  let hi = d;
  for (let k = 0; k < 100; k++) {
    const c = (lo + hi) / 2;
    if (C(c) > T(c)) hi = c;
    else lo = c;
  }
  const c = (lo + hi) / 2;
  return { c, a: b1 * c, e1, e2, e3: (0.003 * (d - c)) / c, eps: eps(c), fps: strandStress(eps(c), m.fpu) };
}

/** The strand centroid above the bottom for an area As, rows filled from the bottom (the assumption for a girder without plans). */
export function strandCG(As: number, m: DtInputs["materials"]) {
  // Each stem's strands fill the rows from the bottom, so a top row may be part full: 7 strands at
  // 2 per row sit 2/2/2/1 (centroid 32/7 in at rows 2, 4, 6, 8 in). A fractional count (while solving)
  // fills the top row in proportion, so the centroid stays continuous in the steel area.
  const perStem = As / m.aps / 2;
  const r = m.strandsPerRowPerStem;
  if (!(perStem > 0) || !(r > 0)) return m.firstRow;
  const full = Math.floor(perStem / r + 1e-9);
  const rest = Math.max(0, perStem - full * r);
  let moment = 0;
  for (let k = 0; k < full; k++) moment += r * (m.firstRow + k * m.rowSpacing);
  moment += rest * (m.firstRow + full * m.rowSpacing);
  return moment / perStem;
}

// --- the rating ------------------------------------------------------------------------------------

export type Girder = ReturnType<typeof buildGirders>["girders"][number];
export type RatingCheck = "flexure" | "shear" | "tension" | "compression" | "compression-ll" | "strand" | "deck-compression";
/** A girder case of trucks on a mountable sidewalk: rated, but not used to back-calculate the prestress. */
export const isSidewalkTruckCase = (name: string) => name.endsWith("(trucks on sidewalk)");

export const CHECK_LABEL: Record<RatingCheck, string> = {
  flexure: "Flexure (strength)",
  shear: "Shear (strength)",
  tension: "Concrete tension, bottom",
  compression: "Concrete compression, top (0.6 f′c)",
  "compression-ll": "Concrete compression, top, LL + ½(PS + DL) (0.4 f′c)",
  strand: "Prestressing steel stress",
  "deck-compression": "Deck concrete compression",
};

function buildGirders(i: DtInputs) {
  const u = i.units;
  const L = i.span;
  const nU = u.count;
  if (!(L > 0)) throw new DesignError("The span needs a length.");
  if (nU < 2) throw new DesignError("At least two units.");
  if (!(u.depth > u.flangeThk && u.flangeThk > 0)) throw new DesignError("The depth must be more than the flange thickness.");
  if (!(u.stemTop > 0 && u.stemBot > 0)) throw new DesignError("The stems need widths.");
  const deck = i.deck.present ? i.deck : null;
  const extOverhangOut = u.exteriorTrimmed ? u.stemTop / 2 : (u.flangeWidth - u.stemSpacing) / 2;
  const intOverhang = (u.flangeWidth - u.stemSpacing) / 2;
  const bfExt = intOverhang + u.stemSpacing + extOverhangOut;
  const geo: { bf: number; ss: number; edge: number; x: number }[] = [];
  if (u.layout) {
    if (u.layout.length !== nU) throw new DesignError(`The unit layout must list ${nU} units.`);
    let x = 0;
    u.layout.forEach((g, k) => {
      if (k > 0) x += u.layout![k - 1].flangeWidth / 2 + u.jointGap + g.flangeWidth / 2;
      geo.push({ bf: g.flangeWidth, ss: g.stemSpacing, edge: g.flangeWidth / 2, x });
    });
  } else {
    for (let k = 0; k < nU; k++) {
      const ext = k === 0 || k === nU - 1;
      geo.push({ bf: ext ? bfExt : u.flangeWidth, ss: u.stemSpacing, edge: u.stemSpacing / 2 + extOverhangOut, x: k * u.spacing });
    }
  }
  const spacingAt = (k: number) => geo[k + 1].x - geo[k].x; // in, between girder k and k+1
  const iTyp = nU >= 3 ? Math.floor((nU - 1) / 2) : 0;
  const S_in = u.layout ? (spacingAt(iTyp - 1 < 0 ? 0 : iTyp - 1) + spacingAt(iTyp)) / 2 : u.spacing;
  const S_ft = S_in / 12;
  const secInt = section(u, geo[iTyp].bf);
  const secExt = section(u, geo[0].bf, u.exteriorTrimmed && !u.layout ? 3 : 4);
  const impact = Math.min(0.3, 50 / (L + 125)); // SSHB 3.8.2.1

  // Composite section: the deck transformed to the girder's concrete.
  const nDeck = deck ? Ec(deck.fc) / Ec(i.materials.fc) : 1;
  const compositeSec = (sec: DtSection) => {
    if (!deck) return null;
    const bt = sec.bf * nDeck;
    const t = deck.thk;
    const Ad = bt * t;
    const yd = u.depth + t / 2;
    const A = sec.A + Ad;
    const yb = (sec.A * sec.yb + Ad * yd) / A;
    const I = sec.I + sec.A * (sec.yb - yb) ** 2 + (bt * t ** 3) / 12 + Ad * (yd - yb) ** 2;
    return { A, yb, I, Sb: I / yb, St: I / (u.depth - yb), Sd: I / (u.depth + t - yb), h: u.depth + t, n: nDeck };
  };

  // Live load distribution, wheel lines per unit (SSHB 3.23).
  const roadW = i.roadway.railToRail;
  const NL = designLanes(roadwayWidth(i));
  const sOverD = (nl: number, sec: DtSection) => {
    const K = Math.sqrt((1.2 * sec.I) / sec.J);
    const WL = roadW / L;
    const C = WL < 1 ? K * WL : K;
    const D = 5.75 - 0.5 * nl + 0.7 * nl * (1 - 0.2 * C) ** 2; // 3.23.4.3
    return { K, C, D, DF: Math.min(1, S_ft / D) }; // the load fraction need not be greater than 1
  };
  // S/D's range (SSHB 3.23.4.3): √(I/J) up to 5.0 and skew up to 45°; outside it, a more precise method.
  // (J is solved only when S/D is used.)
  const sdRange = () => {
    const rootIJ = Math.sqrt(secInt.I / secInt.J);
    return { rootIJ, out: rootIJ > 5 ? `√(I/J) = ${rootIJ.toFixed(2)} exceeds 5.0` : i.skew > 45 ? `the skew, ${i.skew}°, exceeds 45°` : null };
  };
  /** Lever rule for an exterior girder: the wheel 2 ft from the rail or curb face, hinged at the next girder. */
  const lever = (multi: boolean, faceOffsetIn: number, k = 0) => {
    const g = geo[k];
    const S = spacingAt(k === 0 ? 0 : k - 1);
    const face = g.edge - faceOffsetIn;
    // Wheels 6 ft apart, the trucks 12 ft center to center (BRM 1.3(F)).
    const wheels = multi ? [24, 96, 168, 240] : [24, 96];
    let R = 0;
    const used: number[] = [];
    for (const w of wheels) {
      const x = w - face;
      if (x < S) {
        R += (S - x) / S;
        used.push(x);
      }
    }
    return { DF: R, wheels: used, S, face };
  };
  /**
   * Units acting alone (failed joints): the most wheels that can sit on unit k, the lever rule with a
   * hinge at every joint. Wheels 6 ft apart in a truck, 4 ft between trucks side by side, 2 ft or more
   * from the rail or curb faces (faceIn, in, from the bridge's edges), up to the number of lanes.
   */
  const leftEdge = geo[0].x - geo[0].edge;
  const rightEdge = geo[nU - 1].x + geo[nU - 1].edge;
  const unitSpan = (k: number): [number, number] => {
    const g = geo[k];
    if (u.layout) return [g.x - g.bf / 2, g.x + g.bf / 2];
    if (k === 0) return [leftEdge, g.x + g.ss / 2 + intOverhang];
    if (k === nU - 1) return [g.x - g.ss / 2 - intOverhang, rightEdge];
    return [g.x - g.bf / 2, g.x + g.bf / 2];
  };
  const isolated = (k: number, multi: boolean, faceIn: number) => {
    const lo = leftEdge + faceIn + 24;
    const hi = rightEdge - faceIn - 24;
    const [a, b] = unitSpan(k);
    // A wheel on a joint counts half to each unit.
    const on = (p: number, offs: number[]) => offs.reduce((n, o) => n + (p + o > a + 1e-6 && p + o < b - 1e-6 ? 1 : Math.abs(p + o - a) <= 1e-6 || Math.abs(p + o - b) <= 1e-6 ? 0.5 : 0), 0);
    let best = 0;
    for (let t = 1; t <= (multi ? NL : 1); t++) {
      const offs: number[] = [];
      for (let j = 0; j < t; j++) offs.push(j * 120, j * 120 + 72);
      const w = offs[offs.length - 1];
      if (w > hi - lo + 1e-9) break;
      // Every placement that puts a wheel at a unit edge (the counts change only there), and the ends of the roadway.
      const cands = [lo, hi - w, ...offs.flatMap((o) => [a - o, b - o].flatMap((p) => [p - 2e-6, p, p + 2e-6]))].filter((p) => p >= lo - 1e-9 && p <= hi - w + 1e-9);
      for (const p of cands) best = Math.max(best, on(p, offs));
    }
    return best;
  };
  const sdIn = interiorMethod(i) === "sd";
  const range = sdIn ? sdRange() : null;
  const dfInt = sdIn
    ? { method: "sd" as const, multi: sOverD(NL, secInt), single: sOverD(NL, secInt), rootIJ: range!.rootIJ, outOfRange: range!.out }
    : { method: "table" as const, multi: { D: 5.5, DF: S_ft / 5.5 }, single: { D: 7.0, DF: S_ft / 7.0 }, sd: { multi: sOverD(NL, secInt), single: sOverD(NL, secInt) }, rootIJ: null, outOfRange: null };
  /**
   * Lever rule for interior unit k: the wheels' reactions at it, the deck hinged at the units on each
   * side, the trucks placed for the most (wheels 6 ft apart, trucks 12 ft center to center, BRM
   * 1.3(F); 2 ft or more from the curb or rail faces).
   */
  const leverInterior = (k: number, multi: boolean) => {
    const xl = geo[k - 1].x, x0 = geo[k].x, xr = geo[k + 1].x;
    const infl = (p: number) => (p <= xl || p >= xr ? 0 : p <= x0 ? (p - xl) / (x0 - xl) : (xr - p) / (xr - x0));
    const face = sidewalks.length ? i.roadway.curbFaceOffset : i.roadway.railFaceOffset;
    const lo = leftEdge + face + 24;
    const hi = rightEdge - face - 24;
    let best = 0;
    for (let t = 1; t <= (multi ? NL : 1); t++) {
      const offs: number[] = [];
      for (let j = 0; j < t; j++) offs.push(j * 144, j * 144 + 72);
      const w = offs[offs.length - 1];
      if (w > hi - lo + 1e-9) break;
      const cands = [lo, hi - w, ...offs.flatMap((o) => [xl, x0, xr].map((b) => b - o))].filter((p) => p >= lo - 1e-9 && p <= hi - w + 1e-9);
      for (const p of cands) best = Math.max(best, offs.reduce((s, o) => s + infl(p + o), 0));
    }
    return best;
  };
  /**
   * Each interior unit by its own spacing: S/D (one D for the bridge, the fraction at most 1) or S/5.5
   * and S/7.0; the lever rule where the formulas don't apply (BRM 1.3(E)): S/D outside its range, or the
   * table's spacing over 14 ft (two or more lanes) or 10 ft (one lane), its footnote f.
   */
  const dfInterior = (k: number) => {
    const S = (spacingAt(k - 1) + spacingAt(k)) / 2 / 12;
    if (sdIn) {
      if (dfInt.outOfRange) return { single: leverInterior(k, false), multi: leverInterior(k, NL > 1), S, leverSingle: true, leverMulti: true };
      return { single: Math.min(1, S / dfInt.single.D), multi: Math.min(1, S / dfInt.multi.D), S, leverSingle: false, leverMulti: false };
    }
    const leverMulti = S > 14;
    const leverSingle = S > 10;
    return { single: leverSingle ? leverInterior(k, false) : S / 7.0, multi: leverMulti ? leverInterior(k, NL > 1) : S / 5.5, S, leverSingle, leverMulti };
  };
  /**
   * The original design's distribution for the interior units of a multi-beam deck (units side by side,
   * no composite deck), by the year built; see multiBeamEra. The rating uses today's S/D.
   */
  const eraRule = sdIn ? multiBeamEra(i.bridge.yearBuilt) : null;
  const eraAt = (k: number) => {
    if (!eraRule || eraRule === "current") return null;
    const S = dfInterior(k).S;
    if (eraRule === "slab") {
      const E = Math.min(7, 4 + 0.06 * L); // ft, the width one wheel spreads over
      return { rule: eraRule, S, E, DF: S / E };
    }
    // 1977: an effective spacing, and D from the stiffness C = K·W/L (no deck slab, so Jt = 0 and
    // K = √(EI/2GJ) = √((1 + μ)I/J), μ = 0.2).
    const Seff = (12 * NL + 9) / nU;
    const K = Math.sqrt((1.2 * secInt.I) / secInt.J);
    const C = (K * roadW) / L;
    const D = C <= 3 ? 5 + NL / 10 + (3 - (2 * NL) / 7) * (1 - C / 3) ** 2 : 5 + NL / 10;
    return { rule: eraRule, S, Seff, K, C, D, DF: Seff / D };
  };
  const eraDF = eraRule && eraRule !== "current" ? (k: number) => eraAt(k)!.DF : null;

  // Sidewalks: rated two ways, the worse governing: trucks curb to curb with pedestrians on the
  // sidewalks, and (mountable sidewalks) trucks on the sidewalk without pedestrians, exterior girders.
  const ld = i.loads;
  const sidewalks = ld.sidewalks;
  // The walkways: the sidewalks that aren't curbs (pedestrians, and trucks when mountable).
  const walks = sidewalks.filter((s) => !s.curb);
  const pedWidth = ld.pedWidth > 0 ? ld.pedWidth : walks.reduce((a, s) => a + s.width, 0);
  // SSHB 3.14.1.1; over 100 ft, P = (30 + 3000/L)(55 − W)/50 with W the width of a sidewalk (ft), at most 60 psf.
  const pedPsf = L <= 25 ? 85 : L <= 100 ? 60 : Math.min(60, ((30 + 3000 / L) * (55 - (walks.length ? Math.max(...walks.map((s) => s.width)) : pedWidth))) / 50);
  const mountable = walks.length > 0 && ld.sidewalkMountable;
  const pedKlf = walks.length && ld.pedestrians ? (pedPsf * pedWidth) / nU / 1000 : 0;
  const curbFace = sidewalks.length ? i.roadway.curbFaceOffset : i.roadway.railFaceOffset;
  const dfExt = { multi: lever(NL > 1, curbFace), single: lever(false, curbFace) };

  // Dead loads per girder (klf, kip). Without a deck, each load on the girder it sits on; with a
  // composite deck, the girder, deck and diaphragms on the girder (DC1) and the rest shared equally.
  const unitDL = (gi: number, withOverlay: boolean) => {
    const k = gi - 1;
    const ext = gi === 1 || gi === nU;
    const sec = section(u, geo[k].bf, ext && u.exteriorTrimmed && !u.layout ? 3 : 4);
    const self = (sec.A / 144) * (ld.concPcf / 1000);
    const diaph = ld.diaphragmKip;
    if (!deck) {
      // Without a deck each load sits on its unit: a sidewalk or curb on the exterior unit of its side
      // (side 1 on the first unit, side 2 on the last), the asphalt between the curb (or rail) faces.
      const asphaltW = ext ? geo[k].bf - curbFace : geo[k].bf;
      const asphalt = withOverlay ? (((asphaltW / 12) * ld.asphalt) / 12) * (ld.asphaltPcf / 1000) : 0;
      const rail = ext ? ld.railKlf : 0;
      const util = ld.utilities.filter((x) => x.unit === gi).reduce((s, x) => s + x.klf, 0);
      const side = gi === 1 ? sidewalks[0] : gi === nU && nU > 1 ? sidewalks[1] : undefined;
      const sidewalk = side ? ((side.width * side.thk) / 12) * 0.15 : 0; // 150 pcf concrete
      return { self, deck: 0, dc1: self, asphalt, rail, util, sidewalk, dc2: asphalt + sidewalk + rail + util, diaph, composite: false };
    }
    const deckW = (geo[k].bf / 12) * (deck.thk / 12) * (deck.pcf / 1000);
    const ctc = roadwayWidth(i);
    const asphaltTot = withOverlay ? ((ctc * ld.asphalt) / 12) * (ld.asphaltPcf / 1000) : 0;
    const swTot = sidewalks.reduce((a, s) => a + ((s.width * s.thk) / 12) * (deck.pcf / 1000), 0);
    const utilTot = ld.utilities.reduce((s, x) => s + x.klf, 0);
    const asphalt = asphaltTot / nU;
    const sidewalk = swTot / nU;
    const rail = (2 * ld.railKlf) / nU;
    const util = utilTot / nU;
    return { self, deck: deckW, dc1: self + deckW, asphalt, rail, util, sidewalk, dc2: asphalt + sidewalk + rail + util, diaph, composite: true };
  };

  const ov = i.options.dfOverride;
  const girders: {
    name: string;
    i: number;
    ext: boolean;
    sec: DtSection;
    csec: ReturnType<typeof compositeSec>;
    bf: number;
    S: number;
    dlSolve: ReturnType<typeof unitDL>;
    dlNow: ReturnType<typeof unitDL>;
    /** As inspected: the rating's distribution factors (each unit alone where the joints have failed). */
    dfMulti: number;
    dfSingle: number;
    /** As designed: the original design's, for the back-calculation. */
    dfMultiDesign: number;
    dfSingleDesign: number;
    /** The original design's factor, which sets the prestress: the era's rule for a multi-beam deck, else dfMultiDesign. */
    dfSolve: number;
    pedKlf: number;
    caseName: string;
    /** Interior: where the lever rule replaces the formula (BRM 1.3(E)). */
    lever: { single: boolean; multi: boolean } | null;
  }[] = [];
  // Failed joints change the rating's distribution, not the design's; an override (the rater's own) holds for both.
  const alone = !!i.condition?.jointsFailed && !ov;
  for (let gi = 1; gi <= nU; gi++) {
    const k = gi - 1;
    const ext = gi === 1 || gi === nU;
    const sec = section(u, geo[k].bf, ext && u.exteriorTrimmed && !u.layout ? 3 : 4);
    const dfI = ext ? null : dfInterior(k);
    const extDF = ext ? { multi: lever(NL > 1, curbFace, k).DF, single: lever(false, curbFace, k).DF } : null;
    const multiD = ov ? (ext ? ov.extMulti : ov.intMulti) : ext ? extDF!.multi : dfI!.multi;
    const singleD = ov ? (ext ? ov.extSingle : ov.intSingle) : ext ? extDF!.single : dfI!.single;
    girders.push({
      name: `G${gi}`,
      i: gi,
      ext,
      sec,
      csec: compositeSec(sec),
      bf: geo[k].bf,
      S: ext ? spacingAt(k === 0 ? 0 : k - 1) / 12 : dfI!.S,
      dlSolve: unitDL(gi, i.options.solveWithOverlay),
      dlNow: unitDL(gi, true),
      dfMulti: alone ? isolated(k, NL > 1, curbFace) : multiD,
      dfSingle: alone ? isolated(k, false, curbFace) : singleD,
      dfMultiDesign: multiD,
      dfSingleDesign: singleD,
      dfSolve: !ov && !ext && eraDF ? eraDF(k) : multiD,
      pedKlf: sidewalks.length ? pedKlf : 0,
      caseName: sidewalks.length ? (pedKlf > 0 ? "curb to curb, with pedestrians" : "curb to curb") : "",
      lever: dfI && !ov ? { single: dfI.leverSingle, multi: dfI.leverMulti } : null,
    });
  }
  if (mountable) {
    for (const gi of [1, nU]) {
      const k = gi - 1;
      const g0 = girders[k];
      girders.push({
        ...g0,
        name: `G${gi} (trucks on sidewalk)`,
        caseName: "trucks on the sidewalk, no pedestrians",
        dfMulti: alone ? isolated(k, NL > 1, i.roadway.railFaceOffset) : ov ? ov.extMulti : lever(NL > 1, i.roadway.railFaceOffset, k).DF,
        dfSingle: alone ? isolated(k, false, i.roadway.railFaceOffset) : ov ? ov.extSingle : lever(false, i.roadway.railFaceOffset, k).DF,
        dfMultiDesign: ov ? ov.extMulti : lever(NL > 1, i.roadway.railFaceOffset, k).DF,
        dfSingleDesign: ov ? ov.extSingle : lever(false, i.roadway.railFaceOffset, k).DF,
        dfSolve: ov ? ov.extMulti : lever(NL > 1, i.roadway.railFaceOffset, k).DF,
        pedKlf: 0,
      });
    }
  }
  return {
    girders,
    geo: { L, S_in, S_ft, bfExt, intOverhang, extOverhangOut, hs: u.depth - u.flangeThk, roadW, NL, units: geo, spacings: geo.slice(1).map((_, k) => spacingAt(k)), iTyp },
    secInt,
    secExt,
    csecInt: compositeSec(secInt),
    csecExt: compositeSec(secExt),
    nDeck,
    impact,
    era: eraRule ? { rule: eraRule, typical: nU >= 3 ? eraAt(iTyp) : null } : null,
    df: { int: dfInt, ext: dfExt, alone },
    ped: { sidewalks, pedWidth, pedPsf, pedKlf, mountable, curbFace },
  };
}

/** The cross-section's layout (the units across, the spacing, the roadway), without rating: for the drawing. */
export function dtLayout(i: DtInputs) {
  return buildGirders(i).geo;
}
export type DtLayout = ReturnType<typeof dtLayout>;

/** Moment and shear (kip·ft, kip) at x from a uniform w and a midspan point load P on a simple span. */
const dlAt = (w: number, P: number, L: number, x: number) => ({ M: (w * x * (L - x)) / 2 + (P * Math.min(x, L - x)) / 2, V: Math.abs(w * (L / 2 - x)) + (x < L / 2 ? P / 2 : x > L / 2 ? P / 2 : 0) });

/** Rates the bridge: the force or strands, then every vehicle, girder, point and check. */
export function rateDoubleTee(i: DtInputs) {
  const b = buildGirders(i);
  const { girders } = b;
  const u = i.units;
  const m = i.materials;
  const L = i.span;
  const deck = i.deck.present ? i.deck : null;
  if (!(m.aps > 0 && m.fpu > 0)) throw new DesignError("The strand needs an area and strength.");
  const vehicles = CDOT_VEHICLES;
  const I = b.impact;

  // Live load per wheel line at each point, for each vehicle (HS-20: truck or lane, whichever is more).
  const ext = Math.max(0, (i.structureLength - L) / 2); // ft the girder extends past each bearing
  const xsBase = Array.from({ length: 11 }, (_, k) => (k * L) / 10);
  const maxAt = Object.fromEntries(vehicles.map((v) => [v.name, trainMax(v, L)]));
  const lane = trainMax({ P: [], S: [] }, L); // placeholder for the shape
  void lane;
  const laneMid = laneAt(L, L / 2);
  const M_HS20 = Math.max(maxAt["HS-20"].M, laneMid.M); // the hand method's design moment (midspan lane)
  // The original design (BRM 1.7.2(A)): its design vehicle, truck or lane, sets the prestress.
  const orig = originalDesign(i.bridge.yearBuilt);
  if (i.prestress.mode === "back-calculate" && orig.vehicle === "HL-93") throw new DesignError(`Built in ${i.bridge.yearBuilt}: bridges from 2002 on were designed by LRFD to HL-93 (BRM 1.7.2(A)), so this LFR back-calculation doesn't apply. Give the strands, or rate it by LRFR.`);
  const dTruck = designTruck(orig.vehicle);
  const M_design = Math.max(trainMax(dTruck, L).M, laneMid.M * orig.scale);
  const llDesignCache = new Map<number, number>();
  const llDesignAt = (x: number) => {
    let M = llDesignCache.get(x);
    if (M === undefined) llDesignCache.set(x, (M = Math.max(trainAt(dTruck, L, x).M, laneAt(L, x).M * orig.scale)));
    return M;
  };
  const pois = (() => {
    const xs = [...xsBase];
    if (i.options.poi === "tenth-and-max") for (const v of vehicles) xs.push(maxAt[v.name].at);
    return [...new Set(xs.map((x) => +x.toFixed(4)))].sort((a, c) => a - c);
  })();
  const llCache = new Map<string, { M: number; V: number }>();
  const llAt = (v: Vehicle, x: number) => {
    const key = `${v.name}@${x}`;
    let r = llCache.get(key);
    if (!r) {
      const t = trainAt(v, L, x);
      if (v.cls === "design") {
        const ln = laneAt(L, x);
        t.M = Math.max(t.M, ln.M);
        t.V = Math.max(t.V, ln.V);
      }
      llCache.set(key, (r = t));
    }
    return r;
  };

  // Prestress and capacity for a strand area.
  const fpj = m.jackingRatio * m.fpu;
  // Losses: SSHB 9.16.2.1, item by item, on the typical interior girder at midspan (the section of
  // maximum moment), or the lump sum of 9.16.2.2. Itemized, they depend on the strands, so the
  // back-calculation works them out for each strand area it tries.
  const lossCache = new Map<number, ReturnType<typeof itemizedLosses>>();
  const lossesOf = (As: number) => {
    let l = lossCache.get(As);
    if (!l) lossCache.set(As, (l = itemizedLosses(i, girders.find((g) => !g.ext) ?? girders[0], As, cgAt(As, null), fpj, L, deck)));
    return l;
  };
  const fseOf = (As: number) => fpj - (i.options.losses === "itemized" ? lossesOf(As).total : i.options.lossLumpSum);
  const db = m.strand.includes("0.6") || m.strand.includes("6/10") ? 0.6 : m.strand.includes("7/16") ? 0.4375 : m.strand.includes("3/8") ? 0.375 : 0.5;
  const lt = (50 * db) / 12; // ft, transfer, SSHB 9.20.2.4
  // The strands' centroid above the bottom at x: straight, or harped (known strands from a standard).
  const harp = i.prestress.mode === "known" && i.prestress.harp ? i.prestress.harp : null;
  const cgAt = (As: number, x: number | null) => {
    if (!harp) return strandCG(As, m);
    if (x === null) return harp.mid;
    const r = Math.min(x, L - x) / (harp.at * L);
    return r >= 1 ? harp.mid : harp.end + (harp.mid - harp.end) * r;
  };
  // The inspection's damage at x on a unit (MBE 6.1.2): strand area lost over the zone and a development
  // length past each end of it (a broken or corroded strand re-anchors over that length, SSHB 9.28), the
  // top lost over the zone, the judgment factor everywhere. The strand centroid stays the intact one.
  const cond = i.condition ?? DT_DEFAULTS.condition;
  let ldDev = 0; // ft, set once the strands are known
  const damageAt = (gi: number, x: number | null) => {
    const c = cond.units.find((q) => q.unit === gi);
    if (!c || !unitDamaged(c)) return { lostArea: 0, topLoss: 0, factor: 1 };
    const xx = x ?? L / 2;
    const z = c.zone;
    const inZone = !z || (xx >= z.from - 1e-9 && xx <= z.to + 1e-9);
    const nearZone = !z || (xx >= z.from - ldDev - 1e-9 && xx <= z.to + ldDev + 1e-9);
    const lostArea = nearZone ? (c.lostStrands + (c.corrodedStrands * c.areaLoss) / 100) * m.aps : 0;
    return { lostArea, topLoss: inZone ? c.topLoss : 0, factor: c.factor > 0 && c.factor < 1 ? c.factor : 1 };
  };
  /** Mn (and the section) at x for strands As; asInspected: with the unit's damage. */
  /** devFactor: the development length multiplier, 1.6 in the rating (SSHB 9.28.1 with the 17th Edition errata), the original design's in the back-calculation. */
  const capacity = (g: Girder, As: number, x: number | null = null, asInspected = false, devFactor = 1.6) => {
    const cg = cgAt(As, x);
    const dmg = asInspected ? damageAt(g.i, x) : { lostArea: 0, topLoss: 0, factor: 1 };
    const AsE = Math.max(0, As - dmg.lostArea);
    const h = u.depth + (deck ? deck.thk : 0) - dmg.topLoss;
    const d = h - cg;
    const hf = u.flangeThk + (deck ? deck.thk : 0) - dmg.topLoss;
    const fcF = deck ? deck.fc : m.fc;
    const fsx = fseOf(As);
    // Eq. 9-17 holds only with fse ≥ 0.5 f′s (SSHB 9.17.4.1); below it, f*su by strain compatibility
    // where that is lower.
    const sc = fsx < 0.5 * m.fpu - 1e-9 && AsE > 0 ? strainCompat(AsE, g.sec, d, m, hf, fcF, fsx, Ec(m.fc), cg) : null;
    const eq = flexure(AsE, g.sec, d, m, hf, fcF);
    const scCap = sc && sc.fps < eq.fsu ? sc.fps : null;
    let cap: number | null = scCap;
    if (x !== null) {
      // Development (SSHB 9.28): fse over the transfer length, rising to f*su over the development length.
      const xe = Math.min(x, L - x) + ext; // ft from the girder's end
      const fsuFull = scCap ?? eq.fsu;
      const ld = (devFactor * (fsuFull - (2 / 3) * fsx) * db) / 12; // ft
      const dev = xe <= lt ? (fsx * xe) / lt : xe >= ld ? null : fsx + ((xe - lt) / Math.max(1e-9, ld - lt)) * (fsuFull - fsx);
      if (dev !== null) cap = cap === null ? dev : Math.min(cap, dev);
    }
    const f = flexure(AsE, g.sec, d, m, hf, fcF, cap);
    return { ...f, Mn: f.Mn * dmg.factor, MnSection: f.Mn, factor: dmg.factor, As: AsE, lostArea: As - AsE, cg, d, h, hf, fcFlange: fcF, sc, fsuEq: eq.fsu };
  };
  const D = (g: Girder, solve: boolean, x: number) => {
    const dl = solve ? g.dlSolve : g.dlNow;
    return dlAt(dl.dc1 + dl.dc2, dl.diaph, L, x);
  };
  const pedM = (g: Girder, x: number) => (g.pedKlf * x * (L - x)) / 2;
  const hs20 = vehicles.find((v) => v.cls === "design")!;

  // --- back-calculation (BRM 1.7.2(A)): As so the lowest HS-20 inventory flexure RF over girders and points is 1.0 ---
  const rfFlexInv = (g: Girder, As: number, x: number, solve: boolean) => {
    const C = capacity(g, As, x, false, orig.devFactor).Mn;
    const LL = llDesignAt(x) * g.dfSolve * (1 + I);
    if (LL <= 1e-9) return Infinity;
    return (C - 1.3 * D(g, solve, x).M - 2.17 * pedM(g, x)) / (2.17 * LL);
  };
  // The hand method: the largest HS-20 moment anywhere with the dead load at midspan.
  const rfFlexInvMid = (g: Girder, As: number) => (capacity(g, As).Mn - 1.3 * D(g, true, L / 2).M - 2.17 * pedM(g, L / 2)) / (2.17 * M_design * g.dfSolve * (1 + I));
  const rfSolve = (g: Girder, As: number) => (i.options.solveAt === "midspan" ? rfFlexInvMid(g, As) : Math.min(...pois.filter((x) => x > 0 && x < L).map((x) => rfFlexInv(g, As, x, true))));
  // The prestress is solved from the cases the original design would have used (trucks between the
  // curbs); trucks on a mountable sidewalk are then rated with it, not solved for (BRM 1.7.2(A)).
  const solveGirders = girders.filter((g) => !isSidewalkTruckCase(g.name));
  const minRF = (As: number) => Math.min(...solveGirders.map((g) => rfSolve(g, As)));
  let As: number;
  let AsExact = 0;
  let crackGoverns = false;
  let governs: "strength" | "cracking" | "tension" | "min-steel" = "strength";
  let serviceMet = true;
  let minSteelMet = true;
  const fr = ruptureModulus(m.fc);
  const transferAt = (x: number) => Math.min(1, (Math.min(x, L - x) + ext) / lt);
  /** Bottom stress (tension +, ksi) of girder g at x under the design vehicle and the design's dead load, strands As. */
  const designTension = (g: Girder, a: number, x: number) => {
    const sec = g.sec;
    const Sb2 = g.csec ? g.csec.Sb : sec.Sb;
    const P = fseOf(a) * a * transferAt(x);
    const e = sec.yb - cgAt(a, x);
    const dl = g.dlSolve;
    const M1 = dlAt(dl.dc1, dl.diaph, L, x).M;
    const M2 = dlAt(dl.dc2, 0, L, x).M;
    const LLm = llDesignAt(x) * g.dfSolve * (1 + I);
    return -P / sec.A - (P * e) / sec.Sb + (M1 * 12) / sec.Sb + ((M2 + pedM(g, x) + LLm) * 12) / Sb2;
  };
  /**
   * M*cr of SSHB 9.18.2.1 at x (kip·ft; midspan by default): (fr + fpe)Sc − Mdnc(Sc/Sb − 1),
   * fr = 7.5√f′c (9.15.2.3), fpe the effective prestress at the bottom at x, Mdnc the dead load on the
   * precast section alone at x.
   */
  const crackStar = (g: Girder, a: number, dl: Girder["dlNow"], P = fseOf(a) * a, x = L / 2) => {
    const sec = g.sec;
    const Sc = g.csec ? g.csec.Sb : sec.Sb;
    const e = sec.yb - cgAt(a, x);
    const fpe = P / sec.A + (P * e) / sec.Sb;
    const frS = (7.5 * Math.sqrt(m.fc * 1000)) / 1000;
    const Mdnc = dlAt(g.csec ? dl.dc1 : 0, g.csec ? dl.diaph : 0, L, x).M;
    return ((frS + fpe) * Sc - Mdnc * 12 * (Sc / sec.Sb - 1)) / 12;
  };
  const crack = girders.map((g) => ({ g: g.name, Mcr: (fr * (g.csec ? g.csec.Sb : g.sec.Sb)) / 12, MuReq: 1.3 * D(g, true, L / 2).M + 2.17 * (M_design * g.dfSolve * (1 + I) + pedM(g, L / 2)) }));
  let solveNote = "";
  if (i.prestress.mode === "known") {
    if (!(i.prestress.strands > 0)) throw new DesignError("Give the number of strands, or back-calculate them.");
    As = i.prestress.strands * m.aps;
    AsExact = As;
  } else {
    const maxCG = (u.depth - u.flangeThk) / 2; // the strand centroid stays in the stems' lower half
    let lo = 0.05;
    let hi: number | null = null;
    for (let a = 0.05; strandCG(a, m) <= maxCG; a += 0.01) {
      if (minRF(a) >= 1) {
        hi = a;
        break;
      }
      lo = a;
    }
    if (hi === null) throw new DesignError(`No prestress makes the ${orig.vehicle} design vehicle rate 1.0 at inventory: with strands filling the stems up to a centroid of ${maxCG.toFixed(1)} in, the best rating factor is ${minRF(lo).toFixed(3)}. These units can't carry it over a ${+L.toFixed(2)} ft span: check their depth and widths, the span and the loads.`);
    let top: number = hi;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + top) / 2;
      if (minRF(mid) < 1) lo = mid;
      else top = mid;
    }
    As = top;
    // BRM 1.7.2: the steel for the greater of the factored moment and the cracking moment.
    const solveCrack = crack.filter((c) => !isSidewalkTruckCase(c.g));
    crackGoverns = solveCrack.some((c) => c.Mcr > c.MuReq);
    if (crackGoverns) {
      let lo2 = 0.05;
      let hi2 = As * 3;
      for (let k = 0; k < 200; k++) {
        const mid = (lo2 + hi2) / 2;
        const ok = girders.every((g, j) => isSidewalkTruckCase(g.name) || capacity(g, mid).Mn >= Math.max(crack[j].Mcr, crack[j].MuReq));
        if (ok) hi2 = mid;
        else lo2 = mid;
      }
      As = hi2;
    }
    if (crackGoverns) governs = "cracking";
    // Raise the strands to the fewest for which ok holds; unmet if the stems fill first. A step-by-step
    // scan (a quarter strand at a time): more strands also raise their centroid, so a check such as the
    // service tension can improve and then get worse again.
    const raise = (ok: (a: number) => boolean) => {
      if (ok(As)) return true;
      let lo3 = As;
      let hi3 = As;
      for (;;) {
        hi3 += m.aps / 4;
        if (strandCG(hi3, m) > maxCG) return false;
        if (ok(hi3)) break;
        lo3 = hi3;
      }
      for (let k = 0; k < 60; k++) {
        const mid = (lo3 + hi3) / 2;
        if (ok(mid)) hi3 = mid;
        else lo3 = mid;
      }
      As = hi3;
      return true;
    };
    // The original design's service tension: 6√f′c at the bottom under the design vehicle, at every
    // point, with the design's dead load and distribution (SSHB 9.15.2.2; 1973 Art. 1.6.6(B)(2)).
    if (i.options.solveForService) {
      const before = As;
      serviceMet = raise((a) => solveGirders.every((g) => pois.filter((x) => x > 0 && x < L).every((x) => designTension(g, a, x) <= codeTension(m.fc) + 1e-9)));
      if (As > before + 1e-12) governs = "tension";
    }
    // Minimum steel: φMn ≥ 1.2 M*cr, or 1.33 times the factored moment (SSHB 9.18.2.1, 9.18.2.2; 1973 Art. 1.6.10(B)).
    if (i.options.minSteel12) {
      const before = As;
      minSteelMet = raise((a) => solveGirders.every((g) => capacity(g, a).Mn >= Math.min(1.2 * crackStar(g, a, g.dlSolve), 1.33 * crack.find((c) => c.g === g.name)!.MuReq) - 1e-9));
      if (As > before + 1e-12) governs = "min-steel";
    }
    AsExact = As;
    if (i.options.roundStrands) As = Math.ceil(AsExact / m.aps - 1e-9) * m.aps;
    solveNote = i.options.roundStrands ? "whole strands; the jacking force rounded down to the kip" : "the exact force";
  }
  const nStrands = As / m.aps;
  const Pj = i.prestress.mode === "back-calculate" && i.options.roundStrands ? Math.floor(fpj * As + 1e-9) : fpj * As; // 1e-9: 15 × 0.144 × 175 is 378, not 377.99…
  const cg = cgAt(As, null);
  const fse = fseOf(As);
  const Pe = fse * As;
  const losses = i.options.losses === "itemized" ? lossesOf(As) : null;
  /**
   * Release (SSHB 9.15.2.1), a flag only: just after transfer, on the casting bed over the girder's own
   * length, the top tension (≤ 7.5√f′ci with bonded reinforcement) and the bottom compression
   * (≤ 0.60 f′ci), at the end of the transfer length and at midspan, on the typical interior unit. The
   * prestress just after transfer is taken as 0.63 f′s (stress-relieved) or 0.69 f′s (low-relaxation),
   * in proportion to the jacking stress (9.16.2.1.2).
   */
  const release = (() => {
    const g0 = girders.find((g) => !g.ext) ?? girders[0];
    const sec = g0.sec;
    const Lm = i.structureLength;
    const fi = fpj * (m.lowRelaxation ? 0.69 / 0.75 : 0.63 / 0.7);
    const w = g0.dlNow.self;
    const at = (xm: number) => {
      const xb = Math.max(0, Math.min(L, xm - ext)); // from the bearing, for the strand centroid
      const P = fi * As * Math.min(1, Math.min(xm, Lm - xm) / lt);
      const e = sec.yb - cgAt(As, xb);
      const Mg = (w * xm * (Lm - xm)) / 2;
      return { x: xm, top: -P / sec.A + (P * e) / sec.St - (Mg * 12) / sec.St, bottom: P / sec.A + (P * e) / sec.Sb - (Mg * 12) / sec.Sb };
    };
    const pts = [at(Math.min(lt, Lm / 2)), at(Lm / 2)];
    const topLim = (7.5 * Math.sqrt(m.fci * 1000)) / 1000;
    const botLim = 0.6 * m.fci;
    const top = pts.reduce((a, c) => (c.top > a.top ? c : a));
    const bottom = pts.reduce((a, c) => (c.bottom > a.bottom ? c : a));
    return { fi, top, bottom, topLim, botLim, ok: top.top <= topLim + 1e-9 && bottom.bottom <= botLim + 1e-9 };
  })();
  {
    const hD = u.depth + (deck ? deck.thk : 0);
    const full = flexure(As, b.secInt, hD - cg, m, u.flangeThk + (deck ? deck.thk : 0), deck ? deck.fc : m.fc);
    ldDev = (1.6 * (full.fsu - (2 / 3) * fse) * db) / 12;
  }
  for (const c of cond.units) {
    if (!unitDamaged(c)) continue;
    if (!(c.unit >= 1 && c.unit <= u.count)) throw new DesignError(`The condition names unit ${c.unit}; the bridge has units 1 to ${u.count}.`);
    if (c.lostStrands + c.corrodedStrands > nStrands + 1e-9) throw new DesignError(`Unit ${c.unit}: ${c.lostStrands + c.corrodedStrands} damaged strands, but the unit has ${+nStrands.toFixed(2)}.`);
    if (c.topLoss >= u.flangeThk + (deck ? deck.thk : 0)) throw new DesignError(`Unit ${c.unit}: the top loss is the whole flange.`);
    if (c.factor < 1 && !c.note.trim()) throw new DesignError(`Unit ${c.unit}: a judgment factor needs its reason from the inspection.`);
    if (c.zone && !(c.zone.to >= c.zone.from)) throw new DesignError(`Unit ${c.unit}: the damage zone ends before it starts.`);
  }

  // --- ratings at every point, every girder, every vehicle ---
  const fy = m.lowRelaxation ? 0.9 * m.fpu : 0.85 * m.fpu; // f*y
  const np = EP / Ec(m.fc);
  const transfer = (x: number) => Math.min(1, (Math.min(x, L - x) + ext) / lt);
  const ignoreT = tensionIgnored(i);
  /** info: computed and reported, but not a rating (the final tension on a back-calculated prestress). */
  type PointResult = { x: number; check: RatingCheck; inv: number; opr: number | null; C: number; Dl: number; LL: number; info?: true; k?: { inv: number; opr: number; Mcr: number } };
  /** intact: as designed (the section and distribution before the inspection's findings), for the comparison. */
  const rateGirder = (g: Girder, v: Vehicle, intact = false, devFactor = 1.6) => {
    const design = v.cls === "design";
    const [dfM, dfS] = intact ? [g.dfMultiDesign, g.dfSingleDesign] : [g.dfMulti, g.dfSingle];
    const df = design ? dfM : legalLanes(i) === "single" ? dfS : dfM;
    const out: PointResult[] = [];
    const sec = g.sec;
    const cs = g.csec;
    for (const x of pois) {
      if (x <= 1e-9 || x >= L - 1e-9) continue;
      const cgx = cgAt(As, x);
      const e = sec.yb - cgx;
      const ll = llAt(v, x);
      const LLm = ll.M * df * (1 + I);
      const dl = g.dlNow;
      const M1 = dlAt(dl.dc1, dl.diaph, L, x).M; // on the girder alone (with a deck), or all (without)
      const M2 = dlAt(dl.dc2, 0, L, x).M;
      const Dm = M1 + M2;
      const Mp = pedM(g, x);
      // Flexure, strength.
      const cap = capacity(g, As, x, !intact, devFactor);
      // Minimum steel in the rating (MBE 6B.5.3.3, the owner's option): where φMn < 1.2 M*cr, φMn is
      // scaled by k, the larger of φMn/(1.2 M*cr) and φMn/(1.33 Mu), Mu the factored moment of the level.
      const mcr = i.options.minSteel12 ? crackStar(g, As, dl, fse * cap.As * transfer(x), x) : Infinity;
      const kAt = (Mu: number) => (!i.options.minSteel12 || cap.Mn >= 1.2 * mcr ? 1 : Math.min(1, Math.max(cap.Mn / (1.2 * mcr), cap.Mn / (1.33 * Mu))));
      const kInv = kAt(1.3 * Dm + 2.17 * (LLm + Mp));
      const kOpr = kAt(1.3 * Dm + 1.3 * (LLm + Mp));
      out.push({ x, check: "flexure", inv: (kInv * cap.Mn - 1.3 * Dm - 2.17 * Mp) / (2.17 * LLm), opr: (kOpr * cap.Mn - 1.3 * Dm - 1.3 * Mp) / (1.3 * LLm), C: kInv * cap.Mn, Dl: Dm, LL: LLm, ...(kInv < 1 || kOpr < 1 ? { k: { inv: kInv, opr: kOpr, Mcr: mcr } } : {}) });
      // Service, prestressed concrete (MBE 6B.5.3.3); stresses ksi, tension + at the bottom, compression + at the top.
      const P = fse * cap.As * transfer(x); // the strands left
      const Sb2 = cs ? cs.Sb : sec.Sb;
      const St2 = cs ? cs.St : sec.St;
      const k12 = 12;
      const fbD = -P / sec.A - (P * e) / sec.Sb + (M1 * k12) / sec.Sb + ((M2 + Mp) * k12) / Sb2;
      const fbL = (LLm * k12) / Sb2;
      // Inventory only (MBE 6B.5.3.3). Ignored: at the code limit, for information.
      const ftLim = ignoreT ? codeTension(m.fc) : finalTension(i);
      out.push({ x, check: "tension", inv: (ftLim - fbD) / fbL, opr: null, C: ftLim, Dl: fbD, LL: fbL, ...(ignoreT ? { info: true as const } : {}) });
      const ftD = P / sec.A - (P * e) / sec.St + (M1 * k12) / sec.St + ((M2 + Mp) * k12) / St2;
      const ftL = (LLm * k12) / St2;
      out.push({ x, check: "compression", inv: (0.6 * m.fc - ftD) / ftL, opr: null, C: 0.6 * m.fc, Dl: ftD, LL: ftL });
      out.push({ x, check: "compression-ll", inv: (0.4 * m.fc - 0.5 * ftD) / ftL, opr: null, C: 0.4 * m.fc, Dl: 0.5 * ftD, LL: ftL });
      if (cs && deck) {
        // The deck's own stress: n × the transformed section's.
        const fdD = (cs.n * (M2 + Mp) * k12) / cs.Sd;
        const fdL = (cs.n * LLm * k12) / cs.Sd;
        out.push({ x, check: "deck-compression", inv: (0.4 * deck.fc - fdD) / fdL, opr: null, C: 0.4 * deck.fc, Dl: fdD, LL: fdL }); // 0.4f′c, as BrR
      }
      // Strand stress: the effective stress plus n × the concrete stress at the strands (tension +).
      const ycg2 = cs ? cs.yb - cgx : sec.yb - cgx;
      const fcgsD = -P / sec.A - (P * e * e) / sec.I + (M1 * k12 * e) / sec.I + ((M2 + Mp) * k12 * ycg2) / (cs ? cs.I : sec.I);
      const fcgsL = (LLm * k12 * ycg2) / (cs ? cs.I : sec.I);
      const Fs = fse * transfer(x) + np * fcgsD;
      const FsL = np * fcgsL;
      out.push({ x, check: "strand", inv: (0.8 * fy - Fs) / FsL, opr: (0.9 * fy - Fs) / FsL, C: 0.8 * fy, Dl: Fs, LL: FsL });
      // Shear (SSHB 9.20), when it isn't waived: from h/2 to midspan.
      if (i.options.checkShear && Math.min(x, L - x) * 12 >= (cap.h / 2) && x <= L / 2 + 1e-9) {
        const sh = shearAt(g, x, ll.V * df * (1 + I), dlAt(dl.dc1 + dl.dc2, dl.diaph, L, x), P, cap.h, cap.d, LLm, cgx);
        sh.phiVn *= cap.factor;
        out.push({ x, check: "shear", inv: (sh.phiVn - 1.3 * sh.Vd) / (2.17 * sh.VL), opr: (sh.phiVn - 1.3 * sh.Vd) / (1.3 * sh.VL), C: sh.phiVn, Dl: sh.Vd, LL: sh.VL });
      }
    }
    const rated = out.filter((c) => !c.info);
    const inv = rated.reduce((a, c) => (c.inv < a.inv ? c : a));
    const tInfo = out.filter((c) => c.info).reduce<PointResult | null>((a, c) => (!a || c.inv < a.inv ? c : a), null);
    const oprList = out.filter((c) => c.opr !== null) as (PointResult & { opr: number })[];
    const opr = oprList.reduce((a, c) => (c.opr < a.opr ? c : a));
    const flex = out.filter((c) => c.check === "flexure");
    const flexInv = flex.reduce((a, c) => (c.inv < a.inv ? c : a));
    const flexOpr = flex.reduce((a, c) => (c.opr! < a.opr! ? c : a));
    return { g: g.name, df, inv, opr, flexInv, flexOpr, tInfo, points: out };
  };
  const shearAt = (g: Girder, x: number, VL: number, dl: { M: number; V: number }, P: number, h: number, d: number, MLL: number, cg: number) => {
    // Vci = 0.6√f'c b'd + Vd + Vi·Mcr/Mmax; Vcw = (3.5√f'c + 0.3 fpc) b'd + Vp; Vs = Av fy d/s (≤ 8√f'c b'd); φ = 0.90.
    const sq = Math.sqrt(m.fc * 1000) / 1000;
    const dd = Math.max(d, 0.8 * h);
    const bw = g.sec.bw;
    const sec = g.sec;
    const cs = g.csec;
    const Sb2 = cs ? cs.Sb : sec.Sb;
    const fpe = P / sec.A + (P * (sec.yb - cg)) / sec.Sb; // at the bottom
    const fd = (dl.M * 12) / sec.Sb;
    const Mcr = (Sb2 * (6 * sq + fpe - fd)) / 12; // kip·ft
    const Vi = VL;
    const Mmax = Math.max(MLL, 1e-6);
    const Vci = Math.max(0.6 * sq * bw * dd + dl.V + (Vi * Mcr) / Mmax, 1.7 * sq * bw * dd);
    const fpc = cs ? P / sec.A - (P * (sec.yb - cg) * (sec.yb - cs.yb)) / sec.I + ((dl.M * 12) * (cs.yb - sec.yb)) / sec.I : P / sec.A;
    const Vcw = (3.5 * sq + 0.3 * fpc) * bw * dd;
    const Vc = Math.min(Vci, Vcw);
    const st = i.options.stirrups;
    const Av = 2 * st.legs * (BAR_AREA[st.bar] ?? 0.11); // two stems
    const Vs = Math.min((Av * st.fy * dd) / st.spacing, 8 * sq * bw * dd);
    void x;
    return { Vci, Vcw, Vc, Vs, phiVn: 0.9 * (Vc + Vs), Vd: dl.V, VL, Mcr, dd };
  };

  const ratings = vehicles.map((v) => {
    const per = girders.map((g) => rateGirder(g, v));
    const govInv = per.reduce((a, c) => (c.inv.inv < a.inv.inv ? c : a));
    const govOpr = per.reduce((a, c) => (c.opr.opr < a.opr.opr ? c : a));
    const t = tons(v);
    // The lowest final tension for information (tension ignored), with its girder.
    const tInfo = per.filter((p) => p.tInfo).reduce<{ g: string; pt: NonNullable<(typeof per)[number]["tInfo"]> } | null>((a, p) => (!a || p.tInfo!.inv < a.pt.inv ? { g: p.g, pt: p.tInfo! } : a), null);
    return { name: v.name, cls: v.cls, tons: t, per, govInv, govOpr, tInfo, invTons: govInv.inv.inv * t, oprTons: govOpr.opr.opr * t, posting: "" };
  });
  const postings = postAll(ratings.map((v) => ({ name: v.name, cls: v.cls, tons: v.tons, rf: v.govOpr.opr.opr })), i.bridge.nearInterstate);
  ratings.forEach((v, k) => (v.posting = postings[k]));
  // As designed, beside as inspected: what the inspection's findings cost (only when there are any).
  const active = conditionActive(cond);
  const asDesigned = active
    ? vehicles.map((v) => {
        const per = girders.map((g) => rateGirder(g, v, true));
        const gi = per.reduce((a, c) => (c.inv.inv < a.inv.inv ? c : a));
        const go = per.reduce((a, c) => (c.opr.opr < a.opr.opr ? c : a));
        return { name: v.name, cls: v.cls, inv: gi.inv.inv, invG: gi.g, opr: go.opr.opr, oprG: go.g, posting: "" };
      })
    : null;
  if (asDesigned) {
    const p = postAll(asDesigned.map((v, k) => ({ name: v.name, cls: v.cls, tons: tons(vehicles[k]), rf: v.opr })), i.bridge.nearInterstate);
    asDesigned.forEach((v, k) => (v.posting = p[k]));
  }
  // Each damaged unit's capacity at midspan, intact and as inspected.
  const conditionUnits = cond.units
    .filter((c) => unitDamaged(c) && c.unit >= 1 && c.unit <= u.count)
    .map((c) => {
      const g = girders[c.unit - 1];
      const at = c.zone ? Math.min(L, Math.max(0, (c.zone.from + c.zone.to) / 2)) : L / 2;
      return { ...c, g: g.name, at, intact: capacity(g, As, at), inspected: capacity(g, As, at, true) };
    });
  /** The inspection's damage on a girder (by name) at x, or null where there is none. */
  const damageOf = (gName: string, x: number) => {
    const g = girders.find((q) => q.name === gName);
    const dm = g ? damageAt(g.i, x) : null;
    return dm && (dm.lostArea > 0 || dm.topLoss > 0 || dm.factor < 1) ? dm : null;
  };

  /** HS-20 inventory in flexure with the development length of the original design, beside the rating's (1.6, the errata): what the current rule costs. */
  const devCompare = () => {
    if (orig.devFactor >= 1.6) return null;
    const hsR = ratings.find((v) => v.cls === "design")!;
    const rated = Math.min(...hsR.per.map((p) => p.flexInv.inv));
    const withOriginal = Math.min(...girders.map((g) => rateGirder(g, hs20, false, orig.devFactor).flexInv.inv));
    return { rated, withOriginal };
  };

  // --- the hand method at midspan (absolute maximum live load moment with the midspan dead load), as a check ---
  const midspan = vehicles.map((v) => {
    const design = v.cls === "design";
    const Mw = design ? M_HS20 : maxAt[v.name].M;
    const per = girders.map((g) => {
      const df = design ? g.dfMulti : legalLanes(i) === "single" ? g.dfSingle : g.dfMulti;
      const C = capacity(g, As, null, true).Mn;
      const Dm = D(g, false, L / 2).M;
      const Mp = pedM(g, L / 2);
      const LL = Mw * df * (1 + I);
      return { g: g.name, C, C0: capacity(g, As).Mn, D: Dm, LL, ped: Mp, df, inv: (C - 1.3 * Dm - 2.17 * Mp) / (2.17 * LL), opr: (C - 1.3 * Dm - 1.3 * Mp) / (1.3 * LL) };
    });
    const gov = per.reduce((a, c) => (c.opr < a.opr ? c : a));
    const govInv = per.reduce((a, c) => (c.inv < a.inv ? c : a));
    return { name: v.name, cls: v.cls, tons: tons(v), Mw, at: maxAt[v.name].at, per, gov, govInv };
  });

  const govSolve = girders
    .filter((g) => !isSidewalkTruckCase(g.name))
    .map((g) => ({ g, rf: rfSolve(g, As) }))
    .reduce((a, c) => (c.rf < a.rf ? c : a));
  const capMid = capacity(govSolve.g, As);
  return {
    ...b,
    vehicles,
    pois,
    lt,
    ext,
    M_HS20,
    laneMid,
    maxAt,
    fr,
    crack,
    solve: { mode: i.prestress.mode, As, AsExact, nStrands, nExact: AsExact / m.aps, Pj, Pe, fpj, fse, losses, fsuValid: fse >= 0.5 * m.fpu - 1e-9, sc: capMid.sc, governs, serviceMet, minSteelMet, release, cg, d: capMid.d, gov: govSolve.g.name, govRF: govSolve.rf, crackGoverns, note: solveNote, cap: capMid },
    fy,
    np,
    ratings,
    midspan,
    condition: { active, ldDev, alone: b.df.alone, asDesigned, units: conditionUnits, damageOf },
    shearRequired: i.options.checkShear ? [] : shearRequired(i),
    original: { ...orig, devCompare: devCompare() },
    restricted: postings.some((p) => p === RESTRICTED),
  };
}

export type DtRating = ReturnType<typeof rateDoubleTee>;

/**
 * The distribution the legal and permit vehicles are rated with: multi-lane for a bridge built after
 * 1985 (BRM 1.3(C)); for one built in 1985 or earlier the single-lane factor may be used (BRM 1.3(D)),
 * as the rater chooses.
 */
export const legalLanes = (i: Pick<DtInputs, "bridge" | "options">): "single" | "multi" => (i.bridge.yearBuilt > 1985 ? "multi" : i.options.legalLldf);

/**
 * The original design's rules by the year built, taken as the year it was designed: CDOT's design
 * vehicles (BRM 1.7.2(A): H20 before 1944, HS20 to 1993, HS25 1994 to 2001, HL-93 from 2002). The
 * strands are developed over (f*su − ⅔fse)D in every era, without the 1.6 multiplier: FHWA required it
 * from October 1988, but a bridge designed after that without it would have fewer strands than a
 * back-calculation with it gives, so leaving it out keeps the back-calculation on the safe side.
 */
export function originalDesign(year: number) {
  const vehicle = year < 1944 ? "H20" : year <= 1993 ? "HS20" : year <= 2001 ? "HS25" : "HL-93";
  return { vehicle, scale: vehicle === "HS25" ? 1.25 : 1, devFactor: 1 } as const;
}
/** The design truck, wheel-line loads (kip) and spacings (ft) (SSHB 3.7): H20, HS20 (the HS-20 of the vehicles), HS25 at 1.25 × HS20. */
export function designTruck(v: ReturnType<typeof originalDesign>["vehicle"]): Pick<Vehicle, "P" | "S"> {
  const hs = CDOT_VEHICLES.find((x) => x.cls === "design")!;
  if (v === "H20") return { P: [4, 16], S: [14] };
  if (v === "HS25") return { P: hs.P.map((p) => p * 1.25), S: hs.S };
  return hs;
}

/**
 * The multi-beam distribution in force when a bridge was designed, taken from the year built:
 * - "slab", to 1977: the 9th to 11th Editions (1965–1973) gave multi-beam decks the slab rule, each
 *   wheel over E = 4 + 0.06L ≤ 7 ft (1973, 1.3.2(C), Case B); earlier, there was no rule, and this one
 *   is used;
 * - "1977", 1978 to 1986: the 12th Edition's formula (NCHRP Report 83), an effective spacing (12NL + 9)/Ng over
 *   D = 5 + NL/10 + (3 − 2NL/7)(1 − C/3)² (C ≤ 3), 5 + NL/10 (C > 3);
 * - "current", from 1987: today's S/D (NCHRP Report 287, 1986; in the 16th Edition, 1996, at the
 *   latest; the edition that adopted it isn't established).
 */
export function multiBeamEra(year: number): "slab" | "1977" | "current" {
  return year <= 1977 ? "slab" : year <= 1986 ? "1977" : "current";
}

/**
 * Prestress losses item by item (SSHB 9.16.2.1, pretensioned, ksi), on girder g at midspan, the
 * section of maximum moment, with strands As at centroid cg (in above the bottom):
 * - shrinkage SH = 17 − 0.150 RH (Eq. 9-4);
 * - elastic shortening ES = (Es/Eci) fcir (Eq. 9-6), Es = 28,000 ksi, Eci = 33 w^1.5 √f′ci; fcir
 *   from the prestress just after transfer, taken as 0.63 f′s (stress-relieved) or 0.69 f′s
 *   (low-relaxation) as the article allows, in proportion to the jacking stress, with the girder's
 *   own weight;
 * - creep CRc = 12 fcir − 7 fcds (Eq. 9-9), fcds from the dead loads added after transfer;
 * - relaxation CRs = 20 − 0.4 ES − 0.2 (SH + CRc) for stress-relieved strand (Eq. 9-10), or
 *   5 − 0.10 ES − 0.05 (SH + CRc) for low-relaxation (Eq. 9-10A).
 * Also the 1973 estimate (Art. 1.6.7(B)) for comparison: SH by humidity band, ES = 7 fcr, CRc =
 * 16 fcd (fcd with the prestress after losses and all dead load), CRs = 20 − 0.125 (SH + ES + CRc).
 */
export function itemizedLosses(i: DtInputs, g: Pick<Girder, "sec" | "csec" | "dlNow">, As: number, cg: number, fpj: number, L: number, deck: DtInputs["deck"] | null) {
  const m = i.materials;
  const s = g.sec;
  const e = s.yb - cg;
  const dl = g.dlNow;
  const RH = i.options.humidity;
  const fi = fpj * (m.lowRelaxation ? 0.69 / 0.75 : 0.63 / 0.7);
  const Pi = fi * As;
  const Mg = (dl.self * L * L) / 8; // kip·ft
  const fcir = Pi / s.A + (Pi * e * e) / s.I - (Mg * 12 * e) / s.I;
  // Dead load added after transfer: on the precast section (the deck, diaphragms, and without a deck
  // everything else) and, with a composite deck, the rest on the composite section.
  const Mpre = ((deck ? dl.deck : dl.dc2) * L * L) / 8 + (dl.diaph * L) / 4;
  const Mcomp = deck ? (dl.dc2 * L * L) / 8 : 0;
  const cs = g.csec;
  const fcds = (Mpre * 12 * e) / s.I + (cs ? (Mcomp * 12 * (cs.yb - cg)) / cs.I : 0);
  const Eci = (33 * 145 ** 1.5 * Math.sqrt(m.fci * 1000)) / 1000; // ksi, normal-weight concrete (145 pcf), as for Ec
  const SH = 17 - 0.15 * RH;
  const ES = (28000 / Eci) * fcir;
  const CRc = Math.max(0, 12 * fcir - 7 * fcds);
  const CRs = Math.max(0, m.lowRelaxation ? 5 - 0.1 * ES - 0.05 * (SH + CRc) : 20 - 0.4 * ES - 0.2 * (SH + CRc));
  const total = SH + ES + CRc + CRs;
  // 1973 (Art. 1.6.7(B)).
  const Pe = (fpj - total) * As;
  const Mall = ((dl.dc1 + (deck ? 0 : dl.dc2)) * L * L) / 8 + (dl.diaph * L) / 4;
  const fcd = Pe / s.A + (Pe * e * e) / s.I - (Mall * 12 * e) / s.I - (cs ? (Mcomp * 12 * (cs.yb - cg)) / cs.I : 0);
  const SH73 = RH >= 75 ? 5 : RH >= 25 ? 10 : 15;
  const ES73 = 7 * fcir;
  const CRc73 = 16 * Math.max(0, fcd);
  const CRs73 = 20 - 0.125 * (SH73 + ES73 + CRc73);
  return {
    RH, fi, Pi, Mg, fcir, Mpre, Mcomp, fcds, Eci, SH, ES, CRc, CRs, total,
    y1973: { SH: SH73, ES: ES73, CRc: CRc73, CRs: CRs73, fcd, total: SH73 + ES73 + CRc73 + CRs73 },
  };
}

/** The roadway between the curbs (between the rail faces without curbs), ft: where the lanes go (SSHB 3.6.2). */
export const roadwayWidth = (i: Pick<DtInputs, "roadway">) => i.roadway.curbToCurb || i.roadway.railToRail - (2 * i.roadway.railFaceOffset) / 12;

/** Design lanes on a roadway (SSHB 3.6.3): 12 ft lanes, no fractions, but two lanes on a roadway of 20 to 24 ft. */
export const designLanes = (w: number) => (w >= 20 && w <= 24 ? 2 : Math.max(1, Math.floor(w / 12 + 1e-9)));

/** Why shear must be rated (BRM 1.4(M), 1.4(O)); empty where the waiver may apply (with the Bridge Rating Engineer's approval). */
export function shearRequired(i: Pick<DtInputs, "bridge">): string[] {
  const out: string[] = [];
  if (i.bridge.yearBuilt > 2001) out.push(`built in ${i.bridge.yearBuilt}, after December 2001 (BRM 1.4(M))`);
  if (i.bridge.nbiSuper < 5) out.push(`superstructure condition ${i.bridge.nbiSuper}, under 5 (BRM 1.4(O))`);
  if (i.bridge.loadInducedDistress) out.push("visible signs of shear distress (BRM 1.4(O))");
  return out;
}

export const RESTRICTED = "Restrict all legal loads";
/** A rating in tons as posted: truncated to 0.1 T (BRM 1.15.1). */
export const postTons = (t: number) => Math.floor(t * 10 + 1e-9) / 10;

/**
 * CDOT's posting rules (BRM 1.15.1), for every vehicle at once (they depend on each other):
 * - only the legal loads are posted: the Colorado legal trucks, SU4 to SU7, and the emergency vehicles
 *   within 1 mile of an Interstate (reasonable access);
 * - SU4 to SU7 aren't posted when the NRL rates 40 tons or more;
 * - an operating rating factor of 0.95 or more is exempt (the 95% rule);
 * - none is posted at or above its weight limit (Tables 1-4 to 1-6, non-Interstate roads; SU6 and SU7
 *   by the Colorado Bridge Formula);
 * - a legal load's operating rating factor under 0.3 restricts all legal loads.
 */
export function postAll(list: { name: string; cls: VehicleClass; tons: number; rf: number }[], nearInterstate: boolean): string[] {
  const nrl = list.find((v) => v.name === "NRL");
  const nrlOk = !!nrl && nrl.rf >= 1;
  const posted = (v: (typeof list)[number]) => (v.cls === "legal" || (v.cls === "su" && v.name !== "NRL") || (v.cls === "ev" && nearInterstate));
  const restrict = list.some((v) => posted(v) && !(v.cls === "su" && nrlOk) && v.rf < 0.3);
  return list.map((v) => {
    if (v.cls === "design" || v.cls === "permit") return "—";
    if (v.name === "NRL") return v.rf >= 1 ? "No SU posting (40 T or more)" : "Rate SU4–SU7";
    if (v.cls === "ev" && !nearInterstate) return "N/A (more than 1 mi from an Interstate)";
    if (v.cls === "su" && nrlOk) return "Not required (NRL 40 T or more)";
    if (restrict) return RESTRICTED;
    if (v.rf >= 1.0) return "No posting";
    if (v.rf >= 0.95) return "Exempt (95% rule)";
    const lim = POSTING_LIMIT[v.name];
    const limit = lim ? (v.cls === "ev" ? lim.interstate : lim.state) : null;
    if (limit !== null && postTons(v.rf * v.tons) >= limit) return "No posting (at the weight limit)";
    return "Posting required";
  });
}
/** Whether a posting result calls for a sign or a restriction. */
export const needsPosting = (p: string) => p === "Posting required" || p === RESTRICTED;

/**
 * The rating scripts' notes credit methods to people by name ("Someone's rule", "Someone's sheet");
 * the tool names no one, so those credits are reworded on import.
 */
const NAME = "[A-Z][a-z]+";
const NAME_CREDITS: [RegExp, string][] = [
  [new RegExp(`${NAME}/${NAME} BrR models`, "g"), "CDOT's sample BrR models"],
  [new RegExp(`${NAME}'s era table`, "g"), "the BRM era table"],
  [new RegExp(`${NAME}'s sheet`, "g"), "the reference sheet"],
  [new RegExp(`${NAME}'s (TELLRD-PINE ST|B-17-DL) model`, "g"), "the $1 sample model"],
  [new RegExp(`${NAME}'s approach, more conservative`, "g"), "the more conservative approach"],
  [new RegExp(`\\(${NAME} / BrR\\)`, "g"), "(BrR)"],
  [new RegExp(`${NAME}'s rule`, "g"), "the two-model rule"],
  [new RegExp(`${NAME}'s (No[- ]Plans|No[- ]Deck|model|checklist|setup)`, "g"), "the reference $1"],
  [new RegExp(` \\(${NAME}\\)(?=[.,;]|$)`, "g"), ""],
  // Background material isn't cited either: only the design codes are.
  [/CDOT's sample BrR models?/g, "CDOT's double-tee ratings"],
  [/ ?\((?:also )?used in the [\w.-]+ BrR model\)/g, ""],
  [/ ?\(the (?:[\w.-]+ ST )?(?:TELLRD-PINE ST )?sample model\)/g, ""],
  [/ \(the reference sheet\)/g, ""],
  [/\(the reference sheet used ([^)]*)\)/g, "(earlier ratings used $1)"],
];
export function neutralNote(t: string) {
  return NAME_CREDITS.reduce((s, [re, to]) => s.replace(re, to), t);
}

/* eslint-disable @typescript-eslint/no-explicit-any -- an untyped JSON file from the rating scripts */
/** A bridge input file of the rating scripts (snake_case JSON) as this tool's inputs; its "_" notes become the sources. */
export function dtInputsFromBridgeFile(b: Record<string, any>): DtInputs {
  const notes: Record<string, string> = {};
  (function walk(o: Record<string, any>, p: string) {
    for (const [k, v] of Object.entries(o)) {
      if (k.startsWith("_") && typeof v === "string") notes[`${p}${k.slice(1)}`] = neutralNote(v);
      else if (k === "_sources" && v && typeof v === "object") for (const [a, s] of Object.entries(v)) notes[`source.${a}`] = neutralNote(String(s));
      else if (v && typeof v === "object" && !Array.isArray(v)) walk(v, `${p}${k}.`);
    }
  })(b, "");
  const u = b.units ?? {};
  const ld = b.loads ?? {};
  const m = b.materials ?? {};
  const o = b.options ?? {};
  const rw = b.roadway ?? {};
  const d = DT_DEFAULTS;
  return {
    bridge: { id: b.id ?? "", facility: b.facility ?? "", feature: b.feature ?? "", owner: b.owner ?? "", yearBuilt: b.year_built ?? d.bridge.yearBuilt, nbiSuper: b.nbi_super ?? 6, loadInducedDistress: !!b.load_induced_distress, nearInterstate: !!b.within_1mi_of_interstate, inspection: b._sources?.sia ?? "", rater: b.rater ?? "", checker: b.checker ?? "" },
    span: b.span_ft,
    structureLength: b.structure_length_ft ?? b.span_ft,
    numSpans: b.num_spans ?? 1,
    skew: b.skew_deg ?? 0,
    units: {
      count: u.count,
      spacing: u.spacing_in,
      flangeWidth: u.flange_width_in,
      depth: u.depth_in,
      flangeThk: u.flange_thk_in,
      stemSpacing: u.stem_spacing_in,
      stemTop: u.stem_top_in,
      stemBot: u.stem_bot_in,
      fillet: u.fillet_in ?? 0,
      exteriorTrimmed: !!u.exterior_trimmed_flush,
      layout: Array.isArray(u.layout) ? u.layout.map((x: Record<string, number>) => ({ flangeWidth: x.flange_width_in, stemSpacing: x.stem_spacing_in })) : null,
      jointGap: u.joint_gap_in ?? 0,
    },
    deck: b.deck ? { present: true, thk: b.deck.thk_in, fc: b.deck.fc_ksi, pcf: b.deck.pcf ?? 150 } : { ...d.deck, present: false },
    roadway: { railToRail: rw.rail_to_rail_ft, railFaceOffset: rw.rail_face_offset_in, curbToCurb: rw.curb_to_curb_ft ?? 0, curbFaceOffset: rw.curb_face_offset_in ?? 0 },
    loads: {
      asphalt: ld.asphalt_in ?? 0,
      asphaltPcf: ld.asphalt_pcf ?? 146.667,
      concPcf: ld.conc_pcf_dl ?? 163, // BRM Table 1-1, reinforced precast concrete, unless the file gives its own
      sidewalks: (ld.sidewalks ?? []).map((s: Record<string, number>) => ({ width: s.width_ft, thk: s.thk_in })),
      pedWidth: ld.ped_width_ft ?? 0,
      sidewalkMountable: o.sidewalk_mountable !== false,
      pedestrians: o.pedestrians !== false,
      railKlf: ld.rail_klf_each_side ?? 0,
      railComponents: (ld.rail_components ?? []).map((c: Record<string, any>) => ({ name: c.name, plf: c.plf, desc: c.desc ?? "" })),
      utilities: (ld.utilities ?? []).map((x: Record<string, any>) => ({ desc: x.desc, klf: x.klf, unit: x.unit })),
      diaphragmKip: ld.diaphragm_kip_per_girder ?? 0,
    },
    materials: { fc: m.fc_ksi, fci: m.fci_ksi, strand: m.strand, fpu: m.fpu_ksi, aps: m.aps_in2, gammaStar: m.gamma_star ?? 0.4, jackingRatio: m.jacking_ratio ?? 0.7, lowRelaxation: /low/i.test(m.strand ?? ""), strandsPerRowPerStem: m.strands_per_row_per_stem ?? 2, firstRow: m.first_row_in ?? 2, rowSpacing: m.row_spacing_in ?? 2 },
    prestress: { mode: "back-calculate", strands: 0 },
    options: {
      ...d.options,
      solveWithOverlay: typeof o.solve_with_overlay === "boolean" ? o.solve_with_overlay : d.options.solveWithOverlay,
      lldfInterior: o.lldf_interior === "multibeam_S_over_D" ? "sd" : o.lldf_interior === "table_3.23.1" ? "table" : "auto",
      roundStrands: o.round_strands !== false,
      legalLldf: o.legal_lldf === "multi" ? "multi" : "single",
      losses: "lump", // the scripts' files take the lump sum
      // As the scripts rated them: tension for information only, the prestress by strength.
      ignoreTension: o.ignore_tension !== false,
      solveForService: false,
      minSteel12: false,
    },
    condition: conditionFromFile(b.condition),
    siaCondition: null,
    review: { items: (b.review_items ?? []).map((x: string) => neutralNote(String(x))), assumption: neutralNote(b.assumption_flag ?? "") },
    notes,
    brrResults: "",
    brrDf: { intSingle: b.brr?.lldf?.int_single ?? null, intMulti: b.brr?.lldf?.int_multi ?? null, extSingle: b.brr?.lldf?.ext_single ?? null, extMulti: b.brr?.lldf?.ext_multi ?? null },
    sketch: null,
    dimsChecked: true, // the bridge file gives them
    sources: {}, // set by the caller (fileSources), which knows the inputs it makes
    blankStart: false,
  };
}

/** A bridge file's condition (snake_case), or none. */
function conditionFromFile(c: Record<string, any> | undefined): DtCondition {
  if (!c || typeof c !== "object") return { jointsFailed: false, jointsNote: "", units: [] };
  return {
    jointsFailed: !!c.joints_failed,
    jointsNote: String(c.joints_note ?? ""),
    units: (Array.isArray(c.units) ? c.units : []).map((x: Record<string, any>) => ({
      unit: Number(x.unit) || 0,
      lostStrands: Number(x.lost_strands) || 0,
      corrodedStrands: Number(x.corroded_strands) || 0,
      areaLoss: Number(x.area_loss_pct) || 0,
      zone: Array.isArray(x.zone_ft) && x.zone_ft.length === 2 ? { from: Number(x.zone_ft[0]), to: Number(x.zone_ft[1]) } : null,
      topLoss: Number(x.top_loss_in) || 0,
      factor: typeof x.factor === "number" ? x.factor : 1,
      note: String(x.note ?? ""),
    })),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

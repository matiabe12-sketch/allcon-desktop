// Mechanically stabilized earth (MSE) wall, AASHTO LRFD (9th ed.) Section 11.10, per foot of wall:
// external stability (eccentricity, bearing, sliding) under Strength I and Extreme Event I, internal
// stability layer by layer (pullout and rupture of the reinforcement), and the precast facing
// panel. Kip, foot and ksf throughout; the panel's dimensions, bars and covers in inches.

import { BARS, coulombKa, DesignError, liveLoadHeq, type Bars, type Check } from "./cip";
import { BASE_SLOPE, cdotMinLength, cdotQuantities, truncatedMinLength, wallSegments, type MseBase, type WallPoint } from "./mse-quantities";
import { designAnchorSlab, RAIL_NONE, type MseRail } from "./mse-rail";

export type Reinforcement = "geogrid" | "geostrip" | "steelstrip" | "steelgrid";

/**
 * α: scale effect correction (AASHTO 11.10.6.3.2). Resistance factors by AASHTO LRFD 10th: tensile φT and pullout φPO
 * at the strength limit state (Table 11.5.7-1), and with earthquake loading (11.5.8): geosynthetic tensile and pullout
 * 1.0, metallic strips 1.0 and grids 0.85 in tension, metallic pullout 1.20.
 */
export const REINFORCEMENTS: { id: Reinforcement; name: string; extensible: boolean; alpha: number; phiT: number; phiTEE: number; phiPO: number; phiPOEE: number }[] = [
  { id: "geogrid", name: "Geogrid", extensible: true, alpha: 0.8, phiT: 0.8, phiTEE: 1.0, phiPO: 0.7, phiPOEE: 1.0 },
  { id: "geostrip", name: "Geosynthetic strip", extensible: true, alpha: 0.6, phiT: 0.55, phiTEE: 1.0, phiPO: 0.7, phiPOEE: 1.0 },
  { id: "steelstrip", name: "Ribbed steel strip", extensible: false, alpha: 1.0, phiT: 0.75, phiTEE: 1.0, phiPO: 0.9, phiPOEE: 1.2 },
  { id: "steelgrid", name: "Steel grid", extensible: false, alpha: 1.0, phiT: 0.65, phiTEE: 0.85, phiPO: 0.9, phiPOEE: 1.2 },
];

export type MseFactors = { evMax: number; evMin: number; eh: number; ls: number; lsEE: number; dwMax?: number; dwMin?: number };
export const MSE_FACTORS: MseFactors = { evMax: 1.35, evMin: 1.0, eh: 1.5, ls: 1.75, lsEE: 0.5, dwMax: 1.5, dwMin: 0.65 };

/** Geosynthetics as CDOT's design charts take them (B-504-H): ultimate strength (kip/ft) and creep reduction RF_CR. */
export type GeoProduct = "pp4800" | "hdpe7800" | "hdpe12000" | "hdpe14400" | "custom";
export const GEO_PRODUCTS: { id: GeoProduct; name: string; Tult: number; RFcr: number }[] = [
  { id: "pp4800", name: "4,800 lb/ft PP woven geotextile", Tult: 4.8, RFcr: 1.8 },
  { id: "hdpe7800", name: "7,800 lb/ft HDPE geogrid", Tult: 7.8, RFcr: 2.55 },
  { id: "hdpe12000", name: "12,000 lb/ft HDPE geogrid", Tult: 12, RFcr: 2.55 },
  { id: "hdpe14400", name: "14,400 lb/ft HDPE geogrid", Tult: 14.4, RFcr: 2.55 },
  { id: "custom", name: "As entered (Tal)", Tult: 0, RFcr: 0 },
];
/** A band of layers from the one above down to `bottom` (ft below the top): their spacing and product. */
export type MseZone = { bottom: number; Sv: number; product: GeoProduct };

export type MseInputs = {
  // Geometry
  H: number; // design height, top of the leveling pad to the top of the wall, ft
  L: number; // reinforcement length, ft
  embedment: number; // ft
  frontSlope?: number; // H:1V of the ground in front of the wall (0 = level)
  erosion?: boolean; // the soil in front may erode or be excavated later (AASHTO 11.10.2.2: 2 ft least, else 1 ft on level ground)
  frost?: number; // ft, frost penetration where the soil below is frost-susceptible (0: none)
  onRock?: boolean; // on a rock foundation: AASHTO 11.10.2.2's least embedment doesn't apply
  backslope: number; // H:1V, 0 = level
  wallType: "wall" | "abutment";
  // Soils
  gammaR: number; // reinforced fill, kcf
  phiR: number; // deg
  gammaRet: number; // retained fill, kcf
  phiRet: number; // deg
  delta: number | null; // friction at the back of the reinforced zone, deg (null: δ = β)
  phiF: number; // foundation soil, deg
  qn: number; // nominal bearing resistance, ksf
  // Live load surcharge
  liveLoad: boolean;
  trafficDistance: number; // ft (walls parallel to traffic)
  // Seismic
  seismic: boolean;
  pga: number;
  fpga: number;
  khFactor: number; // kh = khFactor · As (0.5 when the wall can move 1–2 in, AASHTO 11.6.5.2.2)
  // Reinforcement
  reinforcement: Reinforcement;
  Sv: number; // vertical spacing, ft
  topLayer: number; // depth of the top layer, ft
  Rc: number; // coverage ratio (geosynthetics and steel grids)
  Tal: number; // geosynthetic long-term strength, kip/ft of reinforcement width
  fyReinf: number; // steel reinforcement yield, ksi
  designLife: number; // years (steel corrosion loss)
  cu: number; // reinforced fill uniformity coefficient D60/D10 (steel strips)
  stripWidth: number; // in
  stripThickness: number; // in
  stripSpacing: number; // ft, center to center along the wall
  gridLongDia: number; // longitudinal wire diameter, in
  gridLongSpacing: number; // in
  gridTransDia: number; // transverse wire diameter t, in
  gridTransSpacing: number; // St, in
  // Facing panel
  fc: number; // ksi
  fy: number; // ksi
  panelT: number; // in
  panelSpan: number; // horizontal span between connections, in
  panelCover: number; // clear cover to the vertical bars, in
  panelV: Bars;
  panelH: Bars;
  exposure: 1 | 2;
  // Resistance factors and limits
  phiB: number;
  phiBEE: number;
  phiS: number;
  phiSEE: number;
  eccDivisor: number; // e ≤ L / eccDivisor (3: AASHTO 11.6.3.3; 4: older practice)
  factors: MseFactors;
  // CDOT B-504 options (absent in walls saved before them: the plain AASHTO wall)
  base?: MseBase; // core (uniform length), or a truncated base on a ¾:1 soil or ½:1 rock cut (L at the bottom)
  extendTop?: boolean; // the top two layers twice as long (B-504-D1: roadway tension cracks)
  zoned?: boolean; // spacing and product by zones down the wall
  zones?: MseZone[];
  topProduct?: GeoProduct | "same"; // the top two layers' product (B-504-D1: 4,800 lb/ft woven geotextile)
  rf?: { id: number; cr: number; d: number }; // geosynthetic reduction factors (AASHTO 11.10.6.4.3b); cr for "As entered"
  hma?: { t: number; gamma: number }; // pavement on the wall, in and kcf, a DW surcharge
  cdotSeismic?: boolean; // no seismic analysis: CDOT B-504-A C (seismic zones 1–3, with the EQ details)
  rail?: MseRail;
  site?: { excH: number; theta: number }; // the excavation's height at the wall layout line (ft), the ground's angle (deg)
  segments?: WallPoint[];
};

export const MSE_DEFAULTS: MseInputs = {
  H: 21,
  L: 15,
  embedment: 2.5,
  backslope: 2.5,
  wallType: "abutment",
  gammaR: 0.135,
  phiR: 34,
  gammaRet: 0.13,
  phiRet: 32,
  delta: null,
  phiF: 32,
  qn: 16.6,
  liveLoad: true,
  trafficDistance: 1,
  seismic: true,
  pga: 0.047,
  fpga: 1.6,
  khFactor: 1,
  reinforcement: "geogrid",
  Sv: 2, // under 12 in of pavement (2.5 ft before the CDOT options)
  topLayer: 0.75, // the top two layers 1 ft apart under the barrier (1.25 ft before the CDOT options)
  Rc: 1,
  Tal: 5,
  fyReinf: 65,
  designLife: 75,
  cu: 4,
  stripWidth: 2,
  stripThickness: 0.157,
  stripSpacing: 1.25,
  gridLongDia: 0.375,
  gridLongSpacing: 6,
  gridTransDia: 0.375,
  gridTransSpacing: 12,
  fc: 4.5,
  fy: 60,
  panelT: 6,
  panelSpan: 30,
  panelCover: 2,
  panelV: { bar: 5, spacing: 6 },
  panelH: { bar: 5, spacing: 6 },
  exposure: 1,
  phiB: 0.65,
  phiBEE: 0.9,
  phiS: 1.0,
  phiSEE: 1.0,
  eccDivisor: 3,
  factors: MSE_FACTORS,
  base: "core",
  extendTop: true,
  zoned: true,
  zones: [
    { bottom: 2.5, Sv: 1, product: "custom" }, // closer under the barrier: each takes less of the impact (Web Doc 326 pd × At)
    { bottom: 100, Sv: 2, product: "custom" },
  ],
  topProduct: "pp4800", // CDOT B-504-D1: 4,800 lb/ft woven geotextile
  rf: { id: 1.3, cr: 2.55, d: 1.1 },
  hma: { t: 12, gamma: 0.14 },
  cdotSeismic: true,
  rail: { ...RAIL_NONE, kind: "anchor-slab", B: 7, copingBar: { bar: 6, spacing: 5 } },
  site: { excH: 8, theta: 30 },
  segments: [],
};

/** What a wall saved before the CDOT options had: none of them. */
export const MSE_LEGACY: Partial<MseInputs> = { Sv: 2.5, topLayer: 1.25, base: "core", extendTop: false, zoned: false, topProduct: "same", hma: { t: 0, gamma: 0.14 }, cdotSeismic: false, rail: RAIL_NONE, segments: [] };

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const sin = (d: number) => Math.sin(rad(d));
const cos = (d: number) => Math.cos(rad(d));
const tan = (d: number) => Math.tan(rad(d));

/** Rankine active coefficient, vertical face and level ground: tan²(45° − φ/2). */
export const rankineKa = (phi: number) => tan(45 - phi / 2) ** 2;

/** Mononobe–Okabe seismic active coefficient for a vertical back (AASHTO Eq. A11.3.1-1). */
export function moKae(phi: number, beta: number, delta: number, thetaMO: number) {
  const root = Math.sqrt((sin(phi + delta) * sin(phi - thetaMO - beta)) / (cos(delta + thetaMO) * cos(beta)));
  return (cos(phi - thetaMO) ** 2 / (cos(thetaMO) * cos(delta + thetaMO))) * (1 + root) ** -2;
}

/** Live load surcharge height for abutments, AASHTO T. 3.11.6.4-1 (interpolated). */
export function abutmentHeq(H: number) {
  const table = [
    [5, 4],
    [10, 3],
    [20, 2],
  ];
  if (H <= 5) return 4;
  for (let k = 1; k < table.length; k++) if (H <= table[k][0]) return table[k - 1][1] + ((table[k][1] - table[k - 1][1]) * (H - table[k - 1][0])) / (table[k][0] - table[k - 1][0]);
  return 2;
}

/**
 * The least front-face embedment (AASHTO LRFD 10th 11.10.2.2): 2.0 ft on sloping ground (4H:1V or steeper) or where
 * the soil in front may erode or be excavated, 1.0 ft on level ground without; not less than the frost depth; and
 * Table C11.10.2.2-1's guide by the slope in front (H/20 level, H/10 abutments, H/10 at 3H:1V, H/7 at 2H:1V, H/5 at
 * 1.5H:1V). None on rock (the article's "unless constructed on rock foundations"; the guide still shown).
 */
export function embedmentRule(i: Pick<MseInputs, "H" | "wallType" | "frontSlope" | "erosion" | "frost" | "onRock">) {
  const s = i.frontSlope ?? 0;
  const sloping = s > 0 && s <= 4;
  const level = !(s > 0) || s > 4;
  const [div, slopeName] = level ? [i.wallType === "abutment" ? 10 : 20, "level"] : s >= 3 ? [10, "3H:1V"] : s >= 2 ? [7, "2H:1V"] : [5, s >= 1.5 ? "1.5H:1V" : "1.5H:1V (steeper than the table)"];
  const erosion = i.erosion ?? true;
  const least = i.onRock ? 0 : sloping || erosion ? 2 : 1;
  const frost = Math.max(0, i.frost ?? 0);
  const guide = i.H / div;
  const required = Math.max(least, frost, guide);
  const parts = [i.onRock ? "on rock: no least depth" : `${least} ft least (${sloping ? "sloping ground" : erosion ? "erosion or future excavation possible" : "level, no erosion"})`, ...(frost > 0 ? [`frost ${frost} ft`] : []), `H/${div} (${slopeName}${level && i.wallType === "abutment" ? ", abutment" : ""})`];
  return { required, least, frost, div, guide, sloping, note: parts.join(", ") };
}

/** Thickness lost to corrosion over the design life, both faces, galvanized steel (AASHTO 11.10.6.4.2a), in. */
export function corrosionLoss(life: number) {
  // Zinc (86 µm = 3.4 mil): 0.58 mil/yr for 2 years, then 0.16 mil/yr: gone after 16 years. Then carbon steel at 0.47 mil/yr per side.
  const zincLife = 2 + (3.4 - 2 * 0.58) / 0.16;
  return 2 * 0.00047 * Math.max(0, life - zincLife);
}

/** kr/Ka and F* at a depth below the top of the wall (AASHTO Figs. 11.10.6.2.1-3 and 11.10.6.3.2-2). */
export function layerFactors(i: Pick<MseInputs, "reinforcement" | "phiR" | "cu" | "gridTransDia" | "gridTransSpacing">, z: number) {
  const f = Math.min(z, 20) / 20;
  switch (i.reinforcement) {
    case "steelstrip": {
      const top = Math.min(2, 1.2 + Math.log10(i.cu));
      return { krKa: 1.7 - 0.5 * f, Fstar: top - (top - tan(i.phiR)) * f };
    }
    case "steelgrid": {
      const tSt = i.gridTransDia / i.gridTransSpacing;
      return { krKa: 2.5 - 1.3 * f, Fstar: 20 * tSt - 10 * tSt * f };
    }
    default:
      return { krKa: 1, Fstar: 0.67 * tan(i.phiR) };
  }
}

/** Embedment length needed in the resistant zone (AASHTO Eq. 11.10.6.3.2-1 solved for Le), ft. */
export const pulloutLength = (T: number, phi: number, Fstar: number, alpha: number, sigmaV: number, C: number, Rc: number) => T / (phi * Fstar * alpha * sigmaV * C * Rc);

/** H1 for inextensible reinforcement under a sloping backfill (AASHTO Fig. 11.10.6.3.1-1), ft. */
export const inextensibleH1 = (H: number, beta: number) => H + (0.3 * H * tan(beta)) / (1 - 0.3 * tan(beta));

/** Width of the active zone at a depth z below the top (AASHTO Fig. 11.10.6.3.1-1), ft. */
export function activeLength(extensible: boolean, H: number, z: number, phiR: number, beta: number) {
  if (extensible) return Math.max(0, (H - z) * tan(45 - phiR / 2));
  return Math.max(0, Math.min(0.3 * inextensibleH1(H, beta), 0.6 * (H - z)));
}

/** Area of the active zone, ft² per ft (for its weight under seismic loading). */
function activeArea(extensible: boolean, H: number, phiR: number, beta: number) {
  if (extensible) return 0.5 * H ** 2 * tan(45 - phiR / 2);
  const H1 = inextensibleH1(H, beta);
  return H <= 0.5 * H1 ? 0.3 * H ** 2 : 0.3 * H1 * H - 0.075 * H1 ** 2;
}

/** Flexure of a 12 in strip of the panel at depth d: resistance with φ from the net tensile strain, minimum steel, crack control. */
export function panelFlexure(o: { Mu: number; Ms: number; t: number; d: number; bars: Bars; fc: number; fy: number; n: number; exposure: 1 | 2 }) {
  const b = 12;
  const { area } = BARS[o.bars.bar];
  const As = (area * b) / o.bars.spacing;
  const beta1 = Math.max(0.65, Math.min(0.85, 0.85 - 0.05 * (o.fc - 4)));
  const c = (As * o.fy) / (0.85 * o.fc * beta1 * b);
  const a = beta1 * c;
  const Mn = (As * o.fy * (o.d - a / 2)) / 12;
  const epsT = (0.003 * (o.d - c)) / c;
  const phi = Math.max(0.75, Math.min(0.9, 0.75 + (0.15 * (epsT - 0.002)) / 0.003)); // AASHTO 5.5.4.2
  const MR = phi * Mn;
  const fr = 0.24 * Math.sqrt(o.fc);
  const Sc = (b * o.t ** 2) / 6;
  const Mcr = (0.67 * 1.6 * fr * Sc) / 12;
  const Mdesign = Math.max(o.Mu, Math.min(1.33 * o.Mu, Mcr)); // AASHTO 5.6.3.3
  const rho = As / (b * o.d);
  const k = Math.sqrt(2 * rho * o.n + (rho * o.n) ** 2) - rho * o.n;
  const j = 1 - k / 3;
  const dc = o.t - o.d;
  const betaS = 1 + dc / (0.7 * (o.t - dc));
  const fss = Math.min(0.6 * o.fy, Math.max((o.Ms * 12) / (As * j * o.d), 1e-9));
  const gammaE = o.exposure === 1 ? 1.0 : 0.75;
  const sMax = (700 * gammaE) / (betaS * fss) - 2 * dc;
  return { d: o.d, As, beta1, c, a, Mn, epsT, phi, MR, fr, Sc, Mcr, Mu: o.Mu, Mdesign, Ms: o.Ms, rho, k, j, dc, betaS, fss, gammaE, sMax, spacing: o.bars.spacing };
}

export type MseGroup = { V: number; H: number; M: number; e: number; sigma: number };

export function designMseWall(i: MseInputs) {
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity });
  const { H, L, Sv } = i;
  const f = i.factors;
  if (!(H > 0) || !(L > 0)) throw new DesignError("The wall needs a height and a reinforcement length");
  if (!(Sv > 0) || !(i.topLayer > 0) || i.topLayer >= H) throw new DesignError("The reinforcement layers don't fit in the wall's height");
  const baseType: MseBase = i.base ?? "core";
  const slope = BASE_SLOPE[baseType];
  const T = L + slope * H; // the reinforced zone's width at the top (L at the bottom)
  const dwMax = f.dwMax ?? 1.5;
  const dwMin = f.dwMin ?? 0.65;
  const qDW = ((i.hma?.t ?? 0) / 12) * (i.hma?.gamma ?? 0); // pavement, ksf
  const seismicOn = i.seismic && !i.cdotSeismic;
  const zones = i.zoned && i.zones?.length ? [...i.zones].sort((a, b) => a.bottom - b.bottom) : null;
  if (zones?.some((zn) => !(zn.Sv > 0))) throw new DesignError("Give every zone a spacing");

  // --- soil ------------------------------------------------------------------------------------
  const beta = i.backslope > 0 ? deg(Math.atan(1 / i.backslope)) : 0;
  if (beta >= i.phiRet) throw new DesignError("The backslope is steeper than the retained fill's friction angle");
  const delta = i.delta ?? beta;
  const Ka = coulombKa(i.phiRet, beta, 90, delta); // retained fill, at the back of the reinforced zone (11.10.5.2)
  const KaInt = rankineKa(i.phiR); // reinforced fill, internal stability (11.10.6.2.1)
  const h = H + T * tan(beta); // height at the back of the reinforced zone
  const heq = i.liveLoad ? (i.wallType === "abutment" ? abutmentHeq(H) : liveLoadHeq(H, i.trafficDistance)) : 0;
  const mu = tan(Math.min(i.phiR, i.phiF)); // the weaker of the reinforced fill and the foundation (11.10.5.3)

  // --- external loads (per ft; moments about the center of the base, overturning positive) -------
  const EV1 = i.gammaR * (H * L + 0.5 * slope * H * H); // a truncated base: the triangle over the cut too
  // A truncated base, by CDOT's method (B-504 design charts): the whole weight acts at the center of the bottom length,
  // and only the earth pressure and surcharges overturn about it. Most of the soil over the cut bears on the cut, not on
  // the base, so its weight isn't counted as resisting behind the center (that would swing the resultant to the heel).
  const centered = slope > 0;
  const EV1arm = 0; // a core wall's reinforced zone is centered on its base; a truncated base's taken at the center
  const EV2 = 0.5 * T * (T * tan(beta)) * i.gammaR; // the slope over the reinforced zone, at 2T/3
  const EV2arm = centered ? 0 : (2 * T) / 3 - L / 2;
  const EHVarm = centered ? 0 : T - L / 2;
  const topArm = centered ? 0 : T / 2 - L / 2; // surcharges over the top
  const DWV = qDW * T;
  const DWH = qDW * Ka * H;
  const PEH = 0.5 * i.gammaRet * Ka * h ** 2;
  const EHH = PEH * cos(beta);
  const EHV = PEH * sin(beta);
  const LSV = i.gammaR * heq * T;
  const LSH = i.gammaRet * heq * Ka * H;
  let seismic: { kh: number; thetaMO: number; KAE: number; PIR: number; PAE: number; PEQ: number; MEQ: number } | null = null;
  if (seismicOn) {
    const kh = i.khFactor * i.fpga * i.pga;
    const thetaMO = deg(Math.atan(kh));
    if (i.phiRet - thetaMO - beta < 0) throw new DesignError("Mononobe–Okabe doesn't apply (φ < β + θMO): the backslope is too steep for this seismic coefficient");
    const KAE = moKae(i.phiRet, beta, delta, thetaMO);
    const PIR = kh * 0.5 * i.gammaR * H ** 2; // AASHTO Eq. 11.10.7.1-3: the reinforced mass over 0.5 H
    const PAE = 0.5 * i.gammaRet * KAE * h ** 2;
    const PEQ = Math.max(PAE + 0.5 * PIR, 0.5 * PAE + PIR); // AASHTO 11.10.7.1
    const MEQ = Math.max(PAE * (h / 3) + 0.5 * PIR * (H / 2), 0.5 * PAE * (h / 3) + PIR * (H / 2));
    seismic = { kh, thetaMO, KAE, PIR, PAE, PEQ, MEQ };
  }
  const group = (ev: number, eh: number, lsv: number, lsh: number, eq: number, dwv: number, dwh: number): MseGroup => {
    const V = lsv * LSV + ev * (EV1 + EV2) + eh * EHV + dwv * DWV;
    const Hh = lsh * LSH + eh * EHH + eq * (seismic?.PEQ ?? 0) + dwh * DWH;
    const M = eh * (EHH * (h / 3) - EHV * EHVarm) - ev * (EV1 * EV1arm + EV2 * EV2arm) - lsv * LSV * topArm - dwv * DWV * topArm + lsh * LSH * (H / 2) + dwh * DWH * (H / 2) + eq * (seismic?.MEQ ?? 0);
    const e = M / V;
    const Beff = L - 2 * Math.abs(e);
    return { V, H: Hh, M, e, sigma: Beff > 0 ? V / Beff : Infinity }; // the resultant outside the base: no bearing width
  };
  const groups = {
    StrMax: group(f.evMax, f.eh, f.ls, f.ls, 0, dwMax, dwMax), // bearing: live load over the reinforced zone
    StrMin: group(f.evMin, f.eh, 0, f.ls, 0, dwMin, dwMax), // sliding and eccentricity
    ...(seismic ? { EEMax: group(1, 0, f.lsEE, f.lsEE, 1, dwMax, dwMax), EEMin: group(1, 0, 0, f.lsEE, 1, dwMin, dwMax) } : {}),
  } as { StrMax: MseGroup; StrMin: MseGroup; EEMax?: MseGroup; EEMin?: MseGroup };

  if (baseType === "core") {
    const aashto = Math.max(0.7 * H, 8);
    const cdot = cdotMinLength(H);
    const meetsCdot = L >= aashto - 1e-9 || L >= cdot - 1e-9;
    add({ id: "geom-length", name: "Reinforcement length", demand: aashto, capacity: L, unit: "ft", ref: "AASHTO 11.10.2.1", note: L < aashto - 1e-9 && meetsCdot ? `L ≥ 0.7H and 8 ft; CDOT B-504-D1 allows ${cdot} ft at this height` : "L ≥ 0.7H and 8 ft", ...(L < aashto - 1e-9 && meetsCdot ? { advisory: true } : {}) });
  } else {
    add({ id: "geom-length", name: `Truncated base: length at the bottom (${baseType === "truncated-soil" ? "¾:1 soil" : "½:1 rock"} cut)`, demand: truncatedMinLength(H), capacity: L, unit: "ft", ref: "CDOT B-504-A C note 6", note: "0.45 DH and 4 ft" });
    add({ id: "geom-global", name: "Global stability of the truncated base: FS 1.3 (φ 0.75), by the geotechnical engineer", demand: 1.3, capacity: 1.3, unit: "", ref: "CDOT B-504-A C note 6; AASHTO 11.6.3.7", advisory: true });
  }
  if (i.seismic && i.cdotSeismic) add({ id: "geom-seismic", name: "No seismic analysis: seismic zones 1–3 with CDOT's earthquake details", demand: 0, capacity: 0, unit: "", ref: "CDOT B-504-A C note 5", advisory: true });
  const emb = embedmentRule(i);
  const embedMin = emb.required;
  add({ id: "geom-embed", name: "Embedment", demand: embedMin, capacity: i.embedment, unit: "ft", ref: "AASHTO 11.10.2.2, Table C11.10.2.2-1", note: emb.note });
  const eAllow = L / i.eccDivisor;
  add({ id: "ext-ecc-str", name: "Eccentricity, Strength I", demand: Math.abs(groups.StrMin.e), capacity: eAllow, unit: "ft", ref: "AASHTO 11.6.3.3" });
  add({ id: "ext-brg-str", name: "Bearing, Strength I", demand: groups.StrMax.sigma, capacity: i.phiB * i.qn, unit: "ksf", ref: "AASHTO 11.10.5.4" });
  add({ id: "ext-slide-str", name: "Sliding, Strength I", demand: groups.StrMin.H, capacity: i.phiS * groups.StrMin.V * mu, unit: "kip/ft", ref: "AASHTO 11.10.5.3" });
  const eAllowEE = L * (1 / 3 + f.lsEE * (0.4 - 1 / 3)); // middle 2/3 at γEQ = 0 to middle 8/10 at γEQ = 1 (11.6.5.1)
  if (groups.EEMax && groups.EEMin) {
    add({ id: "ext-ecc-ee", name: "Eccentricity, Extreme Event I", demand: Math.abs(groups.EEMin.e), capacity: eAllowEE, unit: "ft", ref: "AASHTO 11.6.5.1" });
    add({ id: "ext-brg-ee", name: "Bearing, Extreme Event I", demand: groups.EEMax.sigma, capacity: i.phiBEE * i.qn, unit: "ksf", ref: "AASHTO 11.10.5.4" });
    add({ id: "ext-slide-ee", name: "Sliding, Extreme Event I", demand: groups.EEMin.H, capacity: i.phiSEE * groups.EEMin.V * mu, unit: "kip/ft", ref: "AASHTO 11.10.7.1" });
  }

  // --- internal stability ----------------------------------------------------------------------
  const kind = REINFORCEMENTS.find((r) => r.id === i.reinforcement) ?? REINFORCEMENTS[0];
  const Es = kind.extensible ? 0 : corrosionLoss(i.designLife);
  let Rc = i.Rc;
  let Tal = i.Tal;
  if (i.reinforcement === "steelstrip") {
    if (i.stripThickness <= Es) throw new DesignError("The strip corrodes away within the design life");
    Rc = i.stripWidth / 12 / i.stripSpacing;
    Tal = i.fyReinf * (i.stripThickness - Es) * 12; // per ft of strip width
  } else if (i.reinforcement === "steelgrid") {
    if (i.gridLongDia <= Es) throw new DesignError("The grid's wires corrode away within the design life");
    Tal = (i.fyReinf * ((Math.PI / 4) * (i.gridLongDia - Es) ** 2) * 12) / i.gridLongSpacing; // per ft of mat width
  }
  const C = 2; // strips, grids and sheets
  const S = 0.5 * 0.7 * H * tan(beta); // the backslope as a surcharge (Fig. 11.10.6.2.1-2)
  const sigmaS = i.gammaRet * S;
  const sigmaLS = i.gammaR * heq;
  const zoneAt = (z: number) => (zones ? (zones.find((zn) => z < zn.bottom - 1e-9) ?? zones[zones.length - 1]) : null);
  const zs: number[] = [];
  for (let z = i.topLayer; z < H - 1e-9 && zs.length < 200; z += zoneAt(z)?.Sv ?? Sv) zs.push(z);
  const rf = i.rf ?? { id: 1.3, cr: 2.55, d: 1.1 };
  // Each layer's product (geosynthetics): its long-term strength and ultimate (AASHTO 11.10.6.4.3b, Tal = Tult / RF).
  const productOf = (k: number, z: number) => {
    if (!kind.extensible) return { id: "steel", name: kind.name, Tal, Tult: Tal, RFcr: 1 };
    const id = k < 2 && i.topProduct && i.topProduct !== "same" ? i.topProduct : zones ? zoneAt(z)!.product : "custom";
    const g = GEO_PRODUCTS.find((x) => x.id === id) ?? GEO_PRODUCTS[GEO_PRODUCTS.length - 1];
    if (g.id === "custom") return { id: g.id, name: "As entered", Tal, Tult: Tal * rf.id * rf.cr * rf.d, RFcr: rf.cr };
    return { id: g.id, name: g.name, Tal: g.Tult / (rf.id * g.RFcr * rf.d), Tult: g.Tult, RFcr: g.RFcr };
  };
  const lengthAt = (k: number, z: number) => (L + slope * (H - z)) * (i.extendTop && k < 2 ? 2 : 1);
  const trib = zs.map((z, k) => (k === zs.length - 1 ? H : (z + zs[k + 1]) / 2) - (k === 0 ? 0 : (zs[k - 1] + z) / 2));
  const Wa = i.gammaR * activeArea(kind.extensible, H, i.phiR, beta);
  const Pi = seismic ? seismic.kh * Wa : 0; // AASHTO 11.10.7.2
  const base = zs.map((z, k) => {
    const { krKa, Fstar } = layerFactors(i, z);
    const kr = krKa * KaInt;
    const sigmaV = i.gammaR * z + sigmaS + qDW; // unfactored, no live load (pullout)
    const LA = activeLength(kind.extensible, H, z, i.phiR, beta);
    const Lz = lengthAt(k, z);
    return { z, Svi: trib[k], krKa, kr, Fstar, sigmaV, LA, Lz, Le: Math.max(0, Lz - LA), product: productOf(k, z) };
  });
  const sumLe = base.reduce((s, l) => s + l.Le, 0);
  const layers = base.map((l) => {
    const sigmaHStr = l.kr * (f.evMax * (l.sigmaV - qDW) + dwMax * qDW + f.ls * sigmaLS);
    const sigmaHSer = l.kr * (l.sigmaV + sigmaLS);
    const sigmaHEE = l.kr * (l.sigmaV + f.lsEE * sigmaLS);
    const Tstr = sigmaHStr * l.Svi;
    const Tser = sigmaHSer * l.Svi;
    const Tmd = seismic && sumLe > 0 ? (Pi * l.Le) / sumLe : 0;
    const Tee = sigmaHEE * l.Svi + Tmd;
    const unit = l.Fstar * kind.alpha * l.sigmaV * C * Rc; // pullout per ft of embedment, before φ
    const Pr = kind.phiPO * unit * l.Le;
    const PrEE = kind.phiPOEE * 0.8 * unit * l.Le; // F* at 80% under seismic loading (11.10.7.2)
    const LeReq = pulloutLength(Tstr, kind.phiPO, l.Fstar, kind.alpha, l.sigmaV, C, Rc);
    const Tr = kind.phiT * l.product.Tal * Rc;
    const TrEE = kind.phiTEE * l.product.Tal * Rc;
    return { ...l, unit, sigmaHStr, sigmaHSer, sigmaHEE, Tstr, Tser, Tmd, Tee, Pr, PrEE, LeReq, LReq: LeReq + l.LA, Tr, TrEE, talReq: Tstr / (kind.phiT * Rc) };
  });
  const worst = <K extends keyof (typeof layers)[number]>(dem: K, cap: K) => layers.reduce((w, l) => ((l[dem] as number) / (l[cap] as number) > (w[dem] as number) / (w[cap] as number) ? l : w), layers[0]);
  const at = (z: number) => `layer at ${+z.toFixed(2)} ft`;
  const po = worst("Tstr", "Pr");
  add({ id: "int-pullout-str", name: `Pullout, Strength I (${at(po.z)})`, demand: po.Tstr, capacity: po.Pr, unit: "kip/ft", ref: "AASHTO 11.10.6.3.2" });
  const ru = worst("Tstr", "Tr");
  add({ id: "int-rupture-str", name: `Rupture, Strength I (${at(ru.z)})`, demand: ru.Tstr, capacity: ru.Tr, unit: "kip/ft", ref: "AASHTO 11.10.6.4.1" });
  if (seismic) {
    const poE = worst("Tee", "PrEE");
    add({ id: "int-pullout-ee", name: `Pullout, Extreme Event I (${at(poE.z)})`, demand: poE.Tee, capacity: poE.PrEE, unit: "kip/ft", ref: "AASHTO 11.10.7.2" });
    const ruE = worst("Tee", "TrEE");
    add({ id: "int-rupture-ee", name: `Rupture, Extreme Event I (${at(ruE.z)})`, demand: ruE.Tee, capacity: ruE.TrEE, unit: "kip/ft", ref: "AASHTO 11.10.7.2" });
  }

  // --- a barrier on top (AASHTO 11.10.10.2; NCHRP Web Doc 326 / Report 663 as CDOT BDM 11, 13.5.4 ask) ----------
  const rail = i.rail ?? RAIL_NONE;
  let anchor: ReturnType<typeof designAnchorSlab> | null = null;
  const impact: { z: number; k: number; Fs: number; Fp: number; Fy: number; P: number; demandR: number; R: number; o: number[] }[] = [];
  if (rail.kind === "anchor-slab") {
    anchor = designAnchorSlab(rail, { phiFill: i.phiR, fc: i.fc, fy: i.fy });
    const lv = anchor.level;
    add({ id: "rail-slide", name: `Moment slab sliding (${lv.label}): φ W tan φr`, demand: lv.Ls, capacity: anchor.phiP, unit: "kip", ref: `${lv.ref}; Eq. 9-1, 9-2` });
    add({ id: "rail-ot", name: `Moment slab overturning about point ${rail.rotation}`, demand: anchor.Mo, capacity: anchor.phiM, unit: "kip·ft", ref: `${lv.ref}; Eq. 9-3, 9-4` });
    add({ id: "rail-coping", name: `Coping flexure at its critical section, Ld over ${lv.BL} ft`, demand: anchor.coping.Mu, capacity: anchor.coping.phiMn, unit: "kip·ft", ref: "NCHRP Web Doc 326 9.1.3; AASHTO 5.6.3.2" });
    add({ id: "rail-width", name: "Moment slab width", demand: lv.Wmin, capacity: rail.B, unit: "ft", ref: "NCHRP Web Doc 326 Table 9-1", advisory: true });
    add({ id: "rail-height", name: "Barrier height", demand: lv.Hmin, capacity: rail.barrierH, unit: "in", ref: "NCHRP Web Doc 326 Table 9-1", advisory: true });
    add({ id: "rail-joints", name: "Monolithic length between joints (20 to 60 ft)", demand: 20, capacity: rail.Lj, unit: "ft", ref: "NCHRP Report 663 I-1.4.1", ok: rail.Lj >= 20 && rail.Lj <= 60, advisory: true });
    // The impact on the top two layers: the static earth pressure plus the dynamic pressure over its band, pullout
    // over the full length (Eqs. 9-6, 9-7) and yield (9-14); a geosynthetic's dynamic part without creep (AASHTO Eq. 11.10.10.2-1).
    // Each band's pressure (the first h1 below the top, then the next h2) goes to the layers by the part of their
    // tributary height inside it: Web Doc 326's pd × At, the reinforcement's own tributary area.
    const bands: [number, number][] = [
      [0, lv.h[0]],
      [lv.h[0], lv.h[0] + lv.h[1]],
    ];
    const tribOf = (k: number) => [k === 0 ? 0 : (layers[k - 1].z + layers[k].z) / 2, k === layers.length - 1 ? H : (layers[k].z + layers[k + 1].z) / 2] as const;
    const overlap = ([a, b]: readonly [number, number], [c, d]: [number, number]) => Math.max(0, Math.min(b, d) - Math.max(a, c));
    layers.forEach((l, k) => {
      const t = tribOf(k);
      const o = bands.map((b) => overlap(t, b));
      if (o[0] + o[1] <= 1e-9) return;
      const Fs = l.kr * l.sigmaV * l.Svi;
      const Fp = (lv.pdp[0] * o[0] + lv.pdp[1] * o[1]) / 1000;
      const Fy = (lv.pdy[0] * o[0] + lv.pdy[1] * o[1]) / 1000;
      const P = 1.0 * l.unit * l.Lz;
      const demandR = Fs + Fy / (kind.extensible ? l.product.RFcr : 1);
      const R = (kind.extensible ? kind.phiTEE : 1.0) * l.product.Tal * Rc;
      impact.push({ z: l.z, k, Fs, Fp, Fy, P, demandR, R, o });
      add({ id: `int-impact-pullout-${k + 1}`, name: `Barrier impact, pullout of layer ${k + 1} (at ${+l.z.toFixed(2)} ft, full length)`, demand: Fs + Fp, capacity: P, unit: "kip/ft", ref: `${lv.ref}; Eq. 9-6` });
      add({ id: `int-impact-yield-${k + 1}`, name: `Barrier impact, rupture of layer ${k + 1}`, demand: demandR, capacity: R, unit: "kip/ft", ref: kind.extensible ? "AASHTO 11.10.10.2-1; Web Doc 326 Eq. 9-14" : `${lv.ref}; Eq. 9-14` });
    });
  } else if (rail.kind === "post-beam") {
    layers.slice(0, 2).forEach((l, k) => {
      const Fs = l.kr * l.sigmaV * l.Svi;
      const Fd = 0.15; // 300 lb/ft, half to each of the top two layers
      const P = kind.phiPOEE * l.unit * l.Le;
      const demandR = Fs + Fd / (kind.extensible ? l.product.RFcr : 1);
      const R = kind.phiTEE * l.product.Tal * Rc;
      impact.push({ z: l.z, k, Fs, Fp: Fd, Fy: Fd, P, demandR, R, o: [0, 0] });
      add({ id: `int-impact-pullout-${k + 1}`, name: `Post-and-beam barrier, pullout of layer ${k + 1}`, demand: Fs + Fd, capacity: P, unit: "kip/ft", ref: "AASHTO 11.10.10.2" });
      add({ id: `int-impact-yield-${k + 1}`, name: `Post-and-beam barrier, rupture of layer ${k + 1}`, demand: demandR, capacity: R, unit: "kip/ft", ref: "AASHTO 11.10.10.2" });
    });
    add({ id: "rail-posts", name: "Posts at least 3 ft from the wall face, 5 ft deep, missing the reinforcement where possible", demand: 3, capacity: 3, unit: "ft", ref: "AASHTO 11.10.10.2", advisory: true });
  }

  // --- CDOT quantities per foot (B-504-Q3, Q4, Q7) and along the wall ---------------------------------------------
  const site = i.site ?? { excH: H / 2, theta: 30 };
  const cdot = cdotQuantities({ base: baseType, DH: H, L, H: site.excH, theta: site.theta });
  const reinfSY = layers.reduce((t, l) => t + l.Lz, 0) * (kind.extensible ? Rc : 1) / 9; // SY/LF of geosynthetic (per ft of wall)
  const slabCY = rail.kind === "anchor-slab" ? (rail.B * (rail.ts / 12) + (rail.copingWidth / 12) * (rail.copingDepth / 12)) / 27 : 0;
  const segments = i.segments && i.segments.length >= 2 ? wallSegments(i.segments, { base: baseType, H, L, theta: site.theta }) : null;
  if (segments && segments.segments.length) add({ id: "geom-segments", name: "Every segment within the designed section's height", demand: segments.maxDH, capacity: H, unit: "ft", ref: "CDOT B-504-I1, I3 (wall segment table)" });

  // --- facing panel ----------------------------------------------------------------------------
  // The largest factored pressure behind the panel spans between the connections: horizontally
  // between them along the wall, vertically between the layers; w l²/8 on both faces (one mat of bars).
  const pu = Math.max(...layers.map((l) => Math.max(l.Tstr, l.Tee) / l.Svi));
  const ps = Math.max(...layers.map((l) => l.Tser / l.Svi));
  const Ec = 120000 * 0.15 ** 2 * i.fc ** 0.33;
  const n = 29000 / Ec;
  const t = i.panelT;
  const dbV = BARS[i.panelV.bar].dia;
  const dbH = BARS[i.panelH.bar].dia;
  const dV = t - i.panelCover - dbV / 2;
  const dH = t - i.panelCover - dbV - dbH / 2;
  const spanH = i.panelSpan / 12;
  const spanV = zones ? Math.max(...zones.map((zn) => zn.Sv)) : Sv; // the vertical span between layers
  const face = (span: number, d: number, bars: Bars) => panelFlexure({ Mu: (pu * span ** 2) / 8, Ms: (ps * span ** 2) / 8, t, d, bars, fc: i.fc, fy: i.fy, n, exposure: i.exposure });
  const panel = {
    pu,
    ps,
    Ec,
    n,
    spanH,
    spanV,
    vertPos: face(spanV, dV, i.panelV),
    vertNeg: face(spanV, t - dV, i.panelV),
    horPos: face(spanH, dH, i.panelH),
    horNeg: face(spanH, t - dH, i.panelH),
    shear: [
      { dir: "vertical", span: spanV, de: Math.max(dV, t - dV) },
      { dir: "horizontal", span: spanH, de: Math.max(dH, t - dH) },
    ].map((s) => {
      const Vu = 0.625 * pu * s.span; // continuous over the connections
      const dv = Math.max(0.9 * s.de, 0.72 * t);
      const Vr = 0.9 * 0.0316 * 2 * Math.sqrt(i.fc) * 12 * dv; // β = 2 (5.7.3.4.1)
      return { ...s, Vu, dv, Vr };
    }),
  };
  const faces = [
    ["vertPos", "Vertical bars, inside face"],
    ["vertNeg", "Vertical bars, outside face"],
    ["horPos", "Horizontal bars, inside face"],
    ["horNeg", "Horizontal bars, outside face"],
  ] as const;
  for (const [k, name] of faces) {
    const p = panel[k];
    add({ id: `panel-flex-${k}`, name: `Panel flexure, ${name.toLowerCase()}`, demand: p.Mdesign, capacity: p.MR, unit: "kip·ft/ft", ref: "AASHTO 5.6.3.2, 5.6.3.3" });
  }
  for (const [k, name] of faces) {
    const p = panel[k];
    add({ id: `panel-crack-${k}`, name: `Panel crack control, ${name.toLowerCase()}`, demand: p.spacing, capacity: p.sMax, unit: "in", ref: "AASHTO 5.6.7" });
  }
  for (const s of panel.shear) add({ id: `panel-shear-${s.dir}`, name: `Panel shear, spanning ${s.dir}ly`, demand: s.Vu, capacity: s.Vr, unit: "kip/ft", ref: "AASHTO 5.7.3.3" });

  return {
    ok: checks.every((c) => c.ok),
    checks,
    soil: { beta, delta, Ka, KaInt, h, heq, mu, ...(seismic ? { kh: seismic.kh, thetaMO: seismic.thetaMO, KAE: seismic.KAE } : {}) },
    loads: { EV1, EV2, PEH, EHH, EHV, LSV, LSH, DWV, DWH, qDW, ...(seismic ? { PIR: seismic.PIR, PAE: seismic.PAE, PEQ: seismic.PEQ, MEQ: seismic.MEQ } : {}) },
    geometry: { base: baseType, slope, T, bearingTsf: groups.StrMax.sigma / 2 },
    rail: { kind: rail.kind, anchor, impact },
    quantities: { cdot, reinfSY, geomembraneSY: cdot ? cdot.PLG / 9 : 0, facingSF: H, slabCY, segments },
    groups,
    limits: { eAllow, eAllowEE, embedMin },
    internal: { kind, Es, Rc, Tal, C, S, sigmaS, sigmaLS, H1: kind.extensible ? null : inextensibleH1(H, beta), Wa, Pi, sumLe, layers },
    panel,
  };
}

export type MseResult = ReturnType<typeof designMseWall>;

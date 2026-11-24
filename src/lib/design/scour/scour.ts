import { DesignError, type Check } from "../walls/cip";

// Bridge scour by FHWA HEC-18, 5th Edition (FHWA-HIF-12-003, 2012), as CDOT requires it (Drainage Design Manual
// 10.6; Scour Program Procedures Manual 3.4.5): at each pier and abutment, for the scour design flood and the scour
// design check flood (usually the 100- and 500-year floods, or the worse overtopping event):
//
//   pier:      total = long-term degradation (LTD) + contraction scour (or pressure-flow scour, the larger) + local
//              pier scour (CSU equation, Eq. 7.1/7.3, with K1, K2, K3, the wide-pier Kw, multiple columns, debris);
//   abutment:  total = LTD + (ymax − y0), NCHRP 24-20 (Eqs. 8.3 to 8.7), which already includes contraction scour.
//
// Contraction scour: live-bed (modified Laursen, Eqs. 6.2/6.3) or clear-water (Eqs. 6.4/6.5) as the approach velocity
// is above or below the critical velocity (Eq. 6.1); pressure flow by Eqs. 6.14 to 6.16. Countermeasures (riprap) are
// not counted (DDM 10.6.3). Each element's minimum scour elevation is its datum (the thalweg or the floodplain) less
// the total, stopped at the top of non-erodible rock where one is given. Feet, seconds, cfs; D50 in mm.

export type ScourMode = "auto" | "live" | "clear";

export type ScourFlood = {
  name: string;
  ltd: number; // ft, long-term degradation (HEC-20), at every element
  contraction: {
    mode: ScourMode; // live-bed or clear-water: auto by the approach velocity against Vc (6.2.1)
    Q1: number; // cfs, the upstream main channel's flow (transporting bed material)
    W1: number; // ft, its width
    y1: number; // ft, its average depth
    S1: number; // ft/ft, its energy slope (for the shear velocity)
    Q2: number; // cfs, the flow through the contracted section (the bridge's main channel)
    W2: number; // ft, its width less the piers'
    y0: number; // ft, its existing average depth
    armor: boolean; // live-bed limited by armoring: the smaller of the live-bed and clear-water depths (6.3 Note 8)
    /** A cohesive bed (6.7): ultimate scour by its critical shear stress (Eq. 6.6), and, with the initial erosion rate
     * (ft/hr) and the flood's duration (hr), the scour reached in that time (Eq. 6.8). Off: the granular equations. */
    cohesive?: { on: boolean; tauc: number; n: number; zdot: number; hours: number };
  };
  pressure: {
    on: boolean; // the water surface upstream reaches the low chord
    hu: number; // ft, upstream channel flow depth
    hb: number; // ft, the opening's height before scour (the bed to the low chord)
    T: number; // ft, the obstruction's height: girders, deck and parapet
    Qb: number; // cfs, the flow through the opening (less any overtopping)
  };
};

export type PierShape = "square" | "round" | "circular" | "sharp" | "columns";
export type BedCondition = "clear" | "plane" | "small-dunes" | "medium-dunes" | "large-dunes";

/** A pier's footing or pile cap and its piles (HEC-18 7.5, complex piers), when they're in or may come into the flow. */
export type ComplexPier = {
  on: boolean;
  capWidth: number; // ft, the cap's (footing's) width normal to the flow (apc)
  capLength: number; // ft, along the flow
  T: number; // ft, its thickness
  capBottom: number; // ft El., its bottom
  f: number; // ft, its overhang upstream of the pier stem
  ks: number; // ft, bed roughness for the velocity on an exposed footing (D84 for sand, 3.5 D84 for gravel)
  capShape: "square" | "round";
  /** Columns across the flow, rows along it, the pile's width (ft), spacing center to center (ft). */
  piles: { on: boolean; across: number; rows: number; d: number; S: number; square: boolean };
};

/** The bed at a pier: granular (HEC-18 7.2 or FDOT 7.3), cohesive (Eq. 7.35, by its critical velocity, ft/s), or
 * erodible rock (7.13: Erodibility Index K, the energy slope S; abrasion by GSN, ft per unit stream power, × Ω). */
export type PierMaterial = { kind: "granular" | "cohesive" | "rock"; Vc: number; K: number; S: number; GSN: number; omega: number };

export type ScourPier = {
  name: string;
  /** HEC-18's CSU equation (7.2), or the FDOT methodology (7.3, Sheppard–Melville), for granular beds. */
  method?: "hec18" | "fdot";
  material?: PierMaterial;
  complex?: ComplexPier;
  support?: number; // the Bridge's support (0 the first abutment), when linked
  shape: PierShape;
  a: number; // ft, width (a column's diameter for "columns")
  L: number; // ft, length along the pier (solid piers)
  columns: { n: number; spacing: number }; // "columns": how many in the bent, center to center (ft)
  bed: BedCondition; // K3 (Table 7.3)
  wide: boolean; // apply the wide-pier factor Kw where it may (7.4), by judgment
  contraction: boolean; // in the contracted channel: add the flood's contraction scour
  debris: { on: boolean; shape: "rectangular" | "triangular"; W: number; H: number }; // ft (7.7.3)
  datum: number; // ft, the elevation total scour is measured from (thalweg or floodplain)
  rock: number | null; // ft, the top of non-erodible rock (scour stops there), or none
  flow: { y1: number; V1: number; angle: number }[]; // per flood: depth and velocity just upstream (ft, ft/s), attack (deg)
};

export type ScourAbutment = {
  name: string;
  support?: number;
  type: "spill-through" | "wingwall";
  LBf: number; // the embankment's projected length over the floodplain's width: ≥ 0.75 condition (a), else (b)
  datum: number;
  rock: number | null;
  flow: { q1: number; q2: number; y1: number; y0: number }[]; // per flood: unit discharges upstream and at the abutment (ft²/s), depths (ft)
};

export type ScourInputs = {
  D50: number; // mm, the bed material's median size
  fall: number; // ft/s, the D50's fall velocity; 0: worked out (sand, SG 2.65, 68 °F water)
  tauc: number; // psf, a cohesive floodplain's critical shear stress for the abutments' clear-water case; 0: by grain size
  nFloodplain: number; // Manning n of the floodplain (with τc)
  floods: ScourFlood[];
  piers: ScourPier[];
  abutments: ScourAbutment[];
};

const g = 32.2;
const ft = (mm: number) => mm / 304.8;

/** Critical velocity for the beginning of motion of D50 (Eq. 6.1, Ku 11.17), ft/s; D50 at least 0.2 mm (6.7). */
export const criticalVelocity = (y: number, D50mm: number) => 11.17 * y ** (1 / 6) * ft(Math.max(0.2, D50mm)) ** (1 / 3);

/**
 * Fall velocity of a natural sand grain, ft/s (HEC-18 Figure 6.8 is a chart for SG 2.65): Ferguson and Church (2004),
 * w = R g D² / (C1 ν + (0.75 C2 R g D³)^½), R 1.65, C1 18, C2 1.0, ν 1.0E-6 m²/s (20 °C), in SI and ×3.28 to ft/s.
 */
export function fallVelocity(D50mm: number) {
  const D = D50mm / 1000;
  const R = 1.65;
  const w = (R * 9.81 * D * D) / (18 * 1.0e-6 + Math.sqrt(0.75 * 1.0 * R * 9.81 * D ** 3));
  return w * 3.28;
}

/** Live-bed exponent k1 by the shear velocity over the fall velocity (6.3). */
export const laursenK1 = (ratio: number) => (ratio < 0.5 ? 0.59 : ratio <= 2 ? 0.64 : 0.69);

/** Contraction scour for a flood: live-bed or clear-water (6.3, 6.4), and pressure flow (6.10) where it applies. */
export function contractionScour(c: ScourFlood["contraction"], p: ScourFlood["pressure"], D50mm: number, fallOverride = 0) {
  if (!(c.Q1 > 0 && c.W1 > 0 && c.y1 > 0 && c.Q2 > 0 && c.W2 > 0 && c.y0 > 0)) throw new DesignError("Give the contraction's flows, widths and depths (upstream and at the bridge).");
  const V = c.Q1 / (c.W1 * c.y1);
  const Vc = criticalVelocity(c.y1, D50mm);
  const live = c.mode === "live" || (c.mode === "auto" && V > Vc);
  const Dm = 1.25 * ft(Math.max(0.2, D50mm)); // the smallest nontransportable particle (6.4)
  const fall = fallOverride > 0 ? fallOverride : fallVelocity(D50mm);
  const Vstar = Math.sqrt(g * c.y1 * Math.max(c.S1, 0));
  const k1 = laursenK1(Vstar / fall);
  const liveY2 = (Q2: number, Q1: number, y1: number) => y1 * (Q2 / Q1) ** (6 / 7) * (c.W1 / c.W2) ** k1; // Eq. 6.2
  const clearY2 = (Q: number) => ((0.0077 * Q * Q) / (Dm ** (2 / 3) * c.W2 * c.W2)) ** (3 / 7); // Eq. 6.4
  const yLive = liveY2(c.Q2, c.Q1, c.y1);
  const yClear = clearY2(c.Q2);
  const y2 = live ? (c.armor ? Math.min(yLive, yClear) : yLive) : yClear;
  const ys = Math.max(0, y2 - c.y0);
  // Pressure flow (Eqs. 6.14 to 6.16): the depth to pass the opening's flow at the critical condition, y2, less the
  // opening's height, plus the separation zone under the deck.
  let pressure: { t: number; ht: number; hw: number; y2: number; ys: number; overtopping: boolean } | null = null;
  if (p.on) {
    if (!(p.hu > 0 && p.hb > 0 && p.hu > p.hb && p.Qb > 0)) throw new DesignError("Pressure flow needs the upstream depth above the opening's height, and the flow through the opening.");
    const ht = p.hu - p.hb;
    const hw = ht > p.T ? ht - p.T : 0;
    const overtopping = hw > 0;
    const t = p.hb * 0.5 * ((p.hb * ht) / (p.hu * p.hu)) ** 0.2 * (1 - hw / ht) ** -0.1; // Eq. 6.16
    // Overtopping and live-bed: the effective upstream depth hb + T and channel flow Q1 (hue/hu)^(8/7) (Eq. 6.15).
    const hue = overtopping ? p.hb + p.T : p.hu;
    const Que = overtopping ? c.Q1 * (hue / p.hu) ** (8 / 7) : c.Q1;
    const y2p = live ? (c.armor ? Math.min(liveY2(p.Qb, Que, hue), clearY2(p.Qb)) : liveY2(p.Qb, Que, hue)) : clearY2(p.Qb);
    pressure = { t, ht, hw, y2: y2p, ys: Math.max(0, y2p + t - p.hb), overtopping };
  }
  // A cohesive bed (6.7): the ultimate scour by its critical shear stress (Eq. 6.6, Briaud 2011) in place of the granular
  // equations; with an initial erosion rate and a duration, the scour reached in that time (Eq. 6.8).
  let cohesive: { V2: number; ult: number; ys: number; timed: boolean } | null = null;
  const co = c.cohesive;
  if (co?.on) {
    if (!(co.tauc > 0 && co.n > 0)) throw new DesignError("A cohesive bed needs its critical shear stress and Manning n.");
    const V2 = c.Q2 / (c.W2 * c.y0);
    const ult = Math.max(0, 0.94 * c.y1 * ((1.83 * V2) / Math.sqrt(g * c.y1) - (1.486 * Math.sqrt(co.tauc / 1.94)) / (g * co.n * c.y1 ** (1 / 3))));
    const timed = co.zdot > 0 && co.hours > 0 && ult > 0;
    cohesive = { V2, ult, ys: timed ? co.hours / (1 / co.zdot + co.hours / ult) : ult, timed };
  }
  const ysBed = cohesive ? cohesive.ys : ys;
  return { V, Vc, live, Dm, fall, Vstar, k1, yLive, yClear, y2, ys: ysBed, granular: ys, cohesive, pressure, governs: pressure && pressure.ys > ysBed ? ("pressure" as const) : ("contraction" as const), depth: Math.max(ysBed, pressure?.ys ?? 0) };
}

const K1_SHAPE: Record<Exclude<PierShape, "columns">, number> = { square: 1.1, round: 1.0, circular: 1.0, sharp: 0.9 };
const K3_BED: Record<BedCondition, number> = { clear: 1.1, plane: 1.1, "small-dunes": 1.1, "medium-dunes": 1.2, "large-dunes": 1.3 };

/** FDOT methodology (HEC-18 7.3): the critical velocity (Eqs. 7.12–7.14), the live-bed peak (7.11), and the four regions. */
export function fdotPier(aStar: number, y1: number, V1: number, D50mm: number) {
  const Dmm = Math.min(100, Math.max(0.1, D50mm));
  const ustar = Dmm < 1 ? 0.0377 + 0.041 * Dmm ** 1.4 : 0.1 * Math.sqrt(Dmm) - 0.0213 / Dmm; // ft/s (Ku 1.0)
  const D = ft(Dmm);
  const Vc = 5.75 * ustar * Math.log10((5.53 * y1) / D);
  const Vlp = Math.max(5 * Vc, 0.6 * Math.sqrt(g * y1));
  const f1 = Math.tanh((y1 / aStar) ** 0.4);
  const r = aStar / D;
  const f3 = r ** 1.13 / (10.6 + 0.4 * r ** 1.33);
  const ysC = 2.5 * f1 * f3 * aStar;
  const ysLp = 2.2 * f1 * aStar;
  let ys: number;
  let region: string;
  if (V1 < 0.4 * Vc) [ys, region] = [0, "I (V1 < 0.4Vc, no scour)"];
  else if (V1 <= Vc) [ys, region] = [(1 - 1.2 * Math.log(V1 / Vc) ** 2) * ysC, "II (clear-water)"];
  else if (V1 >= Vlp) [ys, region] = [ysLp, "IV (live-bed peak)"];
  else [ys, region] = [ysC + ((V1 - Vc) / (Vlp - Vc)) * (ysLp - ysC), "III (live-bed)"];
  return { ustar, Vc, Vlp, f1, f3, ysC, ysLp, ys, region };
}

/** Kh pier (HEC-18 Figure 7.6's fit): the pier stem's share over a cap or footing, by h1/a and f/a. */
export function khPier(h1a: number, fa: number) {
  const x = Math.max(-1, Math.min(2, h1a));
  const v = 0.4075 - 0.0669 * fa - (0.4271 - 0.0778 * fa) * x + (0.1615 - 0.0455 * fa) * x * x - (0.0269 - 0.012 * fa) * x ** 3;
  return Math.max(0, Math.min(1, v));
}

/** A complex pier by the superposition of its components (HEC-18 7.5): the stem, the cap or footing, the pile group.
 * h0: the cap's bottom above the bed at the start (after degradation and contraction scour), ft. */
export function complexPier(pier: ScourPier, flow: ScourPier["flow"][number], D50mm: number, h0: number) {
  const cx = pier.complex!;
  const { y1, V1 } = flow;
  const th = (Math.abs(flow.angle) * Math.PI) / 180;
  const K3 = K3_BED[pier.bed];
  const Dft = ft(D50mm);
  const csu = (K1: number, K2: number, a: number, y: number, V: number, Kw = 1) => 2.0 * K1 * K2 * K3 * Kw * a * (y / a) ** 0.35 * (V / Math.sqrt(g * y)) ** 0.43;
  const K2of = (L: number, a: number) => (Math.cos(th) + Math.min(L / a, 12) * Math.sin(th)) ** 0.65;
  const kw = (y: number, a: number, V: number) => {
    const Fr = V / Math.sqrt(g * y);
    if (!pier.wide || !(y < 0.8 * a && Fr < 1 && a > 50 * Dft)) return 1;
    return Math.min(1, V / criticalVelocity(y, D50mm) < 1 ? 2.58 * (y / a) ** 0.34 * Fr ** 0.65 : (y / a) ** 0.13 * Fr ** 0.25);
  };
  // The pier stem (7.5.3, Eq. 7.23): a full-depth pier's scour times Kh pier.
  const a = pier.a;
  const angled = Math.abs(flow.angle) > 5;
  const K1s = angled || pier.shape === "columns" ? 1 : K1_SHAPE[pier.shape];
  const h1 = h0 + cx.T;
  const Kh = khPier(h1 / a, cx.f / a);
  const ysPier = Kh * csu(K1s, K2of(Math.max(pier.L, a), a), a, y1, V1);
  // The cap or footing (7.5.4).
  const y2 = y1 + ysPier / 2;
  const V2 = (V1 * y1) / y2;
  const h2 = h0 + ysPier / 2;
  const K1c = angled ? 1 : cx.capShape === "square" ? 1.1 : 1.0;
  const K2c = K2of(Math.max(cx.capLength, cx.capWidth), cx.capWidth);
  let cap: { case: 1 | 2; aStar: number; y: number; V: number; Kw: number; ys: number };
  if (h2 > 0) {
    // Case 1: its bottom above the bed: an equivalent full-depth pier (Figure 7.7's fit, y2 at most 3.5 apc; Eq. 7.24).
    const yc = Math.min(y2, 3.5 * cx.capWidth);
    const ratio = Math.exp(-2.705 + 0.51 * Math.log(cx.T / yc) - 2.783 * (h2 / yc) ** 3 + 1.751 / Math.exp(h2 / yc));
    const aStar = ratio * cx.capWidth;
    const Kw = kw(y2, aStar, V2);
    cap = { case: 1, aStar, y: y2, V: V2, Kw, ys: csu(K1c, K2c, aStar, y2, V2, Kw) };
  } else {
    // Case 2: on or below the bed: the full width in the flow below its top (Eqs. 7.25, 7.26).
    const yf = Math.max(0.01, h1 + ysPier / 2);
    const Vf = (V2 * Math.log((10.93 * yf) / cx.ks + 1)) / Math.log((10.93 * y2) / cx.ks + 1);
    const Kw = kw(y2, cx.capWidth, V2);
    cap = { case: 2, aStar: cx.capWidth, y: yf, V: Vf, Kw, ys: csu(K1c, K2c, cx.capWidth, yf, Vf, Kw) };
  }
  // The pile group (7.5.5), Case 1 only (Case 2's footing component includes it, Eq. 7.27).
  let group: { aproj: number; Ksp: number; Km: number; aStar: number; h3: number; y3: number; V3: number; Kh: number; ys: number } | null = null;
  const pg = cx.piles;
  if (cap.case === 1 && pg.on && pg.across > 0 && pg.rows > 0 && pg.d > 0) {
    const h3 = h0 + (ysPier + cap.ys) / 2;
    const y3 = y1 + (ysPier + cap.ys) / 2;
    const V3 = (V1 * y1) / y3;
    const aligned = Math.abs(flow.angle) < 1e-6;
    // Projected widths: the collapsed group if aligned; else the non-overlapping projections of the two rows and one
    // column nearest the projection plane (Figure 7.10).
    let aproj: number;
    if (aligned) aproj = pg.across * pg.d;
    else {
      const w = pg.square ? pg.d * (Math.cos(th) + Math.sin(th)) : pg.d;
      const pts: number[] = [];
      for (let r = 0; r < Math.min(2, pg.rows); r++) for (let c = 0; c < pg.across; c++) pts.push(c * pg.S * Math.cos(th) - r * pg.S * Math.sin(th));
      for (let r = 2; r < pg.rows; r++) pts.push(-r * pg.S * Math.sin(th));
      const iv = pts.map((p) => [p - w / 2, p + w / 2]).sort((u, v) => u[0] - v[0]);
      aproj = 0;
      let end = -Infinity;
      for (const [lo, hi] of iv) {
        if (hi > end) aproj += hi - Math.max(lo, end);
        end = Math.max(end, hi);
      }
    }
    const Sd = pg.S / pg.d;
    const Ksp = 1 - (4 / 3) * (1 - 1 / (aproj / pg.d)) * (1 - Sd ** -0.6); // Figure 7.11's fit
    const Km = aligned ? 0.9 + 0.1 * pg.rows - 0.0714 * (pg.rows - 1) * (2.4 - 1.1 * Sd + 0.1 * Sd * Sd) : 1; // Figure 7.12's
    const aStar = aproj * Ksp * Km; // Eq. 7.28
    const y3c = Math.min(y3, 3.5 * aStar);
    const x = Math.max(0, Math.min(1, h3 / y3c));
    const Khpg = Math.max(0, 3.08 * x - 5.23 * x * x + 5.25 * x ** 3 - 2.1 * x ** 4) ** (1 / 0.65); // Figure 7.13's
    const K1p = pg.square ? 1.1 : 1.0;
    const ys = Khpg * 2.0 * K1p * K3 * aStar * (y3c / aStar) ** 0.35 * (V3 / Math.sqrt(g * y3c)) ** 0.43; // Eq. 7.31
    group = { aproj, Ksp, Km, aStar, h3, y3: y3c, V3, Kh: Khpg, ys };
  }
  return { h0, h1, Kh, ysPier, cap, group, ys: ysPier + cap.ys + (group?.ys ?? 0) };
}

/**
 * Local pier scour: HEC-18's CSU equation (Eqs. 7.1/7.3) with its factors, or FDOT's (7.3); a complex pier by
 * superposition (7.5); a cohesive bed by Eq. 7.35; erodible rock by the Erodibility Index method and abrasion (7.13).
 * `bedDrop`: degradation and contraction scour, lowering the bed under a cap or footing first (7.5.2).
 */
export function pierScour(pier: ScourPier, flow: ScourPier["flow"][number], D50mm: number, bedDrop = 0) {
  const { y1, V1 } = flow;
  if (!(pier.a > 0 && y1 > 0 && V1 >= 0)) throw new DesignError(`${pier.name}: give its width and the flow's depth and velocity.`);
  const th = (Math.abs(flow.angle) * Math.PI) / 180;
  const Fr = V1 / Math.sqrt(g * y1);
  const K3 = K3_BED[pier.bed];
  const notes: string[] = [];
  // Multiple columns (7.6): closer than 5 diameters, the projected width of the bent with K1 = K2 = 1; at 5 or more
  // and no debris, 1.2 times a single column. With debris, the bent and its debris as one solid pier.
  const cols = pier.shape === "columns" && pier.columns.n > 1;
  const solidCols = cols && pier.debris.on;
  let a = pier.a;
  let L = Math.max(pier.L, pier.a);
  let K1 = pier.shape === "columns" ? 1.0 : K1_SHAPE[pier.shape];
  let groupFactor = 1;
  if (cols && !solidCols) {
    const s = pier.columns.spacing;
    if (s < 5 * pier.a) {
      a = pier.a + (pier.columns.n - 1) * Math.min(pier.a, s * Math.sin(th)); // the union of the columns' widths, normal to the flow
      L = a;
      notes.push(`columns closer than 5 diameters: the bent's projected width ${a.toFixed(2)} ft, K1 = K2 = 1.0`);
    } else {
      groupFactor = 1.2;
      notes.push("columns 5 diameters or more apart: 1.2 times a single column");
    }
  } else if (solidCols) {
    L = (pier.columns.n - 1) * pier.columns.spacing + pier.a;
    notes.push(`columns with debris: one solid pier ${L.toFixed(2)} ft long`);
  }
  // Debris (Eq. 7.32): the effective width, debris as long as the flow is deep and floating (the worst case).
  let ad: number | null = null;
  if (pier.debris.on) {
    const Kd = pier.debris.shape === "rectangular" ? 0.79 : 0.21;
    const H = Math.min(pier.debris.H, y1 / Kd);
    ad = (Kd * H * pier.debris.W + (y1 - Kd * H) * a) / y1;
    if (ad > a) {
      a = ad;
      notes.push(`debris: the effective width a*d ${ad.toFixed(2)} ft`);
    }
  }
  const angled = Math.abs(flow.angle) > 5;
  if (angled && !cols) K1 = 1.0; // K2 dominates beyond 5° (Table 7.3 Note 1)
  const LA = Math.min(L / a, 12);
  const K2 = cols && !solidCols ? 1.0 : (Math.cos(th) + LA * Math.sin(th)) ** 0.65; // Eq. 7.4
  // The wide-pier factor (Eqs. 7.20, 7.21) where it applies: y/a < 0.8, a/D50 > 50, subcritical; by judgment.
  const Vc = criticalVelocity(y1, D50mm);
  const wideApplies = y1 / a < 0.8 && a / ft(D50mm) > 50 && Fr < 1;
  const Kw = pier.wide && wideApplies ? Math.min(1, V1 / Vc < 1 ? 2.58 * (y1 / a) ** 0.34 * Fr ** 0.65 : (y1 / a) ** 0.13 * Fr ** 0.25) : 1;
  if (pier.wide && !wideApplies) notes.push("Kw not applied: it needs y/a < 0.8, a/D50 > 50 and subcritical flow");
  const ys = groupFactor * 2.0 * K1 * K2 * K3 * Kw * a * (y1 / a) ** 0.35 * Fr ** 0.43; // Eq. 7.3
  // The rule of thumb (Eq. 7.2) for round-nosed piers aligned with the flow: shown, not applied (it would lower scour).
  const limit = (Fr <= 0.8 ? 2.4 : 3.0) * a;
  const hec = { a, ad, L, K1, K2, K3, Kw, Fr, Vc, wideApplies, groupFactor, ys, limit, notes };
  const none = { complex: null, fdot: null, rock: null };
  const mat = pier.material?.kind ?? "granular";
  // A cohesive bed (Eq. 7.35, Briaud 2011), by the material's critical velocity.
  if (mat === "cohesive") {
    const m = pier.material!;
    if (!(m.Vc > 0)) throw new DesignError(`${pier.name}: give the cohesive bed's critical velocity.`);
    const ysC = 2.2 * K1 * K2 * a ** 0.65 * Math.max(0, (2.6 * V1 - m.Vc) / Math.sqrt(g)) ** 0.7;
    return { ...hec, ...none, ys: groupFactor * ysC, method: "cohesive" as const, notes: [...notes, `cohesive bed (Eq. 7.35), Vc ${m.Vc} ft/s`] };
  }
  // Erodible rock (7.13): quarrying and plucking by the Erodibility Index K (Eqs. 7.37–7.40, in SI), plus abrasion (7.41).
  if (mat === "rock") {
    const m = pier.material!;
    if (!(m.K > 0 && m.S > 0)) throw new DesignError(`${pier.name}: give the rock's erodibility index and the energy slope.`);
    const Pc = m.K ** 0.75; // kW/m², Eq. 7.38
    const tau = 9810 * (y1 * 0.3048) * m.S; // Pa, γ y S
    const Pa = (7.853 * 1000 * (tau / 1000) ** 1.5) / 1000; // kW/m², Eq. 7.39
    const ratio = Math.max(0, Math.log((8.42 * Pa) / Pc) / 0.712); // ys/b where P (Eq. 7.40) falls to Pc
    const plucking = ratio * a;
    const abrasion = Math.max(0, m.GSN) * Math.max(0, m.omega);
    return { ...hec, ...none, ys: plucking + abrasion, method: "rock" as const, rock: { Pc, tau, Pa, ratio, plucking, abrasion }, notes: [...notes, `rock: K ${m.K}, Pc ${Pc.toFixed(2)} kW/m², Pa ${Pa.toFixed(3)} kW/m²${abrasion > 0 ? `, abrasion ${abrasion.toFixed(2)} ft` : ""}`] };
  }
  // A complex pier (7.5), each component by HEC-18's equation.
  if (pier.complex?.on && pier.shape !== "columns") {
    const cx = complexPier(pier, flow, D50mm, pier.complex.capBottom - (pier.datum - bedDrop));
    return { ...hec, ...none, ys: cx.ys, method: "complex" as const, complex: cx, notes: [...notes, `complex pier: stem ${cx.ysPier.toFixed(2)} + ${cx.cap.case === 1 ? "cap" : "footing"} ${cx.cap.ys.toFixed(2)}${cx.group ? ` + piles ${cx.group.ys.toFixed(2)}` : ""} ft`] };
  }
  // FDOT (7.3): a* = Ksf · a_proj (Eqs. 7.15–7.18), L/a at most 12 as HEC-18's example takes it.
  if (pier.method === "fdot") {
    const Ksf = pier.shape === "square" ? 0.86 + 0.97 * Math.abs(th - Math.PI / 4) ** 4 : 1.0;
    const aproj = cols && !solidCols ? a : a * Math.cos(th) + Math.min(L, 12 * a) * Math.sin(th);
    const fd = fdotPier(Ksf * aproj, y1, V1, D50mm);
    return { ...hec, ...none, ys: groupFactor * fd.ys, method: "fdot" as const, fdot: { ...fd, Ksf, aproj, aStar: Ksf * aproj }, notes: [...notes, `FDOT region ${fd.region}, a* ${(Ksf * aproj).toFixed(2)} ft${pier.debris.on ? "; the debris's effective width isn't validated for FDOT (HEC-18 7.7.3)" : ""}`] };
  }
  return { ...hec, ...none, method: "hec18" as const };
}

// NCHRP 24-20 amplification factors, read from HEC-18 Figures 8.9 to 8.12 (the solid design curves), as
// [q2/q1, α]; linear in ln(q2/q1) between them, held at the ends.
export const ALPHA: Record<"A" | "B", Record<ScourAbutment["type"], [number, number][]>> = {
  A: {
    "spill-through": [[1.0, 1.2], [1.05, 1.52], [1.1, 1.59], [1.2, 1.67], [1.25, 1.675], [1.3, 1.65], [1.4, 1.53], [1.5, 1.41], [1.6, 1.31], [1.75, 1.25], [2.0, 1.17], [2.5, 1.12], [3.0, 1.1]],
    wingwall: [[1.0, 1.2], [1.05, 1.51], [1.1, 1.58], [1.2, 1.73], [1.28, 1.76], [1.4, 1.72], [1.5, 1.6], [1.6, 1.51], [1.7, 1.41], [1.8, 1.34], [2.0, 1.23], [2.2, 1.16], [2.5, 1.12], [3.0, 1.1]],
  },
  B: {
    "spill-through": [[1.0, 1.0], [1.05, 1.38], [1.1, 1.69], [1.2, 1.97], [1.3, 2.1], [1.45, 2.19], [1.6, 2.16], [1.8, 2.09], [2.0, 2.0], [2.5, 1.75], [3.0, 1.5], [3.5, 1.35], [4.0, 1.24], [5.0, 1.13]],
    wingwall: [[1.0, 1.0], [1.05, 2.26], [1.1, 2.49], [1.2, 2.62], [1.3, 2.57], [1.4, 2.47], [1.6, 2.23], [1.8, 2.11], [2.0, 1.99], [2.5, 1.74], [3.0, 1.5], [3.5, 1.35], [4.0, 1.24], [5.0, 1.14]],
  },
};

/** An amplification factor from its curve at q2/q1. */
export function alphaFor(condition: "A" | "B", type: ScourAbutment["type"], ratio: number) {
  const pts = ALPHA[condition][type];
  const r = Math.max(pts[0][0], Math.min(pts[pts.length - 1][0], ratio));
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, y0] = pts[k];
    const [x1, y1] = pts[k + 1];
    if (r >= x0 && r <= x1) return y0 + ((y1 - y0) * Math.log(r / x0)) / Math.log(x1 / x0);
  }
  return pts[pts.length - 1][1];
}

/** Abutment scour by NCHRP 24-20 (HEC-18 8.6.3): condition (a) live-bed in or near the channel, (b) clear-water set back. */
export function abutmentScour(ab: ScourAbutment, flow: ScourAbutment["flow"][number], i: Pick<ScourInputs, "D50" | "tauc" | "nFloodplain">) {
  const { q1, q2, y1, y0 } = flow;
  if (!(q1 > 0 && q2 > 0 && y0 > 0)) throw new DesignError(`${ab.name}: give the unit discharges upstream and at the abutment, and the depth before scour.`);
  const condition: "A" | "B" = ab.LBf >= 0.75 ? "A" : "B";
  const ratio = q2 / q1;
  let yc: number;
  let how: string;
  if (condition === "A") {
    if (!(y1 > 0)) throw new DesignError(`${ab.name}: condition (a) needs the upstream flow depth.`);
    yc = y1 * ratio ** (6 / 7); // Eq. 8.5
    how = "live-bed, Eq. 8.5";
  } else if (i.tauc > 0) {
    yc = (62.4 / i.tauc) ** (3 / 7) * ((i.nFloodplain * q2) / 1.486) ** (6 / 7); // Eq. 8.7
    how = "clear-water by the critical shear stress, Eq. 8.7";
  } else {
    yc = (q2 / (11.17 * ft(Math.max(0.2, i.D50)) ** (1 / 3))) ** (6 / 7); // Eq. 8.6
    how = "clear-water by grain size, Eq. 8.6";
  }
  const alpha = alphaFor(condition, ab.type, ratio);
  const ymax = alpha * yc; // Eq. 8.3
  return { condition, ratio, yc, how, alpha, ymax, ys: Math.max(0, ymax - y0) }; // Eq. 8.4
}

export type ElementResult = {
  name: string;
  kind: "pier" | "abutment";
  support?: number;
  datum: number;
  floods: { name: string; ltd: number; contraction: number; local: number; total: number; elevation: number; rockLimited: boolean }[];
};

export function designScour(i: ScourInputs) {
  if (!i.floods.length) throw new DesignError("Add the scour design flood (and the check flood).");
  if (!(i.D50 > 0)) throw new DesignError("Give the bed material's D50.");
  const checks: Check[] = [];
  const add = (c: Omit<Check, "ok"> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.demand <= c.capacity });
  const contraction = i.floods.map((f) => contractionScour(f.contraction, f.pressure, i.D50, i.fall));
  const elev = (datum: number, total: number, rock: number | null) => {
    const e = datum - total;
    return rock !== null && Number.isFinite(rock) && e < rock ? { elevation: rock, rockLimited: true } : { elevation: e, rockLimited: false };
  };
  const piers = i.piers.map((p) => {
    const local = i.floods.map((f, k) => pierScour(p, p.flow[k] ?? p.flow[0], i.D50, f.ltd + (p.contraction ? contraction[k].depth : 0)));
    const floods = i.floods.map((f, k) => {
      const cs = p.contraction ? contraction[k].depth : 0;
      const total = f.ltd + cs + local[k].ys;
      return { name: f.name, ltd: f.ltd, contraction: cs, local: local[k].ys, total, ...elev(p.datum, total, p.rock) };
    });
    return { pier: p, local, element: { name: p.name, kind: "pier" as const, support: p.support, datum: p.datum, floods } satisfies ElementResult };
  });
  const abutments = i.abutments.map((a) => {
    const local = i.floods.map((f, k) => abutmentScour(a, a.flow[k] ?? a.flow[0], i));
    const floods = i.floods.map((f, k) => {
      const total = f.ltd + local[k].ys;
      return { name: f.name, ltd: f.ltd, contraction: 0, local: local[k].ys, total, ...elev(a.datum, total, a.rock) };
    });
    return { abutment: a, local, element: { name: a.name, kind: "abutment" as const, support: a.support, datum: a.datum, floods } satisfies ElementResult };
  });
  // Advisory checks: the equations' ranges, and what they lean on.
  if (i.D50 < 0.2) add({ id: "d50", name: "D50 at least 0.2 mm in the critical velocity and clear-water equations (smaller sizes are cohesive)", demand: 0.2, capacity: i.D50, unit: "mm", ref: "HEC-18 6.7", advisory: true, ok: false });
  piers.forEach(({ pier, local }) =>
    local.forEach((l, k) => {
      add({ id: `pier-fr-${pier.name}-${k}`, name: `${pier.name}, ${i.floods[k].name}: rule-of-thumb limit for round-nosed aligned piers, ys ≤ ${l.Fr <= 0.8 ? "2.4" : "3.0"}a (shown, not applied)`, demand: l.ys, capacity: l.limit, unit: "ft", ref: "HEC-18 Eq. 7.2", advisory: true });
    }),
  );
  const elements = [...piers.map((p) => p.element), ...abutments.map((a) => a.element)];
  return { contraction, piers, abutments, elements, checks, ok: true };
}

export type ScourResult = ReturnType<typeof designScour>;

/** A pier's flow for a flood, as the defaults give it. */
const pierFlow = (y1: number, V1: number) => ({ y1, V1, angle: 0 });
/** Off by default: a granular bed, no cap or footing in the flow. */
export const COHESIVE_OFF = { on: false, tauc: 0.05, n: 0.025, zdot: 0, hours: 0 };
export const MATERIAL_DEFAULT: PierMaterial = { kind: "granular", Vc: 0, K: 0, S: 0.002, GSN: 0, omega: 0 };
export const COMPLEX_OFF: ComplexPier = { on: false, capWidth: 8, capLength: 30, T: 4, capBottom: 92, f: 2.5, ks: 0.01, capShape: "square", piles: { on: false, across: 3, rows: 2, d: 1.5, S: 4.5, square: false } };

/**
 * Defaults: HEC-18's own example values where it has them (a 100-year design flood and a 500-year check flood on a
 * sand-bed channel), one round-nosed pier and two spill-through abutments.
 */
export const SCOUR_DEFAULTS: ScourInputs = {
  D50: 1.0,
  fall: 0,
  tauc: 0,
  nFloodplain: 0.035,
  floods: [
    { name: "Scour design flood (Q100)", ltd: 0, contraction: { mode: "auto", Q1: 2000, W1: 40, y1: 10, S1: 0.002, Q2: 2800, W2: 40, y0: 10, armor: false, cohesive: COHESIVE_OFF }, pressure: { on: false, hu: 10, hb: 8, T: 3, Qb: 2800 } },
    { name: "Scour design check flood (Q500)", ltd: 0, contraction: { mode: "auto", Q1: 2600, W1: 40, y1: 11.5, S1: 0.002, Q2: 3800, W2: 40, y0: 10, armor: false, cohesive: COHESIVE_OFF }, pressure: { on: false, hu: 11.5, hb: 8, T: 3, Qb: 3800 } },
  ],
  piers: [
    { name: "Pier 2", support: undefined, shape: "round", a: 3, L: 30, columns: { n: 3, spacing: 12 }, bed: "clear", wide: false, contraction: true, debris: { on: false, shape: "rectangular", W: 10, H: 3 }, datum: 100, rock: null, flow: [pierFlow(10, 7), pierFlow(11.5, 8)], method: "hec18", material: MATERIAL_DEFAULT, complex: COMPLEX_OFF },
  ],
  abutments: [
    { name: "Abutment 1", type: "spill-through", LBf: 0.6, datum: 105, rock: null, flow: [{ q1: 5.7, q2: 10.1, y1: 3.5, y0: 3.5 }, { q1: 7, q2: 13, y1: 4.5, y0: 4.5 }] },
  ],
};

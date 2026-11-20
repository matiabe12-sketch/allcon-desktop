import { ES } from "./steel-section";

// The details of a steel I-girder that AASHTO LRFD 10th Edition checks apart from its cross-section:
// load-induced fatigue of its welded details (6.6.1.2), the shear connectors' pitch for fatigue and their
// number for strength (6.10.10), the intermediate transverse stiffeners (6.10.11.1), the bearing stiffeners
// (6.10.11.2) or, without them, the web's local yielding and crippling (D6.5). Inches, kips and ksi.

/** A fatigue detail category (Table 6.6.1.2.3-1): A in ksi^m, the growth constant m and the threshold (ΔF)TH. */
export type FatigueCategory = "A" | "B" | "B'" | "C" | "C'" | "D" | "E" | "E'";
export const FATIGUE_CATEGORIES: Record<FatigueCategory, { A: number; m: number; TH: number }> = {
  A: { A: 250e8, m: 3, TH: 24 },
  B: { A: 120e8, m: 3, TH: 16 },
  "B'": { A: 61e8, m: 3, TH: 12 },
  C: { A: 44e8, m: 3, TH: 10 },
  "C'": { A: 44e8, m: 3, TH: 12 },
  D: { A: 22e8, m: 3, TH: 7 },
  E: { A: 11e8, m: 3, TH: 4.5 },
  "E'": { A: 3.9e8, m: 3, TH: 2.6 },
};
/** Condition 9.2: shear connectors, for their fatigue resistance Zr (6.10.10.2). */
export const STUD_FATIGUE = { A: 1040e8, m: 5, TH: 7 };

export const FATIGUE_I = 1.75;
export const FATIGUE_II = 0.8;
export const FATIGUE_IM = 0.15; // Table 3.6.2.1-1

/**
 * The fatigue load combination and nominal resistance of a detail (6.6.1.2.3, 6.6.1.2.5): Fatigue I with the
 * threshold (infinite life) where the single-lane ADTT is above the one equivalent to infinite life
 * (Eq. C6.6.1.2.3-1, for n cycles per truck and the design life), else Fatigue II with the finite-life resistance.
 */
export function fatigueResistance(c: { A: number; m: number; TH: number }, adttSL: number, cycles: number, life = 75) {
  const infinite = c.A / ((FATIGUE_II / FATIGUE_I) * c.TH) ** c.m / (365 * life * cycles);
  if (adttSL > infinite) return { gamma: FATIGUE_I, Fn: c.TH, combo: "Fatigue I" as const, N: Infinity, infinite };
  const N = 365 * life * cycles * adttSL;
  return { gamma: FATIGUE_II, Fn: (c.A / N) ** (1 / c.m), combo: "Fatigue II" as const, N, infinite };
}

/** Cycles per truck passage (Table 6.6.1.2.5-1): 1.5 within a tenth of the span either side of an interior support. */
export function cyclesPerTruck(spans: number[], s: number, x: number) {
  if (spans.length < 2) return 1;
  const nearLeft = s > 0 && x <= 0.1 * spans[s] + 1e-9;
  const nearRight = s < spans.length - 1 && spans[s] - x <= 0.1 * spans[s] + 1e-9;
  return nearLeft || nearRight ? 1.5 : 1;
}

// --- Shear connectors (6.10.10) ---------------------------------------------------------------------------

export type Studs = { d: number; perRow: number; pitch: number; height: number; Fu: number };

/** One stud's fatigue resistance Zr = (ΔF)n Asc (Eq. 6.10.10.2-1, Condition 9.2) and its strength Qr = φsc 0.70 Asc Fu (6.10.10.4). */
export function studResistance(st: Studs, adttSL: number, cycles: number, life = 75) {
  const Asc = (Math.PI * st.d ** 2) / 4;
  const f = fatigueResistance(STUD_FATIGUE, adttSL, cycles, life);
  return { Asc, Zr: f.Fn * Asc, gamma: f.gamma, combo: f.combo, Qn: 0.7 * Asc * st.Fu, Qr: 1.0 * 0.7 * Asc * st.Fu };
}

/** The most pitch the fatigue shear range allows (Eq. 6.10.10.1.2-1): p = n Zr / Vsr with Vsr = Vf Q / I (straight girders, Ffat = 0). */
export function studPitchForFatigue(perRow: number, Zr: number, Vf: number, Q: number, I: number) {
  const Vsr = (Vf * Q) / I; // kip/in
  return { Vsr, pitch: Vsr > 0 ? (perRow * Zr) / Vsr : Infinity };
}

/** The pitch limits (6.10.10.1.2): at most 48 in (24 in for webs shallower than 24 in), at least four stud diameters. */
export const studPitchLimits = (d: number, D: number) => ({ max: D >= 24 ? 48 : 24, min: 4 * d });

/** The studs that fit across a flange: 4d apart center to center, 1 in clear to the flange's edges (6.10.10.1.3). */
export const studsAcross = (bf: number, d: number) => Math.max(0, Math.floor((bf - 2 - d) / (4 * d)) + 1);

// --- Transverse stiffeners (6.10.11.1) ------------------------------------------------------------------

export type StiffenerPlate = { bt: number; tp: number; Fys: number; pair: boolean };

/** An intermediate transverse stiffener's projecting width (6.10.11.1.2) and moment of inertia (6.10.11.1.3). */
export function transverseStiffener(p: { st: StiffenerPlate; D: number; tw: number; do: number; bfMax: number; Fyw: number; rhoW: number; tensionField: boolean }) {
  const { st, D, tw, Fyw } = p;
  const It = st.pair ? (st.tp * (2 * st.bt + tw) ** 3) / 12 : (st.tp * st.bt ** 3) / 3;
  const b = Math.min(p.do, D);
  const J = Math.max(0.5, 2.5 / (p.do / D) ** 2 - 2);
  const It1 = b * tw ** 3 * J;
  const Fcrs = Math.min((0.31 * ES) / (st.bt / st.tp) ** 2, st.Fys);
  const rhoT = Math.max(Fyw / Fcrs, 1);
  const It2 = ((D ** 4 * rhoT ** 1.3) / 40) * (Fyw / ES) ** 1.5;
  const required = !p.tensionField ? Math.min(It1, It2) : It2 > It1 ? It1 + (It2 - It1) * Math.max(0, Math.min(1, p.rhoW)) : It2;
  return {
    It,
    It1,
    It2,
    required,
    Fcrs,
    widthMin: Math.max(2 + D / 30, p.bfMax / 4), // Eqs. 6.10.11.1.2-1, -2
    widthMax: 16 * st.tp,
  };
}

// --- Bearing stiffeners (6.10.11.2) -----------------------------------------------------------------------

export type BearingStiffeners = { bt: number; tp: number; Fys: number; clip: number; pairsEnd: number; pairsPier: number; gap: number };

/** Plate bearing stiffeners welded to the web: width-thickness, fitted-end bearing (1.4 Apn Fys) and the effective column with 9tw of web each side (6.9.4.1, KL = 0.75D). */
export function bearingStiffener(b: BearingStiffeners, pairs: number, D: number, tw: number) {
  const n = Math.max(1, Math.round(pairs));
  const btMax = 0.48 * b.tp * Math.sqrt(ES / b.Fys); // Eq. 6.10.11.2.2-1
  const Apn = n * 2 * Math.max(0, b.bt - b.clip) * b.tp;
  const Rr = 1.0 * 1.4 * Apn * b.Fys; // Eqs. 6.10.11.2.3-1, -2, φb = 1.0
  const strip = (18 * tw + (n - 1) * b.gap) * tw;
  const As = n * 2 * b.bt * b.tp + strip;
  const Is = (n * b.tp * (2 * b.bt + tw) ** 3) / 12;
  const r = Math.sqrt(Is / As);
  const KL = 0.75 * D;
  const slender = KL / r;
  const Pe = (Math.PI ** 2 * ES * As) / slender ** 2;
  const Po = b.Fys * As; // Q = 1
  const Pn = Pe / Po >= 0.44 ? 0.658 ** (Po / Pe) * Po : 0.877 * Pe; // Eqs. 6.9.4.1.1-1, -2
  return { btMax, Apn, Rr, As, Is, r, KL, slender, Pe, Po, Pn, Pr: 0.95 * Pn };
}

/** Without bearing stiffeners: web local yielding (D6.5.2) and web crippling (D6.5.3) at a bearing N long; k from the flange's outer face to the web toe of the fillet. */
export function webAtBearing(p: { N: number; k: number; tw: number; tf: number; d: number; Fyw: number; end: boolean }) {
  const { N, k, tw, tf, d, Fyw, end } = p;
  const yielding = (end ? 2.5 * k + N : 5 * k + N) * Fyw * tw; // φb = 1.0
  const root = Math.sqrt((ES * Fyw * tf) / tw);
  const crippling = !end
    ? 0.8 * tw ** 2 * (1 + 3 * (N / d) * (tw / tf) ** 1.5) * root
    : N / d <= 0.2
      ? 0.4 * tw ** 2 * (1 + 3 * (N / d) * (tw / tf) ** 1.5) * root
      : 0.4 * tw ** 2 * (1 + ((4 * N) / d - 0.2) * (tw / tf) ** 1.5) * root;
  return { yielding, crippling, phiCrippling: 0.8 * crippling };
}

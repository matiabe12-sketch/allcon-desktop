import { ES } from "./steel-section";

// AASHTO LRFD 10th Edition Appendices A6 and B6 for composite I-girders in negative flexure: the yield
// moments (D6.2.3), the flexural resistance of sections with compact or noncompact webs (A6, which can
// reach Mp), and the moment redistribution from interior-pier sections (B6, the simplified method of
// B6.3 to B6.5). Inches, kips, kip·in and ksi.

/** The yield moments of a composite section in negative flexure (D6.2.2 by D6.2.3): DC1 (factored) on the steel, the rest on the steel and bars. */
export function negativeYieldMoments(p: { MD1: number; steel: { Stop: number; Sbot: number }; bars: { Stop: number; Sbot: number; Sbars: number }; Fyc: number; Fyt: number; fyBars: number }) {
  const MD1 = Math.abs(p.MD1);
  const Myc = MD1 + (p.Fyc - MD1 / p.steel.Sbot) * p.bars.Sbot; // compression (bottom) flange
  const MytFlange = MD1 + (p.Fyt - MD1 / p.steel.Stop) * p.bars.Stop; // tension (top) flange
  const MytBars = p.fyBars * p.bars.Sbars; // the bars, MD1 = 0
  return { Myc, Myt: Math.min(MytFlange, MytBars), MytFlange, MytBars };
}

export type A6Input = {
  D: number;
  tw: number;
  bfc: number;
  tfc: number;
  bft: number;
  tft: number;
  Dc: number; // in, elastic (D6.3.1)
  Dcp: number; // in, at Mp (D6.3.2)
  Mp: number; // kip·in
  Myc: number;
  Myt: number;
  SxcElastic: number; // in³, the section modulus to the compression flange, for Lr
  Fyc: number;
  Fyt: number;
  Fyw: number;
  Rh: number;
  Lb: number; // in
  Cb: number;
  rolled: boolean;
};

/** Appendix A6: applicability (A6.1), web plastification factors (A6.2), FLB (A6.3.2), LTB (A6.3.3) and tension yielding (A6.4). */
export function appendixA6(p: A6Input) {
  const { D, tw, bfc, tfc, bft, tft, Dc, Dcp, Mp, Myc, Myt, Fyc, Fyt, Fyw, Rh, Lb, Cb } = p;
  const lw = (2 * Dc) / tw;
  const awc = (2 * Dc * tw) / (bfc * tfc);
  const crw = Math.min(5.7, Math.max(4.6, 3.1 + 5 / awc));
  const lrw = crw * Math.sqrt(ES / Fyc);
  const IycIyt = (tfc * bfc ** 3) / (tft * bft ** 3);
  const reasons: string[] = [];
  if (Math.max(Fyc, Fyt, Fyw) > 70) reasons.push("yield strength above 70 ksi");
  if (lw > lrw) reasons.push(`slender web, 2Dc/tw ${lw.toFixed(1)} > λrw ${lrw.toFixed(1)}`);
  if (IycIyt < 0.3) reasons.push(`Iyc/Iyt ${IycIyt.toFixed(2)} < 0.3`);
  const My = Math.min(Myc, Myt);
  const lpwDcp = Math.min(Math.sqrt(ES / Fyc) / (0.54 * (Mp / (Rh * My)) - 0.09) ** 2, lrw * (Dcp / Dc)); // Eq. A6.2.1-2
  const compact = (2 * Dcp) / tw <= lpwDcp;
  let Rpc: number;
  let Rpt: number;
  const lpwDc = Math.min(lpwDcp * (Dc / Dcp), lrw); // Eq. A6.2.2-8
  if (compact) {
    Rpc = Mp / Myc;
    Rpt = Mp / Myt;
  } else {
    const f = (lw - lpwDc) / (lrw - lpwDc);
    Rpc = Math.min(Mp / Myc, (1 - (1 - (Rh * Myc) / Mp) * f) * (Mp / Myc)); // Eq. A6.2.2-6
    Rpt = Math.min(Mp / Myt, (1 - (1 - (Rh * Myt) / Mp) * f) * (Mp / Myt)); // Eq. A6.2.2-7
  }
  const Sxc = Myc / Fyc;
  const Sxt = Myt / Fyt;
  // Flange local buckling (A6.3.2).
  const lf = bfc / (2 * tfc);
  const lpf = 0.38 * Math.sqrt(ES / Fyc);
  const kc = p.rolled ? 0.76 : Math.min(0.76, Math.max(0.35, 4 / Math.sqrt(D / tw)));
  const Fyr = Math.max(0.5 * Fyc, Math.min(0.7 * Fyc, (Rh * Fyt * Sxt) / Sxc, Fyw));
  const lrf = 0.95 * Math.sqrt((ES * kc) / Fyr);
  const flb = lf <= lpf ? Rpc * Myc : (1 - (1 - (Fyr * Sxc) / (Rpc * Myc)) * ((lf - lpf) / (lrf - lpf))) * Rpc * Myc;
  // Lateral-torsional buckling (A6.3.3.1, A6.3.3.2), prismatic unbraced length.
  const rt = bfc / Math.sqrt(12 * (1 + (Dc * tw) / (3 * bfc * tfc)));
  const Lp = 1.1 * rt * Math.sqrt(ES / Fyc);
  const FyrL = p.rolled ? 0.7 * Fyc : 0.5 * Fyc;
  const J = (D * tw ** 3) / 3 + ((bfc * tfc ** 3) / 3) * (1 - 0.63 * (tfc / bfc)) + ((bft * tft ** 3) / 3) * (1 - 0.63 * (tft / bft)); // Eq. A6.3.3.1-6
  const h = D + tfc / 2 + tft / 2;
  const Se = p.SxcElastic;
  const Lr = 1.95 * rt * (ES / FyrL) * Math.sqrt(J / (Se * h)) * Math.sqrt(1 + Math.sqrt(1 + 6.76 * ((FyrL * Se * h) / (ES * J)) ** 2)); // Eq. A6.3.3.1-5
  const Fe = ((Cb * Math.PI ** 2 * ES) / (Lb / rt) ** 2) * Math.sqrt(1 + ((0.078 * J) / (Sxc * h)) * (Lb / rt) ** 2); // Eq. A6.3.3.2-1
  const plateau = Rpc * Myc;
  const ltb = Lb <= Lp ? plateau : Lb <= Lr ? Math.min(plateau, Cb * (1 - (1 - (FyrL * Sxc) / plateau) * ((Lb - Lp) / (Lr - Lp))) * plateau) : Math.min(plateau, Fe * Sxc);
  const Mnc = Math.min(flb, ltb);
  const Mnt = Rpt * Myt; // A6.4
  return { applicable: reasons.length === 0, reasons, lw, lrw, crw, IycIyt, lpwDcp, lpwDc, compact, Rpc, Rpt, Sxc, Sxt, lf, lpf, kc, Fyr, lrf, flb, rt, Lp, Lr, FyrL, J, h, Fe, ltb, Mnc, Mnt, governs: flb <= ltb ? "local buckling" : "lateral-torsional buckling" };
}

/** Appendix B6.5: the effective plastic moment of an interior-pier section, for the strength and the service limit states. */
export function effectivePlasticMoment(p: { Mn: number; D: number; bfc: number; tfc: number; Fyc: number; enhanced: boolean }) {
  const s = (p.bfc / p.tfc) * Math.sqrt(p.Fyc / ES);
  const r = p.D / p.bfc;
  const f = (c: number) => c - 2.3 * s - 0.35 * r + 0.39 * s * r;
  const strength = Math.min(p.Mn, f(p.enhanced ? 2.78 : 2.63) * p.Mn); // Eqs. B6.5.1-3, B6.5.2-2
  const service = p.enhanced ? p.Mn : Math.min(p.Mn, f(2.9) * p.Mn); // Eqs. B6.5.1-2, B6.5.2-1
  return { strength, service };
}

/** The redistribution moment at an interior pier (Eqs. B6.4.2.1-1 to -3 and B6.3.3.1-1, -2), kip·in, sagging +. */
export function redistributionMoment(Me: number, Mpe: number, phi = 1) {
  const raw = Math.abs(Me) - phi * Mpe;
  return { raw, Mrd: Math.max(0, raw), limit: 0.2 * Math.abs(Me) };
}

// --- Appendix B6.6, the refined method: rotational continuity with the piers' moment-rotation curves ---

/** θRL, the plastic rotation at which an interior-pier section's moment begins to drop (Eqs. B6.6.2-1, -2), rad. */
export function thetaRL(p: { D: number; bfc: number; tfc: number; Fyc: number; enhanced: boolean }) {
  const s = (p.bfc / p.tfc) * Math.sqrt(p.Fyc / ES);
  const r = p.D / p.bfc;
  return (p.enhanced ? 0.137 : 0.128) - 0.143 * s - 0.0216 * r + 0.0241 * s * r;
}

/**
 * The unit rotational stiffness constants kθij (Eq. B6.6.1): the moment at pier i from a unit plastic rotation at
 * pier j, kip·in/rad, on the girder line's stiffness EI(X) (kip·in², X in ft), the deck effective over the whole
 * length. The pier moments are the redundants of the simple spans; their flexibility F (rotation discontinuity at
 * pier i from a unit moment at pier j) inverted.
 */
export function rotationalStiffness(spans: number[], EI: (X: number) => number) {
  const starts: number[] = [];
  spans.reduce((a, L) => (starts.push(a), a + L), 0);
  const np = spans.length - 1;
  /** The moment diagram of a unit hogging moment at pier q, at X. */
  const m = (q: number, X: number) => {
    const P = starts[q + 1];
    const Lw = spans[q];
    const Le = spans[q + 1];
    if (X >= P - Lw && X <= P) return (X - (P - Lw)) / Lw;
    if (X > P && X <= P + Le) return (P + Le - X) / Le;
    return 0;
  };
  const F = Array.from({ length: np }, () => new Array<number>(np).fill(0));
  const total = spans.reduce((s, L) => s + L, 0);
  const N = 4000;
  const h = total / N;
  for (let k = 0; k < N; k++) {
    const X = (k + 0.5) * h;
    const w = (h * 12) / EI(X); // in / (kip·in²) · in: the rotation from a unit moment over the strip
    for (let a = 0; a < np; a++) {
      const ma = m(a, X);
      if (!ma) continue;
      for (let b = 0; b < np; b++) F[a][b] += ma * m(b, X) * w;
    }
  }
  return invert(F);
}

function invert(A: number[][]) {
  const n = A.length;
  const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((r) => r.slice(n));
}

/** The nominal moment-rotation curve of an interior-pier section (Fig. B6.6.2-1) to θRL: M/Mn = 0.7 + 60θp to 0.005 rad, then 1.0. */
export const momentRotation = (theta: number) => (theta <= 0.005 ? 0.7 + 60 * theta : 1);

/**
 * The refined method's solution (B6.6.1): the plastic rotations θp at the piers where the total continuity moment
 * |Me| − Σ kθij θpj reaches the moment-rotation curve φ Mn (0.7 + 60θp, then 1.0), the others elastic. Me and Mn
 * in kip·in (magnitudes, hogging); yielding[i] false for piers that may not yield (B6.2 not met). Returns each pier's
 * plastic rotation, continuity moment and redistribution moment (Σ kθij θpj, kip·in).
 */
export function refinedRedistribution(p: { Me: number[]; Mn: number[]; phi: number; K: number[][]; yielding: boolean[] }) {
  const n = p.Me.length;
  const theta = new Array<number>(n).fill(0);
  const M = (i: number) => p.Me[i] - p.K[i].reduce((s, k, j) => s + k * theta[j], 0);
  for (let it = 0; it < 500; it++) {
    let change = 0;
    for (let i = 0; i < n; i++) {
      if (!p.yielding[i]) continue;
      const others = p.Me[i] - p.K[i].reduce((s, k, j) => (j === i ? s : s + k * theta[j]), 0);
      const kii = p.K[i][i];
      const cap = p.phi * p.Mn[i];
      // Solve others − kii θ = cap (0.7 + 60θ) on the rising branch, else others − kii θ = cap.
      let t = Math.max(0, (others - 0.7 * cap) / (kii + 60 * cap));
      if (t > 0.005) t = Math.max(0.005, (others - cap) / kii);
      change = Math.max(change, Math.abs(t - theta[i]));
      theta[i] = t;
    }
    if (change < 1e-12) break;
  }
  return theta.map((t, i) => ({ theta: t, M: M(i), Mrd: p.Me[i] - M(i) }));
}

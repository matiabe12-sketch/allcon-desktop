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

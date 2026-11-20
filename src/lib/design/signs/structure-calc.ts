import type { Line } from "@/lib/calcs/library/templates";
import { num } from "../calc-style";
import type { SignInputs, SignResult } from "./cantilever";

// The sign structure's steel as a calc chapter, worked live with LRFD-LTS-1's articles: the pole at its base (the D/t
// class, Mn, Vn, Tn, Pn and the interaction), the anchor bolts, the fatigue at the welds (KF, KI, the threshold) and
// the deflections. The arm, flange bolts and base plate are in the checks' summary.

const ok = (demand: string, capacity: string) => `\\operatorname{if}\\left(${demand}\\le ${capacity},\\text{OK},\\text{NG}\\right)=`;

export function signSteelCalcLines(i: SignInputs, r: SignResult): Line[] {
  const lines: Line[] = [];
  const st = r.steel;
  const s = i.steel;
  if (!st || !s) return lines;
  const text = (t: string, style?: "heading" | "subheading" | "note") => lines.push({ text: t, ...(style ? { style } : {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}) });
  const p = st.pole;
  const ext = st.at[1];

  text("POLE, ARM AND CONNECTIONS (LRFD-LTS)", "heading");
  text("AASHTO LRFD Specifications for Structural Supports for Highway Signs, Luminaires, and Traffic Signals, 1st Edition (2015): the steel above the shaft, from the loads worked out above.");
  text("The pole at its base (Section 5)", "subheading");
  m(`D\\coloneq ${num(p.D)}\\mathrm{in}`, "Outside diameter");
  m(`t\\coloneq ${num(p.t, 4)}\\mathrm{in}`, "Wall");
  m(`F_y\\coloneq ${num(s.Fy)}\\mathrm{ksi}`, "ASTM A595 Grade A");
  m("E\\coloneq 29000\\mathrm{ksi}");
  m("\\frac{D}{t}=", `${p.cls}: λp 0.07 E/Fy, λr 0.31 E/Fy (Table 5.7.2-1)`);
  m("Z\\coloneq\\frac{D^{3}-\\left(D-2\\cdot t\\right)^{3}}{6}=", undefined, "in^3");
  m("M_p\\coloneq F_y\\cdot Z=", "Table 5.8.2-1", "kip·in");
  if (p.cls === "compact") m("M_n\\coloneq M_p=", "Compact", "kip·in");
  else if (p.cls === "noncompact") m("M_n\\coloneq M_p\\cdot\\left(0.77+\\frac{0.016\\cdot\\frac{E}{F_y}}{\\frac{D}{t}}\\right)=", "Noncompact, Table 5.8.2-1", "kip·in");
  else m("M_n\\coloneq M_p\\cdot\\frac{0.25\\cdot\\frac{E}{F_y}}{\\frac{D}{t}}=", "Slender, Table 5.8.2-1", "kip·in");
  m(`M_u\\coloneq ${num(ext.M * 12, 1)}\\mathrm{kip}\\cdot\\mathrm{in}`, "Extreme I, the resultant (Eq. 5.12.1-4)");
  m(`T_u\\coloneq ${num(ext.T * 12, 1)}\\mathrm{kip}\\cdot\\mathrm{in}`, "Extreme I");
  m(`T_n\\coloneq ${num(p.Tn, 1)}\\mathrm{kip}\\cdot\\mathrm{in}`, `Fnt ${num(p.Fnt, 2)} ksi (5.11.3.1.1)`);
  m(`P_u\\coloneq ${num(ext.P, 3)}\\mathrm{kip}`);
  m(`P_n\\coloneq ${num(p.Pn, 1)}\\mathrm{kip}`, "5.10.2, K = 2.1");
  m(`V_u\\coloneq ${num(ext.V, 3)}\\mathrm{kip}`);
  m(`V_n\\coloneq ${num(p.Vn, 1)}\\mathrm{kip}`, `Fnv ${num(p.Fnv, 2)} ksi (5.11.2.1.1)`);
  if (ext.T * 12 > 0.2 * 0.95 * p.Tn) m(ok("\\frac{P_u}{0.90\\cdot P_n}+\\frac{M_u}{0.90\\cdot M_n}+\\left(\\frac{V_u}{0.90\\cdot V_n}+\\frac{T_u}{0.95\\cdot T_n}\\right)^{2}", "1"), "Eq. 5.12.1-1 (torsion over 0.2 Tr; B ≈ 1.0)");
  else m(ok("\\frac{P_u}{2\\cdot0.90\\cdot P_n}+\\frac{M_u}{0.90\\cdot M_n}", "1"), "Eq. 5.12.1-3 (torsion under 0.2 Tr)");

  text("Anchor bolts (5.16, AISC Design Guide 1)", "subheading");
  m(`n_b\\coloneq ${s.base.rods}`);
  m(`D_{bc}\\coloneq ${num(s.base.rodCircle)}\\mathrm{in}`, "Bolt circle");
  m(`A_n\\coloneq ${num(st.rods.An, 3)}\\mathrm{in}^{2}`, "Tensile stress area");
  m(`F_u\\coloneq ${num(s.base.rodFu)}\\mathrm{ksi}`);
  m("T_b\\coloneq\\frac{4\\cdot M_u}{n_b\\cdot D_{bc}}-\\frac{P_u}{n_b}=", "The farthest bolt, elastic", "kip");
  m(ok("T_b", "0.75\\cdot F_u\\cdot A_n"), "φ 0.75 (5.5.3.2)");

  text("Fatigue (Section 11): the pole's base plate weld", "subheading");
  const w = st.fatigue.poleWeld;
  const IF = st.fatigue.IF;
  m(`I_{NW}\\coloneq ${num(IF.NW)}`, `Category ${s.fatigue.category}, Table 11.6-1`);
  m(`V_{mean}\\coloneq ${num(s.fatigue.vMean)}`, "mph");
  m("P_{NW}\\coloneq 5.2\\cdot 1.19\\cdot I_{NW}\\cdot\\left(\\frac{V_{mean}}{11.2}\\right)^{2}=", "On the sign, psf (Eq. C11.7.1.2-1, Cd 1.19)");
  m(`K_F\\coloneq ${num(w.KF, 3)}`, `${s.fatigue.poleWeld === "fillet" ? "Fillet-welded socket, Eq. 11.9.3.1-2" : "Groove weld, Eq. 11.9.3.1-3"} (CBC ${num(w.CBC, 3)}, tTP ${num(s.base.plateT)} in)`);
  m(`t_T\\coloneq ${num(p.t, 4)}`, "in");
  m("K_I\\coloneq\\left(1.76+1.83\\cdot t_T-4.76\\cdot0.22^{K_F}\\right)\\cdot K_F=", "Eq. 11.9.3.1-1");
  m(`\\Delta_{FTH}\\coloneq ${num(w.CAFT)}\\mathrm{ksi}`, `Table 11.9.3.1-1, detail ${w.detail}${w.valid ? "" : " (outside the equation's range: the lowest threshold)"}`);
  m(`S\\coloneq ${num(p.S, 2)}\\mathrm{in}^{3}`);
  m(`M_{NW}\\coloneq ${num(st.fatigue.MNWpole * 12, 1)}\\mathrm{kip}\\cdot\\mathrm{in}`, "Natural wind gust at the base");
  m(ok("\\frac{M_{NW}}{S}", "\\Delta_{FTH}"), "Infinite life");

  text("Deflection (10.4.2)", "subheading");
  m(ok(`${num(st.deflection.dPole, 3)}\\mathrm{in}`, `0.025\\cdot ${num(i.poleLength * 12, 1)}\\mathrm{in}`), "The pole's top under Service I: 2.5% of the height");
  m(ok(`${num(st.deflection.slope, 4)}`, "0.35"), "Its slope under the arm's moment, in/ft");
  text(`The arm's tip deflects ${num(st.deflection.dArm, 2)} in under its dead load: camber it up (C10.4.2.2).`, "note");
  return lines;
}

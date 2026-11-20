import type { Line } from "@/lib/calcs/library/templates";
import { checksSummary } from "../checks-summary";
import { textTable } from "../svg-table";
import { COLOR_NOTE, INPUT_COLOR, isInput, num } from "../calc-style";
import type { Figure } from "../figures";
import { designFinger, FATIGUE_THRESHOLD, WHEEL, type FingerJointInputs } from "./finger";

// A finger joint as a Calcs worksheet: the movement along the bridge, the fingers' overlap and gaps, the setting at the
// planned installation temperature, the fingers and plate as cantilevers under the wheel (strength and fatigue) and
// the bolts, as live math with their AASHTO articles.

const ok = (demand: string, capacity: string) => `\\operatorname{if}\\left(${demand}\\le ${capacity},\\text{OK},\\text{NG}\\right)=`;

export function fingerCalcLines(i: FingerJointInputs, title: string, figures?: Figure[]): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note") => lines.push({ text: t, ...(style ? { style } : {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}), ...(math.length > 110 && ref ? { wide: true } : {}), ...(isInput(math) ? { color: INPUT_COLOR } : {}) });
  const r = designFinger(i);
  const partial = i.Lf < WHEEL.length;

  text(title.toUpperCase(), "heading");
  text("A cantilever finger plate expansion joint, AASHTO LRFD 14.5.3: the movement along the bridge, the fingers' overlap and the gap between them at the strength movement, the opening to set at installation, the fingers and plate as cantilevers under the wheel at the strength and fatigue limit states, and the plate's bolts.");
  text(COLOR_NOTE, "note");

  text("Movement along the bridge (AASHTO 3.12.2, 14.5.2.2)", "subheading");
  m(`L\\coloneq ${num(i.L)}\\mathrm{ft}`, "From the neutral point to the joint");
  m(`\\alpha_T\\coloneq ${num(i.alpha * 1e6)}\\cdot10^{-6}`, "Per °F, AASHTO 5.4.2.2 / 6.4.1");
  m(`\\varepsilon_{cs}\\coloneq ${num(i.creepShrink)}`, "Creep and shrinkage still to come");
  m(`T_{max}\\coloneq ${num(i.Tmax)}`, "°F, AASHTO 3.12.2");
  m(`T_{min}\\coloneq ${num(i.Tmin)}`, "°F");
  m(`\\gamma_{TU}\\coloneq ${num(i.gammaTU)}`, "AASHTO T. 3.4.1-1");
  m("\\Delta_{tot}\\coloneq L\\cdot\\left(\\gamma_{TU}\\cdot\\left(T_{max}-T_{min}\\right)\\cdot\\alpha_T+\\varepsilon_{cs}\\right)=", "The fingers run along the bridge", "in");

  text("Fingers (AASHTO 14.5.3.2)", "subheading");
  m(`L_f\\coloneq ${num(i.Lf)}\\mathrm{in}`, "Root to tip");
  m(`b_f\\coloneq ${num(i.b)}\\mathrm{in}`, "Width");
  m(`g_f\\coloneq ${num(i.g)}\\mathrm{in}`, "Gap to the next finger");
  m(`t_p\\coloneq ${num(i.t)}\\mathrm{in}`, "Plate at the fingers' root");
  m(`c_t\\coloneq ${num(i.tipClear)}\\mathrm{in}`, "Least tip clearance, hottest (1.0 in on steel)");
  m("D_C\\coloneq2\\cdot L_f-1.5\\mathrm{in}=", "Root to root at 1.5 in of overlap", "in");
  m("D_H\\coloneq L_f+c_t=", "Root to root at the tips' clearance", "in");
  m(ok("\\Delta_{tot}", "D_C-D_H"), "Within the fingers' range");
  if (figures?.length) for (const f of figures) lines.push({ region: f });

  text(`Setting at ${num(i.Ti)}°F (AASHTO 14.5.5.1)`, "subheading");
  m(`T_i\\coloneq ${num(i.Ti)}`, "°F, installation temperature");
  m("\\Delta_c\\coloneq L\\cdot\\left(\\gamma_{TU}\\cdot\\left(T_i-T_{min}\\right)\\cdot\\alpha_T+\\varepsilon_{cs}\\right)=", "Opening as it cools and shrinks", "in");
  m("\\Delta_h\\coloneq L\\cdot\\left(\\gamma_{TU}\\cdot\\left(T_{max}-T_i\\right)\\cdot\\alpha_T-\\varepsilon_{cs}\\right)=", "Closing as it warms", "in");
  m("D_{max}\\coloneq D_C-\\Delta_c=", undefined, "in");
  m("D_{min}\\coloneq D_H+\\Delta_h=", undefined, "in");
  m(ok("D_{min}", "D_{max}"), "The openings fit");
  m("D\\coloneq\\frac{D_{max}+D_{min}}{2}=", "Root to root to set", "in");
  m("D_{cold}\\coloneq D+\\Delta_c=", undefined, "in");
  m(ok("1.5\\mathrm{in}", "2\\cdot L_f-D_{cold}"), "Overlap at the coldest, AASHTO 14.5.3.2");
  m(ok("g_f", r.gapLimit === 2 ? "2\\mathrm{in}" : "3\\mathrm{in}"), `Gap between fingers: the opening ${r.D.cold > 8 ? "passes" : "is within"} 8.0 in, AASHTO 14.5.3.2`);

  text("The fingers under the wheel (AASHTO 14.5.3.4)", "subheading");
  text(`The design truck's 16 kip wheel (3.6.1.2.2) on its 20 in × 10 in tire (3.6.1.2.5), with the deck joints' IM of 75% (Table 3.6.2.1-1), carried by one plate's fingers in the tire's width, the tire's middle as far out as it can sit${partial ? " (the tire longer than the finger: the part on it, at its middle)" : ""}.`);
  m(`P_w\\coloneq ${num(WHEEL.P)}\\mathrm{kip}`, "Wheel");
  m(`p\\coloneq2\\cdot\\left(b_f+g_f\\right)=`, "One plate's fingers' pitch", "in");
  m(`P_u\\coloneq P_w\\cdot\\left(1+${num(WHEEL.IM)}\\right)\\cdot${num(WHEEL.gammaLL)}\\cdot${num(WHEEL.m)}=`, "Strength I with the multiple presence factor for one lane (3.6.1.1.2)", "kip");
  m(`P_{fu}\\coloneq P_u\\cdot\\frac{p}{20\\mathrm{in}}\\cdot\\min\\left(1,\\frac{L_f}{10\\mathrm{in}}\\right)=`, "On one finger", "kip");
  m(partial ? "a\\coloneq\\frac{L_f}{2}=" : "a\\coloneq L_f-5\\mathrm{in}=", "Arm from the root", "in");
  m(`F_y\\coloneq ${num(i.Fy)}\\mathrm{ksi}`, "Steel");
  m(ok("P_{fu}\\cdot a", "\\frac{F_y\\cdot b_f\\cdot t_p^{2}}{4}"), "Finger's root, plastic (φ 1.00), AASHTO 6.12.2.2.7");
  m(ok("P_{fu}", "0.58\\cdot F_y\\cdot b_f\\cdot t_p"), "Shear (φv 1.00), AASHTO 6.10.9.2");
  m(`e_r\\coloneq ${num(i.rootOffset)}\\mathrm{in}`, "Support's edge to the root");
  m(ok("P_{fu}\\cdot\\left(a+e_r\\right)", "\\frac{F_y\\cdot p\\cdot t_p^{2}}{4}"), "The plate at the support's edge, over a pitch");

  text("Fatigue: infinite life (AASHTO 6.6.1.2)", "subheading");
  m(`P_{ff}\\coloneq P_w\\cdot\\left(1+${num(WHEEL.IM)}\\right)\\cdot${num(WHEEL.gammaFatigue)}\\cdot\\frac{p}{20\\mathrm{in}}\\cdot\\min\\left(1,\\frac{L_f}{10\\mathrm{in}}\\right)=`, "Fatigue I on one finger (γ 1.75)", "kip");
  m(`\\Delta_{FTH}\\coloneq ${num(FATIGUE_THRESHOLD[i.rootCategory])}\\mathrm{ksi}`, `Category ${i.rootCategory}, Table 6.6.1.2.5-3`);
  m(ok("\\frac{6\\cdot P_{ff}\\cdot a}{b_f\\cdot t_p^{2}}", "\\Delta_{FTH}"), "Stress range at the finger's root");

  text("Bolts (AASHTO 14.5.3.7, 6.13.2.10)", "subheading");
  text("The plate pivots on the support's edge; the bolts behind it hold the wheel's moment there, the tire's width spread at 45° through the plate to the bolt line.");
  m(`d_b\\coloneq ${num(i.bolt.d)}\\mathrm{in}`, "Bolt diameter");
  m(`s_b\\coloneq ${num(i.bolt.spacing)}\\mathrm{in}`, "Spacing along the joint");
  m(`e_b\\coloneq ${num(i.bolt.e)}\\mathrm{in}`, "Behind the support's edge");
  m(`F_{ub}\\coloneq ${num(i.bolt.Fub)}\\mathrm{ksi}`, "ASTM F3125 Grade 120");
  m("n_b\\coloneq\\max\\left(1,\\frac{20\\mathrm{in}+2\\cdot e_b}{s_b}\\right)=", "Bolts sharing the wheel");
  m("T_u\\coloneq\\frac{P_{fu}\\cdot\\frac{20\\mathrm{in}}{p}\\cdot\\left(a+e_r\\right)}{e_b\\cdot n_b}=", "Each bolt", "kip");
  m(ok("T_u", "0.80\\cdot0.76\\cdot\\frac{\\pi\\cdot d_b^{2}}{4}\\cdot F_{ub}"), "Tension, AASHTO 6.13.2.10.2");
  m(ok("\\frac{P_{ff}\\cdot\\frac{20\\mathrm{in}}{p}\\cdot\\left(a+e_r\\right)}{e_b\\cdot n_b\\cdot0.75\\cdot\\frac{\\pi\\cdot d_b^{2}}{4}}", "31\\mathrm{ksi}"), "Fatigue in axial tension, AASHTO 6.13.2.10.3");

  text("Settings by installation temperature", "subheading");
  lines.push({
    region: textTable(
      [{ title: ["Installation", "temperature (°F)"], x: 96, anchor: "end" }, { title: ["Root to root D", "(in)"], x: 190, anchor: "end" }, { title: "Note", x: 210 }],
      r.table.map((row) => [num(row.Ti), row.status === "too small" ? "—" : num(row.D, 3), row.status === "ok" ? "" : row.status === "outside" ? "outside the design temperatures" : "the fingers can't take the movements from here"]),
      640,
    ),
  });
  text("CDOT uses finger joints only to replace existing ones (BDM 14.4.6): sections of 6 ft at most, fingers tapered, a trough under them.");
  lines.push(...checksSummary([{ checks: r.checks }]));
  return lines;
}

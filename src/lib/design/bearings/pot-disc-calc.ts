import type { Line } from "@/lib/calcs/library/templates";
import { checksSummary } from "../checks-summary";
import { COLOR_NOTE, INPUT_COLOR, isInput, num } from "../calc-style";
import type { Figure } from "../figures";
import { designHlmr, type HlmrInputs } from "./pot-disc";
import { bearingHeight } from "./pot-disc-detail";

// A pot or disc bearing as a Calcs worksheet: the loads and design rotation, the rotational element (the pot's pad,
// rings, wall, base and piston, or the disc, its pin and plates), the sliding surface and guides, the masonry plate,
// the anchor rods and the sole plate, as live math with their AASHTO articles; the details as figures.

const ok = (demand: string, capacity: string) => `\\operatorname{if}\\left(${demand}\\le ${capacity},\\text{OK},\\text{NG}\\right)=`;

export const HLMR_GROUPS: { title: string; of: (id: string) => boolean }[] = [
  { title: "Pot", of: (id) => id.startsWith("pot-") },
  { title: "Disc", of: (id) => id.startsWith("disc-") },
  { title: "Sliding surface", of: (id) => id.startsWith("ptfe-") },
  { title: "Guides", of: (id) => id.startsWith("guide-") },
  { title: "Plates and anchorage", of: (id) => /^(masonry|anchors|sole)/.test(id) },
];

export function hlmrCalcLines(i: HlmrInputs, title: string, figures?: Figure[]): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note", extra?: { newPage?: boolean; keepWithNext?: boolean }) => lines.push({ text: t, ...(style ? { style } : {}), ...(extra ?? {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}), ...(math.length > 110 && ref ? { wide: true } : {}), ...(isInput(math) ? { color: INPUT_COLOR } : {}) });
  const r = designHlmr(i);
  const sliding = i.fixity !== "fixed";
  const kind = i.kind === "pot" ? "pot" : "disc";

  text(title.toUpperCase(), "heading");
  text(`Purpose:- The design of a ${i.fixity} ${kind} bearing (high-load multirotational) to AASHTO LRFD (10th Edition) ${i.kind === "pot" ? "14.7.4" : "14.7.8"}${sliding ? ", with its PTFE sliding surface (14.7.2)" : ""}${i.fixity === "guided" ? " and guides (14.7.9)" : ""}, its plates and anchorage (14.8) and the concrete under it (5.6.5). The manufacturer designs the bearing to the loads and rotation on the plans; these calculations size it and give its assumed height of ${num(bearingHeight(i), 3)} in.`);
  text(COLOR_NOTE, "note");
  if (figures?.length) {
    text("Details", "subheading", { newPage: true, keepWithNext: true });
    for (const f of figures) lines.push({ region: f });
  }

  text("Loads and design rotation", "subheading", { newPage: true, keepWithNext: true });
  m(`P_D\\coloneq ${num(i.DL)}\\mathrm{kip}`, "Permanent load, service (DC + DW)");
  m(`P_L\\coloneq ${num(i.LL)}\\mathrm{kip}`, "Live load with IM, service");
  m("P_s\\coloneq P_D+P_L=", "Service I", "kip");
  m("P_u\\coloneq1.25\\cdot P_D+1.75\\cdot P_L=", "Strength I", "kip");
  m(`P_{mn}\\coloneq ${num(i.minLoad)}\\mathrm{kip}`, "The least vertical load");
  m(`H_u\\coloneq ${num(i.Hu)}\\mathrm{kip}`, "Factored horizontal force (Strength, Extreme Event)");
  m(`\\theta_s\\coloneq ${num(i.rotation, 4)}`, "The largest rotation at the strength limit state, rad");
  m(`\\theta_c\\coloneq ${num(i.construction, 4)}`, "Construction tolerance, rad");
  m("\\theta_u\\coloneq\\theta_s+0.005+\\theta_c=", "Design rotation, with 0.005 rad for uncertainty, AASHTO 14.4.2.1");
  m(`F_y\\coloneq ${num(i.Fy)}\\mathrm{ksi}`, "Steel");

  if (i.kind === "pot" && r.pot) {
    const p = i.pot;
    text("Pot (AASHTO 14.7.4)", "subheading", { keepWithNext: true });
    m(`D_p\\coloneq ${num(p.Dp)}\\mathrm{in}`, "The pot's inside diameter, the pad's");
    m("A_p\\coloneq\\frac{\\pi\\cdot D_p^{2}}{4}=", undefined, "in^2");
    m(ok("\\frac{P_s}{A_p}", "3.5\\mathrm{ksi}"), "The elastomer's average stress at service");
    m(ok("0.2\\cdot P_s", "P_{mn}"), "The least load at least 20% of the design load, AASHTO 14.7.4.1");
    m(`h_r\\coloneq ${num(p.hr)}\\mathrm{in}`, "The pad");
    m(ok("3.33\\cdot\\theta_u\\cdot D_p", "h_r"), "AASHTO 14.7.4.3");
    if (p.rings.type === "flat") {
      m(`b_{rg}\\coloneq ${num(p.rings.width)}\\mathrm{in}`, `${p.rings.count} flat brass rings, each this wide`);
      m(`t_{rg}\\coloneq ${num(p.rings.thickness, 4)}\\mathrm{in}`, "and this thick");
      m(ok("\\max\\left(0.02\\cdot D_p,0.25\\mathrm{in}\\right)", "b_{rg}"), "AASHTO 14.7.4.5");
      m(ok("0.2\\cdot b_{rg}", "t_{rg}"), "AASHTO 14.7.4.5");
    } else {
      m(`d_{rg}\\coloneq ${num(p.rings.width)}\\mathrm{in}`, "The circular brass ring's diameter");
      m(ok("\\max\\left(0.0175\\cdot D_p,0.375\\mathrm{in}\\right)", "d_{rg}"), "AASHTO 14.7.4.5");
    }
    m("\\sigma_u\\coloneq\\frac{P_u}{A_p}=", "The pad's pressure, Strength I", "ksi");
    m(`t_w\\coloneq ${num(p.tw)}\\mathrm{in}`, "The pot wall");
    m(ok("\\frac{D_p\\cdot\\sigma_u}{2\\cdot0.9\\cdot F_y}", "t_w"), "AASHTO 14.7.4.6, the pressure");
    if (i.fixity !== "free") m(ok("\\sqrt{\\frac{40\\cdot H_u\\cdot\\theta_u}{F_y}}", "t_w"), "AASHTO 14.7.4.6, the horizontal force");
    m(`t_b\\coloneq ${num(p.tBase)}\\mathrm{in}`, "The pot's base");
    m(ok("\\max\\left(0.06\\cdot D_p,0.75\\mathrm{in},t_w\\right)", "t_b"), "AASHTO 14.7.4.6");
    m(`t_{pi}\\coloneq ${num(p.tPiston)}\\mathrm{in}`, "The piston");
    m(ok("0.06\\cdot D_p", "t_{pi}"), "AASHTO 14.7.4.7");
    m(`w_{rm}\\coloneq ${num(p.rim)}\\mathrm{in}`, "The piston rim's contact width");
    if (i.fixity !== "free") m(ok("\\frac{2.5\\cdot H_u}{D_p\\cdot F_y}", "w_{rm}"), "AASHTO 14.7.4.7");
    m(`c_{rm}\\coloneq ${num(p.clearance, 3)}\\mathrm{in}`, "The rim to the wall");
    m(ok("\\max\\left(\\theta_u\\cdot\\left(w_{rm}-\\frac{\\theta_u\\cdot D_p}{2}\\right),0.02\\mathrm{in}\\right)", "c_{rm}"), "AASHTO 14.7.4.7");
    m(`h_{cv}\\coloneq ${num(p.cavity)}\\mathrm{in}`, "The pot's inside depth");
    m(ok("h_r+0.5\\cdot\\theta_u\\cdot D_p+w_{rm}+0.125\\mathrm{in}", "h_{cv}"), "The piston stays in the pot, AASHTO C14.7.4.3");
  }
  if (i.kind === "disc" && r.disc) {
    const d = i.disc;
    text("Disc (AASHTO 14.7.8)", "subheading", { keepWithNext: true });
    m(`D_d\\coloneq ${num(d.Dd)}\\mathrm{in}`, "The urethane disc");
    m(`t_d\\coloneq ${num(d.td)}\\mathrm{in}`, "Its thickness");
    m(`E_d\\coloneq ${num(d.E)}\\mathrm{ksi}`, "Its apparent compressive modulus (the manufacturer's)");
    m("A_d\\coloneq\\frac{\\pi\\cdot D_d^{2}}{4}=", undefined, "in^2");
    m(ok("\\frac{P_s}{A_d}", "5.0\\mathrm{ksi}"), "Average compressive stress, AASHTO 14.7.8.3");
    m("\\delta_d\\coloneq\\frac{P_s}{A_d}\\cdot\\frac{t_d}{E_d}=", "Instantaneous deflection", "in");
    m(ok("\\delta_d", "0.10\\cdot t_d"), "AASHTO 14.7.8.3");
    m("\\delta_{mn}\\coloneq\\frac{P_{mn}}{A_d}\\cdot\\frac{t_d}{E_d}=", "Under the least load", "in");
    m(ok("\\frac{\\theta_u\\cdot D_d}{2}", "\\delta_{mn}"), "No lift-off at the edge, AASHTO 14.7.8.3");
    m("H_{sr}\\coloneq\\max\\left(H_u,0.15\\cdot P_s\\right)=", "The shear-restricting mechanism's force, AASHTO 14.7.8.4", "kip");
    m(`d_{pn}\\coloneq ${num(d.pin)}\\mathrm{in}`, "The pin");
    m(ok("H_{sr}", "0.58\\cdot F_y\\cdot\\frac{\\pi\\cdot d_{pn}^{2}}{4}"), "The pin's shear, AASHTO 6.10.9.2 (0.58 Fy)");
    m(ok("0.045\\cdot D_d", `${num(d.tUpper)}\\mathrm{in}`), "The upper plate, AASHTO 14.7.8.5");
    m(ok("0.06\\cdot D_d", `${num(d.tLower)}\\mathrm{in}`), "The lower plate, AASHTO 14.7.8.5");
  }
  if (sliding && r.slide) {
    text("Sliding surface (AASHTO 14.7.2)", "subheading", { keepWithNext: true });
    m(`D_{pt}\\coloneq ${num(i.ptfe.D)}\\mathrm{in}`, "The recessed PTFE");
    m("A_{pt}\\coloneq\\frac{\\pi\\cdot D_{pt}^{2}}{4}=", undefined, "in^2");
    m(ok("\\frac{P_D}{A_{pt}}", "3.0\\mathrm{ksi}"), "Permanent loads, AASHTO Table 14.7.2.4-1");
    m(ok("\\frac{P_s}{A_{pt}}", "4.5\\mathrm{ksi}"), "All loads");
    m(ok("0.1875\\mathrm{in}", `${num(i.ptfe.t, 4)}\\mathrm{in}`), "Thickness, AASHTO 14.7.2.2");
    m(`\\mu\\coloneq ${num(i.ptfe.mu, 3)}`, "Friction, AASHTO Table 14.7.2.5-1");
    m("F_{fr}\\coloneq\\mu\\cdot P_s=", "The force it passes as it slides", "kip");
    m(ok(`${num(i.ptfe.D)}\\mathrm{in}+2\\cdot${num(i.ptfe.movement)}\\mathrm{in}+2\\mathrm{in}`, `${num(i.sole.L)}\\mathrm{in}`), "The stainless over the PTFE's travel, AASHTO 14.7.2.6");
  }
  if (i.fixity === "guided" && r.guide) {
    const g = i.guides;
    text("Guides (AASHTO 14.7.9)", "subheading", { keepWithNext: true });
    m(`b_g\\coloneq ${num(g.b)}\\mathrm{in}`, "Each guide bar's width");
    m(`h_g\\coloneq ${num(g.h)}\\mathrm{in}`, "Its height");
    m(`L_g\\coloneq ${num(g.L)}\\mathrm{in}`, "Its length");
    m(ok("H_u\\cdot\\frac{h_g}{2}", "0.9\\cdot F_y\\cdot\\frac{L_g\\cdot b_g^{2}}{4}"), "Bending across the bar (plastic)");
    m(ok("\\frac{H_u}{L_g\\cdot h_g}", "4.5\\mathrm{ksi}"), "Its PTFE's contact stress");
  }
  text("Masonry plate, anchor rods and sole plate", "subheading", { keepWithNext: true });
  m(`B_m\\coloneq ${num(i.masonry.B)}\\mathrm{in}`, "Masonry plate, along the bridge");
  m(`L_m\\coloneq ${num(i.masonry.L)}\\mathrm{in}`, "across it");
  m("A_1\\coloneq B_m\\cdot L_m=", undefined, "in^2");
  m(`A_2\\coloneq ${num(i.masonry.A2)}\\mathrm{in}^{2}`, "The supporting concrete's area");
  m(`f'_{c}\\coloneq ${num(i.fc)}\\mathrm{ksi}`, "The seat's concrete");
  m(ok("P_u", "0.7\\cdot0.85\\cdot f'_{c}\\cdot A_1\\cdot\\min\\left(\\sqrt{\\frac{A_2}{A_1}},2\\right)"), "Bearing on the concrete, AASHTO 5.6.5");
  m(`c_m\\coloneq ${num(r.masonry.c, 3)}\\mathrm{in}`, "The plate past the bearing's edge");
  m(ok("c_m\\cdot\\sqrt{\\frac{2\\cdot P_u}{A_1\\cdot0.9\\cdot F_y}}", `${num(i.masonry.t)}\\mathrm{in}`), "The plate's thickness, a cantilever (plastic)");
  m(`H_{ar}\\coloneq ${num(r.anchors.H, 3)}\\mathrm{kip}`, sliding ? (i.fixity === "guided" ? "The guided direction's force, or the friction" : "The friction as it slides") : "The factored horizontal force");
  m(ok("H_{ar}", `0.75\\cdot${Math.round(i.anchors.n)}\\cdot0.5\\cdot\\frac{\\pi\\cdot\\left(${num(i.anchors.d)}\\mathrm{in}\\right)^{2}}{4}\\cdot${num(i.anchors.Fu)}\\mathrm{ksi}`), "Anchor rods in shear, AASHTO 14.8.3.1, 6.13.2.12");
  if (i.fcGirder > 0) m(ok("P_u", `0.7\\cdot0.85\\cdot${num(i.fcGirder)}\\mathrm{ksi}\\cdot${num(i.sole.B)}\\mathrm{in}\\cdot${num(i.sole.L)}\\mathrm{in}`), "The sole plate on the concrete girder, AASHTO 5.6.5");

  lines.push(...checksSummary(HLMR_GROUPS.map((g) => ({ title: g.title, checks: r.checks.filter((c) => g.of(c.id)) })).filter((g) => g.checks.length)));
  return lines;
}

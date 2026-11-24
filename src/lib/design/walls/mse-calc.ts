import { maxLines } from "@/lib/calcs/library/fit";
import type { Line } from "@/lib/calcs/library/templates";
import { checksSummary } from "../checks-summary";
import { COLOR_NOTE, INPUT_COLOR, isInput, num } from "../calc-style";
import type { Figure } from "../figures";
import { BARS } from "./cip";
import { designMseWall, embedmentRule, type MseInputs } from "./mse";
import { cdotMinLength } from "./mse-quantities";
import { RAIL_NONE } from "./mse-rail";

// An MSE wall design as a Calcs worksheet: its inputs as definitions and every step as live math
// with its AASHTO reference: external stability, each reinforcement layer, and the facing panel.
// Calcs works the numbers out on its own; the design engine only lays out the layers.

const TOE = "A_{t}\\coloneq\\left(\\frac{H_x}{2}+1.5\\mathrm{ft}\\right)\\cdot H_x-0.5\\cdot\\left(H_x+1.5\\mathrm{ft}\\right)^{2}\\cdot\\frac{\\tan\\left(\\theta_g\\right)}{1+\\tan\\left(\\theta_g\\right)}=";
const ok = (demand: string, capacity: string) => `\\operatorname{if}\\left(${demand}\\le ${capacity},\\text{OK},\\text{NG}\\right)=`;

export function mseCalcLines(i: MseInputs, title: string, figures?: { section?: Figure }): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note") => lines.push({ text: t, ...(style ? { style } : {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}), ...(math.length > 110 && ref ? { wide: true } : {}), ...(isInput(math) ? { color: INPUT_COLOR } : {}) });
  /** A value from the analysis (not entered): not in the inputs' color. */
  const given = (math: string, ref?: string) => lines.push({ math, ...(ref ? { ref } : {}) });

  const r = designMseWall(i);
  const f = i.factors;
  const kind = r.internal.kind;
  const slope = i.backslope > 0;
  const live = r.soil.heq > 0;
  const eq = !!r.groups.EEMax;
  const layers = r.internal.layers;
  const g = r.geometry;
  const truncated = g.base !== "core";
  const dw = r.loads.qDW > 0;
  const rail = i.rail ?? RAIL_NONE;
  const products = kind.extensible && layers.some((l) => l.product.id !== "custom");
  const perLayerT = products;
  const varLength = layers.some((l) => Math.abs(l.Lz - i.L) > 1e-9);
  const n = layers.length;
  const each = (fn: (k: number) => string, sep = "+") => layers.map((_, k) => fn(k + 1)).join(sep);

  text(title.toUpperCase(), "heading");
  text(`Mechanically stabilized earth wall with ${kind.name.toLowerCase()} reinforcement and precast concrete facing panels, per foot of wall. AASHTO LRFD Bridge Design Specifications (9th ed.), Section 11.10. External moments are taken about the center of the base, overturning positive.`);

  text(COLOR_NOTE, "note");

  // --- soils ----------------------------------------------------------------------------------
  text("Soils", "subheading");
  m(`\\gamma_r\\coloneq ${num(i.gammaR)}\\mathrm{kcf}`, "Reinforced fill unit weight");
  m(`\\phi_r\\coloneq ${num(i.phiR)}\\mathrm{deg}`, "Reinforced fill friction angle");
  m(`\\gamma_{rt}\\coloneq ${num(i.gammaRet)}\\mathrm{kcf}`, "Retained fill unit weight");
  m(`\\phi_{rt}\\coloneq ${num(i.phiRet)}\\mathrm{deg}`, "Retained fill friction angle");
  m(`\\phi_{fd}\\coloneq ${num(i.phiF)}\\mathrm{deg}`, "Foundation soil friction angle");
  m(`q_n\\coloneq ${num(i.qn)}\\mathrm{ksf}`, "Nominal bearing resistance (geotechnical)");
  m(slope ? `\\beta\\coloneq\\arctan\\left(\\frac{1}{${num(i.backslope)}}\\right)=` : "\\beta\\coloneq0\\mathrm{deg}", "Backslope angle", "deg");
  m(i.delta === null ? "\\delta\\coloneq\\beta=" : `\\delta\\coloneq ${num(i.delta)}\\mathrm{deg}`, "Friction at the back of the reinforced zone (AASHTO 11.10.5.2)", "deg");
  m("\\theta\\coloneq90\\mathrm{deg}", "Back of the reinforced zone, vertical");
  m("\\Gamma_a\\coloneq\\left(1+\\sqrt{\\frac{\\sin\\left(\\phi_{rt}+\\delta\\right)\\cdot\\sin\\left(\\phi_{rt}-\\beta\\right)}{\\sin\\left(\\theta-\\delta\\right)\\cdot\\sin\\left(\\theta+\\beta\\right)}}\\right)^{2}=", "AASHTO Eq. 3.11.5.3-2");
  m("K_a\\coloneq\\frac{\\sin\\left(\\theta+\\phi_{rt}\\right)^{2}}{\\Gamma_a\\cdot\\sin\\left(\\theta\\right)^{2}\\cdot\\sin\\left(\\theta-\\delta\\right)}=", "Retained fill, Coulomb (AASHTO 11.10.5.2)");
  m("K_{ai}\\coloneq\\tan\\left(45\\mathrm{deg}-\\frac{\\phi_r}{2}\\right)^{2}=", "Reinforced fill, internal stability (AASHTO 11.10.6.2.1)");
  m("\\mu\\coloneq\\tan\\left(\\min\\left(\\phi_r,\\phi_{fd}\\right)\\right)=", "Sliding, the weaker of the fill and the foundation (AASHTO 11.10.5.3)");

  text("Resistance and load factors", "subheading");
  m(`\\phi_{brg}\\coloneq ${num(i.phiB)}`, "Bearing, AASHTO T. 11.5.7-1");
  m(`\\phi_{s}\\coloneq ${num(i.phiS)}`, "Sliding");
  if (eq) {
    m(`\\phi_{brgEE}\\coloneq ${num(i.phiBEE)}`, "Bearing, extreme event (AASHTO 11.5.8)");
    m(`\\phi_{sEE}\\coloneq ${num(i.phiSEE)}`, "Sliding, extreme event");
  }
  m(`\\gamma_{EVmax}\\coloneq ${num(f.evMax)}`, "Vertical earth pressure, max. (AASHTO T. 3.4.1-2)");
  m(`\\gamma_{EVmin}\\coloneq ${num(f.evMin)}`, "Vertical earth pressure, min.");
  m(`\\gamma_{EH}\\coloneq ${num(f.eh)}`, "Horizontal earth pressure, active");
  if (live) m(`\\gamma_{LS}\\coloneq ${num(f.ls)}`, "Live load surcharge, Strength I");
  if (dw) {
    m(`\\gamma_{DWmax}\\coloneq ${num(f.dwMax ?? 1.5)}`, "Pavement (DW), max. (AASHTO T. 3.4.1-2)");
    m(`\\gamma_{DWmin}\\coloneq ${num(f.dwMin ?? 0.65)}`, "Pavement (DW), min.");
  }
  if (eq) m(`\\gamma_{EQ}\\coloneq ${num(f.lsEE)}`, "Live load, Extreme Event I");

  // --- geometry -------------------------------------------------------------------------------
  text("Geometry", "subheading");
  m(`H\\coloneq ${num(i.H)}\\mathrm{ft}`, "Design height (top of leveling pad to top of wall)");
  if (truncated) {
    text(`Truncated base on a ${g.base === "truncated-soil" ? "¾:1 soil" : "½:1 rock"} cut (CDOT B-504): the reinforcement grows from L at the bottom along the cut; global stability (FS 1.3, φ 0.75) is the geotechnical engineer's (B-504-A C note 6).`);
    m(`L\\coloneq ${num(i.L)}\\mathrm{ft}`, "Reinforcement length at the bottom");
    m(`s_c\\coloneq ${num(g.slope)}`, "The cut's slope, H:1V");
    m(ok("\\max\\left(0.45\\cdot H,4\\mathrm{ft}\\right)", "L"), "Least length at the bottom, CDOT B-504-A C note 6");
  } else {
    m(`L\\coloneq ${num(i.L)}\\mathrm{ft}`, "Reinforcement length");
    m("s_c\\coloneq0", "Uniform length (core wall)");
    const cdot = cdotMinLength(i.H);
    if (i.L < Math.max(0.7 * i.H, 8) - 1e-9 && i.L >= cdot - 1e-9) text(`L is below AASHTO 11.10.2.1's 0.7H and 8 ft but meets CDOT B-504-D1's ${num(cdot)} ft for this height.`, "note");
    else m(ok("\\max\\left(0.7\\cdot H,8\\mathrm{ft}\\right)", "L"), "Minimum length, AASHTO 11.10.2.1");
  }
  m("T_z\\coloneq L+s_c\\cdot H=", "The reinforced zone's width at the top", "ft");
  if (i.seismic && i.cdotSeismic) text("No seismic analysis: seismic performance zones 1–3 with CDOT's earthquake details (B-504-A C note 5).", "note");
  m(`d_{emb}\\coloneq ${num(i.embedment)}\\mathrm{ft}`, "Embedment");
  const emb = embedmentRule(i);
  m(ok(`\\max\\left(${num(emb.least)}\\mathrm{ft},${num(emb.frost)}\\mathrm{ft},\\frac{H}{${emb.div}}\\right)`, "d_{emb}"), `Least embedment, AASHTO 10th 11.10.2.2 and Table C11.10.2.2-1: ${emb.note}`);
  m("h\\coloneq H+T_z\\cdot\\tan\\left(\\beta\\right)=", "Height at the back of the reinforced zone", "ft");
  if (live) given(`h_{eq}\\coloneq ${num(r.soil.heq)}\\mathrm{ft}`, i.wallType === "abutment" ? "Live load surcharge, AASHTO T. 3.11.6.4-1 (abutment)" : "Live load surcharge, AASHTO T. 3.11.6.4-2 (parallel to traffic)");

  if (figures?.section) lines.push({ region: figures.section });

  // --- external loads -------------------------------------------------------------------------
  text("External stability: loads", "subheading");
  m("EV_1\\coloneq\\gamma_r\\cdot\\left(H\\cdot L+\\frac{1}{2}\\cdot s_c\\cdot H^{2}\\right)=", truncated ? "Reinforced zone, the base's rectangle and the triangle over the cut" : "Reinforced zone, at the center", "kip/ft");
  m("a_{EV1}\\coloneq0\\mathrm{ft}", truncated ? "Taken at the bottom's center (CDOT B-504 method: the soil over the cut bears on the cut)" : "At the base's center");
  if (slope) m("EV_2\\coloneq\\frac{1}{2}\\cdot T_z\\cdot T_z\\cdot\\tan\\left(\\beta\\right)\\cdot\\gamma_r=", "Backslope over the reinforced zone, at 2T/3", "kip/ft");
  else m("EV_2\\coloneq0\\frac{\\mathrm{kip}}{\\mathrm{ft}}");
  m("P_{EH}\\coloneq\\frac{1}{2}\\cdot\\gamma_{rt}\\cdot K_a\\cdot h^{2}=", "Earth pressure, at h/3, inclined at β (AASHTO 11.10.5.2)", "kip/ft");
  m("EH_H\\coloneq P_{EH}\\cdot\\cos\\left(\\beta\\right)=", undefined, "kip/ft");
  m("EH_V\\coloneq P_{EH}\\cdot\\sin\\left(\\beta\\right)=", "At the back, T − L/2 behind the center", "kip/ft");
  if (dw) {
    m(`q_{DW}\\coloneq ${num(i.hma!.t)}\\mathrm{in}\\cdot ${num(i.hma!.gamma)}\\mathrm{kcf}=`, "Pavement on the wall (CDOT B-504-H: 12 in of HMA)", "ksf");
    m("DW_V\\coloneq q_{DW}\\cdot T_z=", "Over the reinforced zone", "kip/ft");
    m("DW_H\\coloneq q_{DW}\\cdot K_a\\cdot H=", "Its pressure, at H/2", "kip/ft");
  } else {
    m("q_{DW}\\coloneq0\\mathrm{ksf}");
    m("DW_V\\coloneq0\\frac{\\mathrm{kip}}{\\mathrm{ft}}");
    m("DW_H\\coloneq0\\frac{\\mathrm{kip}}{\\mathrm{ft}}");
  }
  if (live) {
    m("LS_V\\coloneq\\gamma_r\\cdot h_{eq}\\cdot T_z=", "Surcharge over the reinforced zone (bearing only)", "kip/ft");
    m("LS_H\\coloneq\\gamma_{rt}\\cdot h_{eq}\\cdot K_a\\cdot H=", "Surcharge pressure, at H/2", "kip/ft");
  } else {
    m("LS_V\\coloneq0\\frac{\\mathrm{kip}}{\\mathrm{ft}}");
    m("LS_H\\coloneq0\\frac{\\mathrm{kip}}{\\mathrm{ft}}");
  }
  if (eq) {
    text("Seismic", "subheading");
    m(`PGA\\coloneq ${num(i.pga)}`);
    m(`F_{pga}\\coloneq ${num(i.fpga)}`, "Site factor, AASHTO 3.10.3.2");
    m(`k_h\\coloneq ${num(i.khFactor)}\\cdot F_{pga}\\cdot PGA=`, i.khFactor === 1 ? "kh = As (AASHTO 11.6.5.2)" : "Reduced for wall displacement (AASHTO 11.6.5.2.2)");
    m("\\theta_{MO}\\coloneq\\arctan\\left(k_h\\right)=", "kv = 0", "deg");
    m(ok("\\beta+\\theta_{MO}", "\\phi_{rt}"), "Mononobe–Okabe applies");
    m("K_{AE}\\coloneq\\frac{\\cos\\left(\\phi_{rt}-\\theta_{MO}\\right)^{2}}{\\cos\\left(\\theta_{MO}\\right)\\cdot\\cos\\left(\\delta+\\theta_{MO}\\right)}\\cdot\\left(1+\\sqrt{\\frac{\\sin\\left(\\phi_{rt}+\\delta\\right)\\cdot\\sin\\left(\\phi_{rt}-\\theta_{MO}-\\beta\\right)}{\\cos\\left(\\delta+\\theta_{MO}\\right)\\cdot\\cos\\left(\\beta\\right)}}\\right)^{-2}=", "AASHTO Eq. A11.3.1-1");
    m("P_{IR}\\coloneq k_h\\cdot\\frac{1}{2}\\cdot\\gamma_r\\cdot H^{2}=", "Inertia of the reinforced mass (0.5H wide), at H/2, AASHTO Eq. 11.10.7.1-3", "kip/ft");
    m("P_{AE}\\coloneq\\frac{1}{2}\\cdot\\gamma_{rt}\\cdot K_{AE}\\cdot h^{2}=", "Seismic earth pressure, at h/3", "kip/ft");
    m("P_{EQ}\\coloneq\\max\\left(P_{AE}+0.5\\cdot P_{IR},0.5\\cdot P_{AE}+P_{IR}\\right)=", "AASHTO 11.10.7.1", "kip/ft");
    m("M_{EQ}\\coloneq\\max\\left(P_{AE}\\cdot\\frac{h}{3}+0.5\\cdot P_{IR}\\cdot\\frac{H}{2},0.5\\cdot P_{AE}\\cdot\\frac{h}{3}+P_{IR}\\cdot\\frac{H}{2}\\right)=", undefined, "kip*ft/ft");
  }

  // --- external groups and checks -------------------------------------------------------------
  text("External stability: load groups", "subheading");
  if (truncated) {
    text("Truncated base (CDOT's B-504 method): the whole weight acts at the center of the bottom length L; only the earth pressure and the surcharges overturn about it.", "note");
    m("a_{EH}\\coloneq0\\mathrm{ft}", "EH_V at the bottom's center");
    m("a_{EV2}\\coloneq0\\mathrm{ft}", "EV_2 at the bottom's center");
    m("a_{T}\\coloneq0\\mathrm{ft}", "The surcharges at the bottom's center");
  } else {
    m("a_{EH}\\coloneq T_z-\\frac{L}{2}=", "Arm of EH_V, behind the base's center", "ft");
    m("a_{EV2}\\coloneq\\frac{2\\cdot T_z}{3}-\\frac{L}{2}=", "Arm of EV_2", "ft");
    m("a_{T}\\coloneq\\frac{T_z}{2}-\\frac{L}{2}=", "Arm of the surcharges over the top", "ft");
  }
  const group = (key: string, name: string, ev: string, eh: string, lsv: string, lsh: string, withEq: boolean, dwv = dw ? "\\gamma_{DWmax}" : "0", dwh = dw ? "\\gamma_{DWmax}" : "0") => {
    text(name, "note");
    m(`V_{${key}}\\coloneq ${lsv}\\cdot LS_V+${ev}\\cdot\\left(EV_1+EV_2\\right)+${eh}\\cdot EH_V+${dwv}\\cdot DW_V=`, undefined, "kip/ft");
    m(`H_{${key}}\\coloneq ${lsh}\\cdot LS_H+${eh}\\cdot EH_H+${dwh}\\cdot DW_H${withEq ? "+P_{EQ}" : ""}=`, undefined, "kip/ft");
    m(`M_{e${key}}\\coloneq ${eh}\\cdot\\left(EH_H\\cdot\\frac{h}{3}-EH_V\\cdot a_{EH}\\right)+\\left(${lsh}\\cdot LS_H+${dwh}\\cdot DW_H\\right)\\cdot\\frac{H}{2}=`, "Earth pressure and surcharges, overturning", "kip*ft/ft");
    m(`M_{v${key}}\\coloneq ${ev}\\cdot\\left(EV_1\\cdot a_{EV1}+EV_2\\cdot a_{EV2}\\right)=`, "Soil weights behind the base's center, resisting", "kip*ft/ft");
    m(`M_{s${key}}\\coloneq\\left(${lsv}\\cdot LS_V+${dwv}\\cdot DW_V\\right)\\cdot a_{T}=`, "Surcharges over the top, resisting", "kip*ft/ft");
    m(`M_{${key}}\\coloneq M_{e${key}}-M_{v${key}}-M_{s${key}}${withEq ? "+M_{EQ}" : ""}=`, undefined, "kip*ft/ft");
    m(`e_{${key}}\\coloneq\\frac{\\left|M_{${key}}\\right|}{V_{${key}}}=`, undefined, "ft");
    m(`\\sigma_{${key}}\\coloneq\\frac{V_{${key}}}{L-2\\cdot e_{${key}}}=`, "Meyerhof, AASHTO Eq. 11.6.3.2-1", "ksf");
  };
  const ls = live ? "\\gamma_{LS}" : "0";
  group("Imax", "Strength I, maximum: live load over the reinforced zone (bearing)", "\\gamma_{EVmax}", "\\gamma_{EH}", ls, ls, false);
  group("Imin", "Strength I, minimum: no live load over the reinforced zone (eccentricity, sliding)", "\\gamma_{EVmin}", "\\gamma_{EH}", "0", ls, false, dw ? "\\gamma_{DWmin}" : "0");
  if (eq) {
    text("Extreme Event I: PEQ includes the static earth pressure (γEH = 0).", "note");
    group("EEmax", "Extreme Event I with live load (bearing)", "1", "0", live ? "\\gamma_{EQ}" : "0", live ? "\\gamma_{EQ}" : "0", true);
    group("EEmin", "Extreme Event I without live load over the reinforced zone (eccentricity, sliding)", "1", "0", "0", live ? "\\gamma_{EQ}" : "0", true, dw ? "\\gamma_{DWmin}" : "0");
  }
  text("External stability: checks", "subheading");
  m(`e_{max}\\coloneq\\frac{L}{${num(i.eccDivisor)}}=`, i.eccDivisor === 3 ? "Middle two-thirds, AASHTO 11.6.3.3" : `L/${num(i.eccDivisor)}`, "ft");
  m(ok("e_{Imin}", "e_{max}"), "Eccentricity, Strength I");
  m(ok("\\sigma_{Imax}", "\\phi_{brg}\\cdot q_n"), "Bearing, Strength I (AASHTO 11.10.5.4)");
  m("BP\\coloneq\\frac{\\sigma_{Imax}}{2}\\cdot\\frac{\\mathrm{ft}^{2}}{\\mathrm{kip}}=", "Factored bearing pressure in TSF, for the geotechnical report (CDOT B-504-H)");
  m(ok("H_{Imin}", "\\phi_{s}\\cdot\\mu\\cdot V_{Imin}"), "Sliding, Strength I (AASHTO 11.10.5.3)");
  if (eq) {
    m(`e_{maxEE}\\coloneq L\\cdot\\left(\\frac{1}{3}+${num(f.lsEE)}\\cdot\\left(0.4-\\frac{1}{3}\\right)\\right)=`, "2/3 of the base at γEQ = 0 to 8/10 at γEQ = 1, AASHTO 11.6.5.1", "ft");
    m(ok("e_{EEmin}", "e_{maxEE}"), "Eccentricity, Extreme Event I");
    m(ok("\\sigma_{EEmax}", "\\phi_{brgEE}\\cdot q_n"), "Bearing, Extreme Event I");
    m(ok("H_{EEmin}", "\\phi_{sEE}\\cdot\\mu\\cdot V_{EEmin}"), "Sliding, Extreme Event I");
  }

  // --- internal stability ---------------------------------------------------------------------
  text(`Internal stability: ${kind.name.toLowerCase()} reinforcement`, "subheading");
  if (!i.zoned) m(`S_v\\coloneq ${num(i.Sv)}\\mathrm{ft}`, "Vertical spacing");
  else text(`Spacing by zones: ${(i.zones ?? []).map((zn) => `${num(zn.Sv)} ft down to ${num(zn.bottom)} ft`).join(", ")}.`);
  if (i.extendTop) text("The top two layers are twice as long (CDOT B-504-D1, against roadway tension cracks).");
  m(`\\alpha\\coloneq ${num(kind.alpha)}`, "Scale effect correction, AASHTO 11.10.6.3.2");
  m("C\\coloneq2", "Strips, grids and sheets");
  m(`\\phi_{po}\\coloneq ${num(kind.phiPO)}`, "Pullout, AASHTO 10th T. 11.5.7-1");
  m(`\\phi_{t}\\coloneq ${num(kind.phiT)}`, "Tensile resistance, AASHTO 10th T. 11.5.7-1");
  if (eq) {
    m(`\\phi_{poEE}\\coloneq ${num(kind.phiPOEE)}`, "Pullout, extreme event (AASHTO 11.5.8)");
    m(`\\phi_{tEE}\\coloneq ${num(kind.phiTEE)}`, "Tensile resistance, extreme event (AASHTO 11.5.8)");
  }
  if (i.reinforcement === "steelstrip" || i.reinforcement === "steelgrid") {
    m(`F_y\\coloneq ${num(i.fyReinf)}\\mathrm{ksi}`, "Reinforcement steel");
    m(`E_s\\coloneq2\\cdot0.00047\\mathrm{in}\\cdot\\left(${num(i.designLife)}-16\\right)=`, `Loss over ${num(i.designLife)} years: zinc gone after 16, then 0.47 mil/yr a side (AASHTO 11.10.6.4.2a)`, "in");
  }
  if (i.reinforcement === "steelstrip") {
    m(`b_s\\coloneq ${num(i.stripWidth)}\\mathrm{in}`, "Strip width");
    m(`t_s\\coloneq ${num(i.stripThickness)}\\mathrm{in}`, "Strip thickness");
    m(`S_h\\coloneq ${num(i.stripSpacing)}\\mathrm{ft}`, "Strip spacing along the wall");
    m("R_c\\coloneq\\frac{b_s}{S_h}=", "Coverage ratio");
    m("T_{al}\\coloneq F_y\\cdot\\left(t_s-E_s\\right)=", "Per unit width of strip, AASHTO 11.10.6.4.3a", "kip/ft");
    m(`F_0\\coloneq ${num(Math.min(2, 1.2 + Math.log10(i.cu)))}`, `F* at the top: min(2, 1.2 + log Cu), Cu = ${num(i.cu)}`);
  } else if (i.reinforcement === "steelgrid") {
    m(`d_w\\coloneq ${num(i.gridLongDia)}\\mathrm{in}`, "Longitudinal wire diameter");
    m(`s_w\\coloneq ${num(i.gridLongSpacing)}\\mathrm{in}`, "Longitudinal wire spacing");
    m(`t_g\\coloneq ${num(i.gridTransDia)}\\mathrm{in}`, "Transverse wire diameter");
    m(`S_t\\coloneq ${num(i.gridTransSpacing)}\\mathrm{in}`, "Transverse wire spacing");
    m(`R_c\\coloneq ${num(i.Rc)}`, "Coverage ratio");
    m("T_{al}\\coloneq F_y\\cdot\\frac{\\pi}{4}\\cdot\\frac{\\left(d_w-E_s\\right)^{2}}{s_w}=", "Per unit width of mat, AASHTO 11.10.6.4.3a", "kip/ft");
  } else {
    m(`R_c\\coloneq ${num(i.Rc)}`, "Coverage ratio");
    m(`T_{al}\\coloneq ${num(i.Tal)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, products ? "Long-term strength for layers without a listed product" : "Long-term strength (the product's, with its reduction factors), AASHTO 11.10.6.4.3b");
    if (products) {
      m(`RF_{ID}\\coloneq ${num(i.rf!.id)}`, "Installation damage (CDOT B-504-H: 1.3)");
      m(`RF_{D}\\coloneq ${num(i.rf!.d)}`, "Durability (CDOT B-504-H: 1.1); creep RF_CR by product: 2.55 HDPE, 1.8 PP and PET");
    }
    m("F_p\\coloneq0.67\\cdot\\tan\\left(\\phi_r\\right)=", "F*, AASHTO 11.10.6.3.2");
  }
  if (!perLayerT) {
    m("T_r\\coloneq\\phi_t\\cdot T_{al}\\cdot R_c=", "Tensile resistance per foot of wall", "kip/ft");
    if (eq) m("T_{rEE}\\coloneq\\phi_{tEE}\\cdot T_{al}\\cdot R_c=", "Extreme event", "kip/ft");
  }
  if (slope) m("S\\coloneq\\frac{1}{2}\\cdot0.7\\cdot H\\cdot\\tan\\left(\\beta\\right)=", "The backslope as a surcharge, AASHTO Fig. 11.10.6.2.1-2", "ft");
  else m("S\\coloneq0\\mathrm{ft}");
  m("\\sigma_S\\coloneq\\gamma_{rt}\\cdot S=", undefined, "ksf");
  m(live ? "\\sigma_{LS}\\coloneq\\gamma_r\\cdot h_{eq}=" : "\\sigma_{LS}\\coloneq0\\mathrm{ksf}", "Live load surcharge", "ksf");
  if (!kind.extensible) m("H_1\\coloneq H+\\frac{0.3\\cdot H\\cdot\\tan\\left(\\beta\\right)}{1-0.3\\cdot\\tan\\left(\\beta\\right)}=", "AASHTO Fig. 11.10.6.3.1-1", "ft");
  text(`Each layer: σH = kr (γEV σv + γLS σLS) over its tributary height; pullout on the length past the active zone. ${n} layers.`, "note");

  const z20 = (k: number) => `\\frac{\\min\\left(z_{${k}},20\\mathrm{ft}\\right)}{20\\mathrm{ft}}`;
  const krKa = (k: number) => (i.reinforcement === "steelstrip" ? `\\left(1.7-0.5\\cdot${z20(k)}\\right)\\cdot ` : i.reinforcement === "steelgrid" ? `\\left(2.5-1.3\\cdot${z20(k)}\\right)\\cdot ` : "");
  layers.forEach((l, idx) => {
    const k = idx + 1;
    text(`Layer ${k}`, "note");
    m(`z_{${k}}\\coloneq ${num(l.z)}\\mathrm{ft}`, "Depth below the top of the wall");
    m(`S_{v${k}}\\coloneq ${num(l.Svi)}\\mathrm{ft}`, "Tributary height");
    m(`K_{r${k}}\\coloneq ${krKa(k)}K_{ai}=`, "AASHTO Fig. 11.10.6.2.1-3");
    if (i.reinforcement === "steelstrip") m(`F_{p${k}}\\coloneq F_0-\\left(F_0-\\tan\\left(\\phi_r\\right)\\right)\\cdot${z20(k)}=`, "F*, AASHTO Fig. 11.10.6.3.2-2");
    else if (i.reinforcement === "steelgrid") m(`F_{p${k}}\\coloneq\\frac{t_g}{S_t}\\cdot\\left(20-10\\cdot${z20(k)}\\right)=`, "F*, AASHTO Fig. 11.10.6.3.2-2");
    else m(`F_{p${k}}\\coloneq F_p=`, "F*");
    m(`\\sigma_{v${k}}\\coloneq\\gamma_r\\cdot z_{${k}}+\\sigma_S+q_{DW}=`, "Unfactored, without live load", "ksf");
    m(`T_{${k}}\\coloneq K_{r${k}}\\cdot\\left(\\gamma_{EVmax}\\cdot\\left(\\sigma_{v${k}}-q_{DW}\\right)+${dw ? "\\gamma_{DWmax}" : "0"}\\cdot q_{DW}+${live ? "\\gamma_{LS}" : "0"}\\cdot\\sigma_{LS}\\right)\\cdot S_{v${k}}=`, "Tmax, Strength I (AASHTO Eq. 11.10.6.2.1-2)", "kip/ft");
    m(`T_{s${k}}\\coloneq K_{r${k}}\\cdot\\left(\\sigma_{v${k}}+\\sigma_{LS}\\right)\\cdot S_{v${k}}=`, "Service I", "kip/ft");
    m(kind.extensible ? `L_{A${k}}\\coloneq\\left(H-z_{${k}}\\right)\\cdot\\tan\\left(45\\mathrm{deg}-\\frac{\\phi_r}{2}\\right)=` : `L_{A${k}}\\coloneq\\max\\left(\\min\\left(0.3\\cdot H_1,0.6\\cdot\\left(H-z_{${k}}\\right)\\right),0\\mathrm{ft}\\right)=`, "Active zone, AASHTO Fig. 11.10.6.3.1-1", "ft");
    if (varLength) m(`L_{${k}}\\coloneq\\left(L+s_c\\cdot\\left(H-z_{${k}}\\right)\\right)${i.extendTop && idx < 2 ? "\\cdot2" : ""}=`, i.extendTop && idx < 2 ? "Its length, doubled (one of the top two)" : "Its length", "ft");
    m(`L_{e${k}}\\coloneq\\max\\left(${varLength ? `L_{${k}}` : "L"}-L_{A${k}},0\\mathrm{ft}\\right)=`, "In the resistant zone", "ft");
    m(`P_{r${k}}\\coloneq\\phi_{po}\\cdot F_{p${k}}\\cdot\\alpha\\cdot\\sigma_{v${k}}\\cdot C\\cdot L_{e${k}}\\cdot R_c=`, "Pullout resistance, AASHTO Eq. 11.10.6.3.2-1", "kip/ft");
    m(ok(`T_{${k}}`, `P_{r${k}}`), "Pullout");
    if (perLayerT) {
      const pr = l.product;
      if (pr.id === "custom") m(`T_{al${k}}\\coloneq T_{al}=`, "As entered", "kip/ft");
      else m(`T_{al${k}}\\coloneq\\frac{${num(pr.Tult)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}}{RF_{ID}\\cdot ${num(pr.RFcr)}\\cdot RF_{D}}=`, `${pr.name}: Tult / (RF_ID RF_CR RF_D), AASHTO 11.10.6.4.3b`, "kip/ft");
      m(`T_{r${k}}\\coloneq\\phi_t\\cdot T_{al${k}}\\cdot R_c=`, undefined, "kip/ft");
      m(ok(`T_{${k}}`, `T_{r${k}}`), "Rupture");
    } else m(ok(`T_{${k}}`, "T_r"), "Rupture");
  });

  if (eq) {
    text("Internal stability: Extreme Event I", "subheading");
    m(kind.extensible ? "A_a\\coloneq\\frac{1}{2}\\cdot H^{2}\\cdot\\tan\\left(45\\mathrm{deg}-\\frac{\\phi_r}{2}\\right)=" : `A_a\\coloneq ${i.H <= 0.5 * r.internal.H1! ? "0.3\\cdot H^{2}" : "0.3\\cdot H_1\\cdot H-0.075\\cdot H_1^{2}"}=`, "Active zone area", "ft^2");
    m("P_i\\coloneq k_h\\cdot\\gamma_r\\cdot A_a=", "Inertia of the active zone, AASHTO 11.10.7.2", "kip/ft");
    m(`L_{esum}\\coloneq ${each((k) => `L_{e${k}}`)}=`, undefined, "ft");
    text("Pi spread over the layers by their resistant lengths; F* at 80% under seismic loading.", "note");
    layers.forEach((_, idx) => {
      const k = idx + 1;
      m(`T_{md${k}}\\coloneq P_i\\cdot\\frac{L_{e${k}}}{L_{esum}}=`, `Layer ${k}`, "kip/ft");
      m(`T_{ee${k}}\\coloneq K_{r${k}}\\cdot\\left(\\sigma_{v${k}}+${live ? "\\gamma_{EQ}" : "0"}\\cdot\\sigma_{LS}\\right)\\cdot S_{v${k}}+T_{md${k}}=`, undefined, "kip/ft");
      m(`P_{rEE${k}}\\coloneq\\phi_{poEE}\\cdot0.8\\cdot F_{p${k}}\\cdot\\alpha\\cdot\\sigma_{v${k}}\\cdot C\\cdot L_{e${k}}\\cdot R_c=`, undefined, "kip/ft");
      m(ok(`T_{ee${k}}`, `P_{rEE${k}}`), "Pullout");
      m(ok(`T_{ee${k}}`, perLayerT ? `\\phi_{tEE}\\cdot T_{al${k}}\\cdot R_c` : "T_{rEE}"), "Rupture");
    });
  }

  // --- the barrier on top -----------------------------------------------------------------------
  const a = r.rail.anchor;
  if (a) {
    const lv = a.level;
    text(`Barrier on a moment slab: ${lv.label} (CDOT BDM 13.5.4: NCHRP Report 663 and Web Doc 326)`, "subheading");
    text("The barrier, slab, coping and the cover on the slab move as one between joints; any coupling to the next slab, the soil's shear and friction on the slab's sides are neglected. Sliding and overturning under the equivalent static load Ls, the coping under the dynamic load Ld, both at He.", "note");
    m(`L_s\\coloneq ${num(lv.Ls)}\\mathrm{kip}`, `Equivalent static load, ${lv.ref}`);
    m(`L_d\\coloneq ${num(lv.Ld)}\\mathrm{kip}`, "Dynamic impact load");
    m(`H_e\\coloneq ${num(a.He)}\\mathrm{in}`, "Height of the impact above the slab");
    m(`L_j\\coloneq ${num(a.Lj)}\\mathrm{ft}`, "Monolithic length between joints (at most 60 ft)");
    for (const [k, part] of a.weight.parts.entries()) m(`w_{${k + 1}}\\coloneq ${num(part.w, 4)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, `${part.name}, its c.g. ${num(part.x * 12, 3)} in from the front face`);
    m(`W_{ms}\\coloneq\\left(${a.weight.parts.map((_, k) => `w_{${k + 1}}`).join("+")}\\right)\\cdot L_j=`, "Weight between joints", "kip");
    m(`x_{cg}\\coloneq\\frac{${a.weight.parts.map((part, k) => `w_{${k + 1}}\\cdot ${num(part.x * 12, 4)}\\mathrm{in}`).join("+")}}{${a.weight.parts.map((_, k) => `w_{${k + 1}}`).join("+")}}=`, "Its c.g. from the front face", "in");
    m(rail.precast ? "\\mu_r\\coloneq\\frac{2}{3}\\cdot\\tan\\left(\\phi_r\\right)=" : "\\mu_r\\coloneq\\tan\\left(\\phi_r\\right)=", rail.precast ? "Smooth (precast) base, Web Doc 326 9.1.1" : "Rough (cast-in-place) base: φr = φ of the fill");
    m(`\\phi_{sl}\\coloneq ${num(lv.phiSlide)}`, "Sliding resistance factor");
    m(`\\phi_{ot}\\coloneq ${num(lv.phiOT)}`, "Overturning resistance factor");
    m(ok("L_s", "\\phi_{sl}\\cdot W_{ms}\\cdot\\mu_r"), "Sliding, Web Doc 326 Eqs. 9-1, 9-2 (γ 1.0, extreme event)");
    m(`l_{${rail.rotation}}\\coloneq x_{cg}-${num(a.rotX)}\\mathrm{in}=`, `To rotation point ${rail.rotation}${rail.rotation === "A" ? " (the coping's toe, isolated from the panel)" : " (bearing on the panel)"}`, "in");
    m(`h_{${rail.rotation}}\\coloneq H_e+${num(rail.ts)}\\mathrm{in}+${num(rail.copingDepth)}\\mathrm{in}=`, "From the impact down to the rotation point", "in");
    m(ok(`L_s\\cdot h_{${rail.rotation}}`, `\\phi_{ot}\\cdot W_{ms}\\cdot l_{${rail.rotation}}`), "Overturning, Web Doc 326 Eqs. 9-3, 9-4");
    text(`The coping at its critical section (${num(rail.copingT)} in thick, ${num(rail.hCrit)} in below the slab's top), #${rail.copingBar.bar} @ ${num(rail.copingBar.spacing)} in over the barrier's ${num(lv.BL)} ft.`, "note");
    m(`M_{ui}\\coloneq L_d\\cdot\\left(H_e+${num(rail.hCrit)}\\mathrm{in}\\right)=`, "NCHRP 663 J-1.3", "kip*ft");
    m(`A_{sc}\\coloneq\\frac{${num(lv.BL)}\\mathrm{ft}}{${num(rail.copingBar.spacing)}\\mathrm{in}}\\cdot ${num(BARS[rail.copingBar.bar].area)}\\mathrm{in}^{2}=`, undefined, "in^2");
    m(`d_{cp}\\coloneq ${num(rail.copingT)}\\mathrm{in}-${num(rail.copingCover)}\\mathrm{in}-\\frac{${num(BARS[rail.copingBar.bar].dia)}\\mathrm{in}}{2}=`, undefined, "in");
    m(`f_{yc}\\coloneq ${num(i.fy)}\\mathrm{ksi}`, "Coping bars");
    m(`f'_{cc}\\coloneq ${num(i.fc)}\\mathrm{ksi}`, "Coping concrete");
    m(`a_{cp}\\coloneq\\frac{A_{sc}\\cdot f_{yc}}{0.85\\cdot f'_{cc}\\cdot ${num(lv.BL)}\\mathrm{ft}}=`, undefined, "in");
    m(ok("M_{ui}", "0.9\\cdot A_{sc}\\cdot f_{yc}\\cdot\\left(d_{cp}-\\frac{a_{cp}}{2}\\right)"), "Coping flexure, AASHTO 5.6.3.2");
    text(`Moment slab width ${num(rail.B)} ft (Web Doc 326: ${num(lv.Wmin)} ft least); barrier ${num(rail.barrierH)} in high (${num(lv.Hmin)} in least).`);
  }
  if (r.rail.impact.length) {
    text(rail.kind === "anchor-slab" ? "Barrier impact on the reinforcement near the top (Web Doc 326 9.2)" : "Post-and-beam barrier on the top two layers (AASHTO 11.10.10.2)", "subheading");
    text(rail.kind === "anchor-slab" ? `Static earth pressure (unfactored, no traffic surcharge) plus the dynamic pressure pd × At: the first band (${num(a!.level.h[0])} ft below the top) and the second (the next ${num(a!.level.h[1])} ft) go to each layer by the part of its tributary height inside them. Pullout over the reinforcement's full length (φ 1.0); a geosynthetic's dynamic part without the creep factor (AASHTO Eq. 11.10.10.2-1).` : "300 lb/ft, half to each of the top two layers, at the extreme event resistance factors.", "note");
    const lv = a?.level;
    r.rail.impact.forEach((im) => {
      const k = im.k + 1;
      const l = layers[im.k];
      m(`F_{s${k}}\\coloneq K_{r${k}}\\cdot\\sigma_{v${k}}\\cdot S_{v${k}}=`, `Layer ${k}, static`, "kip/ft");
      if (lv) {
        const band = (p: [number, number]) => im.o.flatMap((o, j) => (o > 1e-9 ? [`${num(p[j])}\\mathrm{psf}\\cdot ${num(o, 4)}\\mathrm{ft}`] : [])).join("+");
        text(`Layer ${k}: ${num(im.o[0], 3)} ft of its tributary height in the first band, ${num(im.o[1], 3)} ft in the second.`, "note");
        m(`F_{dp${k}}\\coloneq ${band(lv.pdp)}=`, `Pullout pressures × its height in each band (${lv.ref})`, "kip/ft");
        m(`F_{dy${k}}\\coloneq ${band(lv.pdy)}=`, "Yield pressures × its height in each band", "kip/ft");
        m(`P_{f${k}}\\coloneq F_{p${k}}\\cdot\\alpha\\cdot\\sigma_{v${k}}\\cdot C\\cdot ${num(l.Lz)}\\mathrm{ft}\\cdot R_c=`, "Pullout over the full length, φ 1.0", "kip/ft");
      } else {
        m(`F_{dp${k}}\\coloneq0.15\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, "Half of 300 lb/ft");
        m(`F_{dy${k}}\\coloneq F_{dp${k}}=`, undefined, "kip/ft");
        m(`P_{f${k}}\\coloneq ${num(kind.phiPOEE)}\\cdot F_{p${k}}\\cdot\\alpha\\cdot\\sigma_{v${k}}\\cdot C\\cdot L_{e${k}}\\cdot R_c=`, undefined, "kip/ft");
      }
      m(ok(`F_{s${k}}+F_{dp${k}}`, `P_{f${k}}`), "Pullout under the impact");
      const R = `${num(kind.extensible ? kind.phiTEE : 1)}\\cdot ${num(l.product.Tal, 5)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}\\cdot R_c`;
      m(ok(kind.extensible ? `F_{s${k}}+\\frac{F_{dy${k}}}{${num(l.product.RFcr)}}` : `F_{s${k}}+F_{dy${k}}`, R), "Rupture under the impact");
    });
    text("CDOT's design charts (B-504-H) add 900 lb/ft to the layers within 2 ft of the top; MSE panels are sacrificial for the collision load (CDOT BDM 11).", "note");
  }

  // --- CDOT quantities ----------------------------------------------------------------------------
  const q = r.quantities;
  if (q.cdot) {
    const c = q.cdot;
    const site = i.site!;
    text(`Quantities per foot of wall (CDOT ${c.sheet})`, "subheading");
    m(`H_x\\coloneq ${num(c.H)}\\mathrm{ft}`, c.raised ? `Excavation height at the layout line, raised to the sheet's least 1.5 + 4 tan θ (entered ${num(site.excH)} ft)` : "Excavation height at the wall layout line");
    m(`\\theta_g\\coloneq ${num(site.theta)}\\mathrm{deg}`, "Existing ground's average angle");
    m(`R_L\\coloneq ${num(c.RL, 4)}\\mathrm{ft}`, truncated ? "Average reinforcement length, L + s H / 2" : "Reinforcement length");
    if (truncated) {
      m("h_x\\coloneq\\left(L+s_c\\cdot H_x\\right)\\cdot\\frac{\\tan\\left(\\theta_g\\right)}{1-s_c\\cdot\\tan\\left(\\theta_g\\right)}=", undefined, "ft");
      m("A_{x}\\coloneq\\left(H_x+\\frac{h_x}{2}\\right)\\cdot\\left(L+s_c\\cdot\\left(H_x+h_x\\right)\\right)-\\frac{s_c}{2}\\cdot\\left(H_x+h_x\\right)^{2}=", "The cut behind the wall", "ft^2");
      m(TOE, "The toe cover's cut in front (1'-6\")", "ft^2");
      m("EM_1\\coloneq\\left(A_x+A_t\\right)\\cdot1\\mathrm{ft}=", `Structure excavation, ${c.sheet}, per foot of wall`, "yd^3");
      m("BM_1\\coloneq\\left(3.375\\mathrm{ft}^{2}+R_L\\cdot H\\right)\\cdot1\\mathrm{ft}=", "Structure backfill (Class 1), per foot of wall", "yd^3");
      m("PLG\\coloneq L+s_c\\cdot H=", "Geomembrane pay length", "ft");
    } else {
      m("h_x\\coloneq\\left(H_x+R_L+1.5\\mathrm{ft}\\right)\\cdot\\frac{\\tan\\left(\\theta_g\\right)}{1-\\tan\\left(\\theta_g\\right)}=", undefined, "ft");
      m("A_{x}\\coloneq\\left(H_x+\\frac{h_x}{2}\\right)\\cdot\\frac{h_x}{\\tan\\left(\\theta_g\\right)}-0.5\\cdot\\left(H_x+h_x\\right)^{2}=", "The cut behind the wall", "ft^2");
      m(TOE, "The toe cover's cut in front (1'-6\")", "ft^2");
      m("EM_1\\coloneq\\left(A_x+A_t\\right)\\cdot1\\mathrm{ft}=", "Structure excavation, B-504-Q7, per foot of wall", "yd^3");
      m("BM_1\\coloneq\\left(H\\cdot\\left(R_L+1.5\\mathrm{ft}\\right)+0.5\\cdot H^{2}+3.375\\mathrm{ft}^{2}\\right)\\cdot1\\mathrm{ft}=", "Structure backfill (Class 1), per foot of wall", "yd^3");
      m("PLG\\coloneq R_L+1.5\\mathrm{ft}+H=", "Geomembrane pay length", "ft");
    }
    m("MRS\\coloneq\\left(H\\cdot R_L\\right)\\cdot1\\mathrm{ft}=", "Mechanical reinforcement of soil, per foot of wall", "yd^3");
    text(`Per foot of wall: excavation ${num(c.EM1, 3)} CY, backfill ${num(c.BM1, 3)} CY, MRS ${num(c.MRS, 3)} CY, geomembrane ${num(q.geomembraneSY, 3)} SY, facing ${num(q.facingSF, 3)} SF${q.slabCY > 0 ? `, moment slab and coping ${num(q.slabCY, 4)} CY (Class D)` : ""}; reinforcement ${num(q.reinfSY, 3)} SY for information (CDOT B-504-Q1).`);
  }
  if (q.segments && q.segments.segments.length) {
    const sg = q.segments;
    text("Wall segments (CDOT B-504-I1/I3)", "subheading");
    for (const g2 of sg.segments) text(`Sta. ${num(g2.from)} to ${num(g2.to)}: ${num(g2.length)} ft at an average ${num(g2.DH, 3)} ft (RL ${num(g2.L, 3)} ft, excavation ${num(g2.excH, 3)} ft): facing ${num(g2.DH * g2.length, 1)} SF, excavation ${num((g2.q?.EM1 ?? 0) * g2.length, 1)} CY, backfill ${num((g2.q?.BM1 ?? 0) * g2.length, 1)} CY, MRS ${num((g2.q?.MRS ?? 0) * g2.length, 1)} CY, geomembrane ${num(((g2.q?.PLG ?? 0) * g2.length) / 9, 1)} SY.`);
    text(`Total, ${num(sg.length)} ft: facing ${num(sg.facing, 1)} SF, excavation ${num(sg.EM1, 1)} CY, backfill ${num(sg.BM1, 1)} CY, MRS ${num(sg.MRS, 1)} CY, geomembrane ${num(sg.PLG / 9, 1)} SY. Highest segment ${num(sg.maxDH)} ft against the designed ${num(i.H)} ft.`);
  }

  // --- facing panel ---------------------------------------------------------------------------
  text("Precast facing panel", "subheading");
  text("The largest pressure behind the panel spans between the reinforcement connections: horizontally along the wall, vertically between the layers; w·l²/8 on either face. One mat of bars.", "note");
  m(`f'_{c}\\coloneq ${num(i.fc)}\\mathrm{ksi}`);
  m(`f_y\\coloneq ${num(i.fy)}\\mathrm{ksi}`);
  m("E_c\\coloneq120000\\cdot0.15^{2}\\cdot\\left(\\frac{f'_{c}}{\\mathrm{ksi}}\\right)^{0.33}\\cdot\\mathrm{ksi}=", "AASHTO Eq. 5.4.2.4-1", "ksi");
  m("n\\coloneq\\frac{29000\\mathrm{ksi}}{E_c}=", "Modular ratio");
  m("\\beta_1\\coloneq\\max\\left(0.65,\\min\\left(0.85,0.85-0.05\\cdot\\frac{f'_{c}-4\\mathrm{ksi}}{\\mathrm{ksi}}\\right)\\right)=", "AASHTO 5.6.2.2");
  m("f_r\\coloneq0.24\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}=", "AASHTO 5.4.2.6");
  m(`t_p\\coloneq ${num(i.panelT)}\\mathrm{in}`, "Panel thickness");
  m(`c_p\\coloneq ${num(i.panelCover)}\\mathrm{in}`, "Clear cover to the vertical bars");
  m(`s_p\\coloneq ${num(i.panelSpan / 12)}\\mathrm{ft}`, "Horizontal span between connections");
  m(`d_{bv}\\coloneq ${num(BARS[i.panelV.bar].dia)}\\mathrm{in}`, `Vertical bars #${i.panelV.bar} @ ${num(i.panelV.spacing)} in`);
  m(`d_{bh}\\coloneq ${num(BARS[i.panelH.bar].dia)}\\mathrm{in}`, `Horizontal bars #${i.panelH.bar} @ ${num(i.panelH.spacing)} in, inside the vertical`);
  // Each layer's pressure, the largest governing: in groups that fit the page.
  const cases = (t: (k: number) => string) => layers.map((_, k) => t(k + 1));
  lines.push(...maxLines("p", "u", [...cases((k) => `\\frac{T_{${k}}}{S_{v${k}}}`), ...(eq ? cases((k) => `\\frac{T_{ee${k}}}{S_{v${k}}}`) : [])], { ref: "Largest factored pressure", unit: "ksf" }));
  if (i.zoned) m(`S_v\\coloneq ${num(Math.max(...(i.zones ?? []).map((zn) => zn.Sv)))}\\mathrm{ft}`, "The largest zone spacing (the panel's vertical span)");
  lines.push(...maxLines("p", "s", cases((k) => `\\frac{T_{s${k}}}{S_{v${k}}}`), { ref: "Service I", unit: "ksf" }));
  m("d_v\\coloneq t_p-c_p-\\frac{d_{bv}}{2}=", "Vertical bars, from the inside face", "in");
  m("d_h\\coloneq t_p-c_p-d_{bv}-\\frac{d_{bh}}{2}=", "Horizontal bars, from the inside face", "in");

  const face = (key: string, name: string, d: string, span: string, bars: { bar: number; spacing: number }) => {
    const k = key;
    text(name, "note");
    m(`d_{${k}}\\coloneq ${d}=`, "Effective depth", "in");
    m(`A_{s${k}}\\coloneq\\frac{${num(BARS[bars.bar].area)}\\mathrm{in}^{2}}{${num(bars.spacing)}\\mathrm{in}}=`, "Steel per foot", "in^2/ft");
    m(`c_{${k}}\\coloneq\\frac{A_{s${k}}\\cdot f_y}{0.85\\cdot f'_{c}\\cdot\\beta_1}=`, "Neutral axis", "in");
    m(`\\varepsilon_{t${k}}\\coloneq0.003\\cdot\\frac{d_{${k}}-c_{${k}}}{c_{${k}}}=`);
    m(`\\phi_{${k}}\\coloneq\\max\\left(0.75,\\min\\left(0.9,0.75+0.15\\cdot\\frac{\\varepsilon_{t${k}}-0.002}{0.003}\\right)\\right)=`, "AASHTO 5.5.4.2");
    m(`M_{r${k}}\\coloneq\\phi_{${k}}\\cdot A_{s${k}}\\cdot f_y\\cdot\\left(d_{${k}}-\\frac{\\beta_1\\cdot c_{${k}}}{2}\\right)=`, "AASHTO 5.6.3.2", "kip*ft/ft");
    m(`M_{u${k}}\\coloneq\\frac{p_u\\cdot ${span}^{2}}{8}=`, undefined, "kip*ft/ft");
    m(`M_{cr${k}}\\coloneq0.67\\cdot1.6\\cdot f_r\\cdot\\frac{t_p^{2}}{6}=`, "AASHTO Eq. 5.6.3.3-1", "kip*ft/ft");
    m(ok(`\\max\\left(M_{u${k}},\\min\\left(1.33\\cdot M_{u${k}},M_{cr${k}}\\right)\\right)`, `M_{r${k}}`), "Flexure, with minimum reinforcement (AASHTO 5.6.3.3)");
    m(`M_{s${k}}\\coloneq\\frac{p_s\\cdot ${span}^{2}}{8}=`, "Service I", "kip*ft/ft");
    m(`\\rho_{${k}}\\coloneq\\frac{A_{s${k}}}{d_{${k}}}=`);
    m(`k_{${k}}\\coloneq\\sqrt{2\\cdot\\rho_{${k}}\\cdot n+\\left(\\rho_{${k}}\\cdot n\\right)^{2}}-\\rho_{${k}}\\cdot n=`);
    m(`f_{ss${k}}\\coloneq\\min\\left(0.6\\cdot f_y,\\frac{M_{s${k}}}{A_{s${k}}\\cdot\\left(1-\\frac{k_{${k}}}{3}\\right)\\cdot d_{${k}}}\\right)=`, "Service steel stress", "ksi");
    m(`d_{c${k}}\\coloneq t_p-d_{${k}}=`, undefined, "in");
    m(`\\beta_{s${k}}\\coloneq1+\\frac{d_{c${k}}}{0.7\\cdot\\left(t_p-d_{c${k}}\\right)}=`);
    m(`s_{max${k}}\\coloneq\\frac{700\\cdot${i.exposure === 1 ? "1.00" : "0.75"}\\cdot\\frac{\\mathrm{kip}}{\\mathrm{in}}}{\\beta_{s${k}}\\cdot f_{ss${k}}}-2\\cdot d_{c${k}}=`, `Crack control, AASHTO Eq. 5.6.7-1 (Class ${i.exposure})`, "in");
    m(ok(`${num(bars.spacing)}\\mathrm{in}`, `s_{max${k}}`), "Bar spacing");
  };
  face("vp", "Vertical bars, inside face in tension", "d_v", "S_v", i.panelV);
  face("vn", "Vertical bars, outside face in tension", "t_p-d_v", "S_v", i.panelV);
  face("hp", "Horizontal bars, inside face in tension", "d_h", "s_p", i.panelH);
  face("hn", "Horizontal bars, outside face in tension", "t_p-d_h", "s_p", i.panelH);
  text("Shear", "note");
  for (const [k, span, d] of [
    ["v", "S_v", "\\max\\left(d_v,t_p-d_v\\right)"],
    ["h", "s_p", "\\max\\left(d_h,t_p-d_h\\right)"],
  ] as const) {
    m(`V_{u${k}}\\coloneq0.625\\cdot p_u\\cdot ${span}=`, `Spanning ${k === "v" ? "vertically" : "horizontally"}, continuous`, "kip/ft");
    m(`d_{vs${k}}\\coloneq\\max\\left(0.9\\cdot${d},0.72\\cdot t_p\\right)=`, "AASHTO 5.7.2.8", "in");
    m(`V_{r${k}}\\coloneq0.9\\cdot0.0316\\cdot2\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}\\cdot d_{vs${k}}=`, "β = 2, AASHTO 5.7.3.3", "kip/ft");
    m(ok(`V_{u${k}}`, `V_{r${k}}`), "Shear");
  }
  lines.push(...checksSummary([{ checks: r.checks }]));
  return lines;
}


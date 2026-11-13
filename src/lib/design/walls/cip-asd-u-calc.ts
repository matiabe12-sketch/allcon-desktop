import type { Line } from "@/lib/calcs/library/templates";
import { checksSummary } from "../checks-summary";
import { designCipWall } from "./cip";
import { designCipAsdU } from "./cip-asd-u";
import { COLOR_NOTE, INPUT_COLOR, isInput, num } from "../calc-style";
import type { Figure } from "../figures";
import { BARS, type Bars, type CipInputs } from "./cip";

// The U-shaped stairwell's IRC/IBC allowable stress check as a calc package of its own (see
// cip-asd-u.ts): the two stems on one base slab, stability for the surcharge on both sides and on
// one side, the stems (propped by the landing or stair slab, if it is), their hooks into the base
// slab, and the base slab. Every step is live math, so Calcs works it out independently.

const ok = (demand: string, capacity: string) => `\\operatorname{if}\\left(${demand}\\le ${capacity},\\text{OK},\\text{NG}\\right)=`;

export function cipAsdUCalcLines(i: CipInputs, title: string, figures?: { section?: Figure }): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note", newPage?: boolean) => lines.push({ text: t, ...(style ? { style } : {}), ...(newPage ? { newPage: true } : {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}), ...(math.length > 110 && ref ? { wide: true } : {}), ...(isInput(math) ? { color: INPUT_COLOR } : {}) });

  const slope = i.backslope > 0;
  const rail = i.railWeight > 0;
  const two = i.asdSurcharge > 0;
  const H = i.Df === 0 ? i.He + i.D / 12 : i.He + i.Df;
  const hs = H - i.D / 12;
  const fill = i.Df - i.D / 12 > 0;
  const a = i.uPropHeight ?? i.Df - i.D / 12 - i.strutThickness / 24;
  const prop = i.uProp && a > 0 && a < hs;

  text(title.toUpperCase(), "heading");
  text("Cast-in-place U-shaped stairwell: two retaining stems on one continuous base slab, per foot along the stairwell, checked by allowable stress design at service loads.");

  text("Design basis", "subheading");
  text("Codes:- 2021 International Residential Code R404.4 and International Building Code 1807.2.3 for stability; ACI 318-19 for member strength.");
  text(`Stability:- The earth thrusts on the two stems balance through the base slab, so neither stem slides or overturns on its own. ${two ? `A surcharge on one side only is unbalanced and is resisted with a factor of safety of at least ${num(i.asdFsOverturning)} against overturning and ${num(i.asdFsSliding)} against sliding.` : "There is no surcharge, so nothing is unbalanced."} The base pressure is within the allowable bearing pressure.`);
  text(`Structure:- Two ${num(i.Tt)} in stems ${num(H)} ft high overall, ${num(i.uClear)} ft apart in the clear, on a ${num(i.D / 12)} ft thick base slab extending ${num(i.uOuter)} in beyond each stem.`);
  text(`Loads:- Case 1 is the soil on both sides.${two ? ` Case 2 adds a uniform surcharge of ${num(i.asdSurcharge * 1000)} psf on both sides, and Case 3 on one side only.` : ""} The members are designed for ${num(i.asdGammaD)}D + ${num(i.asdGammaH)}H (ACI 318-19 Table 5.3.1), with 0.9D also checked for the base slab${two ? ", and the surcharge on both sides" : ""}.`);
  if (prop) text("Lateral bracing:- The landing (or stair) slab is cast tight against both stems and doweled to them, so it props each stem against the soil pressure. Its force comes from compatibility: the stem is fixed into the base slab, and the slab, braced by the opposite stem, holds the prop point.");
  text(COLOR_NOTE, "note");

  // --- soil -----------------------------------------------------------------------------------
  text("Soil", "subheading", true);
  m(`\\gamma_s\\coloneq ${num(i.gammaS * 1000)}\\mathrm{pcf}`, "Backfill unit weight");
  m(`\\phi\\coloneq ${num(i.phi)}\\mathrm{deg}`, "Backfill friction angle");
  m(i.delta === null ? "\\delta\\coloneq\\frac{2}{3}\\cdot\\phi=" : `\\delta\\coloneq ${num(i.delta)}\\mathrm{deg}`, "Wall–backfill friction angle", "deg");
  m(slope ? `\\beta\\coloneq\\arctan\\left(\\frac{1}{${num(i.backslope)}}\\right)=` : "\\beta\\coloneq0\\mathrm{deg}", "Backslope angle", "deg");
  m("\\theta\\coloneq90\\mathrm{deg}", "Back of the wall, vertical");
  m("\\Gamma_a\\coloneq\\left(1+\\sqrt{\\frac{\\sin\\left(\\phi+\\delta\\right)\\cdot\\sin\\left(\\phi-\\beta\\right)}{\\sin\\left(\\theta-\\delta\\right)\\cdot\\sin\\left(\\theta+\\beta\\right)}}\\right)^{2}=");
  m("K_a\\coloneq\\frac{\\sin\\left(\\theta+\\phi\\right)^{2}}{\\Gamma_a\\cdot\\sin\\left(\\theta\\right)^{2}\\cdot\\sin\\left(\\theta-\\delta\\right)}=", "Coulomb active coefficient");
  if (i.efwMin > 0) m(`EFW_a\\coloneq\\max\\left(\\gamma_s\\cdot K_a,${num(i.efwMin * 1000)}\\mathrm{pcf}\\right)=`, "Equivalent fluid pressure (with the minimum set)", "pcf");
  else m("EFW_a\\coloneq\\gamma_s\\cdot K_a=", "Equivalent fluid pressure", "pcf");
  m(`q_a\\coloneq ${num(i.asdQa)}\\mathrm{ksf}`, "Allowable bearing pressure, IRC Table R401.4.1 or IBC Table 1806.2");
  if (i.asdMu === null) {
    m(`\\phi_{sub}\\coloneq ${num(i.phiSub)}\\mathrm{deg}`, "Subgrade friction angle");
    m("\\mu\\coloneq\\tan\\left(\\phi_{sub}\\right)=", "Base friction coefficient");
  } else m(`\\mu\\coloneq ${num(i.asdMu)}`, "Base friction coefficient, IBC Table 1806.2");
  m(`FS_{ot}\\coloneq ${num(i.asdFsOverturning)}`, "Required against overturning, IRC R404.4");
  m(`FS_{sl}\\coloneq ${num(i.asdFsSliding)}`, "Required against sliding, IRC R404.4");

  text("Concrete and reinforcement", "subheading");
  m(`f'_{c}\\coloneq ${num(i.fc)}\\mathrm{ksi}`);
  m(`\\gamma_c\\coloneq ${num(i.gammaC * 1000)}\\mathrm{pcf}`, "Reinforced concrete unit weight");
  m(`f_y\\coloneq ${num(i.fy)}\\mathrm{ksi}`, "ASTM A615");
  m(`E_s\\coloneq ${num(i.Es)}\\mathrm{ksi}`);
  m("\\beta_1\\coloneq\\max\\left(0.65,\\min\\left(0.85,0.85-0.05\\cdot\\frac{f'_{c}-4\\mathrm{ksi}}{\\mathrm{ksi}}\\right)\\right)=", "ACI 318-19 Table 22.2.2.4.3");
  m("\\varepsilon_{ty}\\coloneq\\frac{f_y}{E_s}=", "ACI 318-19 21.2.2.1");
  m(`\\gamma_D\\coloneq ${num(i.asdGammaD)}`, "Load factor, dead load, ACI 318-19 Table 5.3.1");
  m(`\\gamma_H\\coloneq ${num(i.asdGammaH)}`, "Load factor, lateral earth pressure");

  // --- geometry -------------------------------------------------------------------------------
  text("Geometry", "subheading");
  m(`H_e\\coloneq ${num(i.He)}\\mathrm{ft}`, "Exposed height, above the landing");
  m(`D_f\\coloneq ${num(i.Df)}\\mathrm{ft}`, "Landing to the base slab's bottom");
  m(`D\\coloneq ${num(i.D)}\\mathrm{in}`, "Base slab thickness");
  m(i.Df === 0 ? "H\\coloneq H_e+D=" : "H\\coloneq H_e+D_f=", "Retained height on each outer face", "ft");
  m("h_s\\coloneq H-D=", "Stem height", "ft");
  m(`T_t\\coloneq ${num(i.Tt)}\\mathrm{in}`, "Stem thickness");
  m(`L\\coloneq ${num(i.uClear)}\\mathrm{ft}`, "Clear between the stems");
  m(`P\\coloneq ${num(i.uOuter)}\\mathrm{in}`, "Base slab beyond each stem");
  m("B\\coloneq2\\cdot T_t+L+2\\cdot P=", "Base slab width", "ft");
  m("h_f\\coloneq\\max\\left(0\\mathrm{ft},D_f-D\\right)=", "Fill inside, from the base slab to the landing", "ft");
  if (figures?.section) lines.push({ region: figures.section });

  // --- service loads --------------------------------------------------------------------------
  text("Service loads (per foot along the stairwell)", "subheading", true);
  const W: [string, string, string][] = [["W_s", "2\\cdot\\gamma_c\\cdot T_t\\cdot h_s", "Both stems"], ["W_b", "\\gamma_c\\cdot B\\cdot D", "Base slab"]];
  if (rail) W.push(["W_r", `2\\cdot${num(i.railWeight)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, "Barrier or rail on each stem"]);
  W.push(["W_o", "2\\cdot\\gamma_s\\cdot P\\cdot h_s", "Soil on the outer projections"]);
  if (fill) W.push(["W_f", "\\gamma_s\\cdot L\\cdot h_f", "Fill inside, under the landing"]);
  for (const [n, f, what] of W) m(`${n}\\coloneq ${f}=`, what, "kip/ft");
  m(`W_{st}\\coloneq ${num(i.uStairs)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, "The stairs and landing on the base slab");
  m(`V_D\\coloneq ${[...W.map(([n]) => n), "W_{st}"].join("+")}=`, "Dead load, symmetric about the center", "kip/ft");
  m("P_a\\coloneq\\frac{1}{2}\\cdot EFW_a\\cdot H^{2}=", "Active earth force on each outer face", "kip/ft");
  m("EH_V\\coloneq P_a\\cdot\\sin\\left(\\delta\\right)=", "Vertical component, at each outer edge", "kip/ft");
  m("EH_H\\coloneq P_a\\cdot\\cos\\left(\\delta\\right)=", "Horizontal component; the two balance through the base slab", "kip/ft");
  if (two) {
    m(`q_s\\coloneq ${num(i.asdSurcharge * 1000)}\\mathrm{psf}`, "Uniform surcharge");
    m("P_s\\coloneq\\frac{EFW_a}{\\gamma_s}\\cdot q_s\\cdot H=", "Surcharge force on one outer face", "kip/ft");
    m("P_{sV}\\coloneq P_s\\cdot\\sin\\left(\\delta\\right)=", undefined, "kip/ft");
    m("P_{sH}\\coloneq P_s\\cdot\\cos\\left(\\delta\\right)=", undefined, "kip/ft");
  } else m("q_s\\coloneq0\\mathrm{psf}", "No surcharge");

  // --- stability ------------------------------------------------------------------------------
  text("Stability (service loads)", "subheading", true);
  m(`e_{max}\\coloneq\\frac{B}{${i.asdEccLimit}}=`, i.asdEccLimit === 6 ? "Resultant in the middle third" : "Resultant in the middle two-thirds", "ft");
  text("Case 1, soil on both sides", "subheading");
  m("V_1\\coloneq V_D+2\\cdot EH_V=", "Symmetric, so the pressure is uniform", "kip/ft");
  m("q_{max1}\\coloneq\\frac{V_1}{B}=", undefined, "ksf");
  m(ok("q_{max1}", "q_a"), "Bearing");
  if (two) {
    text("Case 2, surcharge on both sides", "subheading");
    m("V_2\\coloneq V_1+2\\cdot P_{sV}+2\\cdot q_s\\cdot P=", undefined, "kip/ft");
    m("q_{max2}\\coloneq\\frac{V_2}{B}=", undefined, "ksf");
    m(ok("q_{max2}", "q_a"), "Bearing");
    text("Case 3, surcharge on one side", "subheading");
    text("Method:- The structure tips away from the surcharge, about the opposite outer edge. The earth thrusts balance in force and moment; the surcharge's horizontal force is what is left.", "note");
    m("V_3\\coloneq V_1+P_{sV}+q_s\\cdot P=", undefined, "kip/ft");
    m("M_{R3}\\coloneq V_D\\cdot\\frac{B}{2}+EH_V\\cdot B+P_{sV}\\cdot B+q_s\\cdot P\\cdot\\left(B-\\frac{P}{2}\\right)=", "Resisting moment", "kip*ft/ft");
    m("M_{O3}\\coloneq P_{sH}\\cdot\\frac{H}{2}=", "Overturning moment", "kip*ft/ft");
    m("FS_{o3}\\coloneq\\frac{M_{R3}}{M_{O3}}=");
    m(ok("FS_{ot}", "FS_{o3}"), "Overturning, IRC R404.4");
    m("X_3\\coloneq\\frac{M_{R3}-M_{O3}}{V_3}=", "Resultant from the edge", "ft");
    m("e_{c3}\\coloneq\\frac{B}{2}-X_3=", undefined, "ft");
    m(ok("\\left|e_{c3}\\right|", "e_{max}"), "Eccentricity");
    m("q_{max3}\\coloneq\\operatorname{if}\\left(\\left|e_{c3}\\right|\\le\\frac{B}{6},\\frac{V_3}{B}\\cdot\\left(1+\\frac{6\\cdot\\left|e_{c3}\\right|}{B}\\right),\\frac{2\\cdot V_3}{3\\cdot\\left(\\frac{B}{2}-\\left|e_{c3}\\right|\\right)}\\right)=", "Maximum bearing pressure", "ksf");
    m(ok("q_{max3}", "q_a"), "Bearing");
    m("R_{f3}\\coloneq\\mu\\cdot V_3=", "Base friction", "kip/ft");
    m("FS_{s3}\\coloneq\\frac{R_{f3}}{P_{sH}}=", "Against the unbalanced thrust");
    m(ok("FS_{sl}", "FS_{s3}"), "Sliding, IRC R404.4");
  }

  // --- members --------------------------------------------------------------------------------
  const section = (k: string, name: string, o: { Mu: string; h: string; cover: number; bars: Bars; crack: boolean; all: boolean }) => {
    const bar = BARS[o.bars.bar];
    m(`c_{${k}}\\coloneq ${num(o.cover)}\\mathrm{in}`, `${name}: clear cover`);
    m(`d_{b${k}}\\coloneq ${num(bar.dia)}\\mathrm{in}`, `#${o.bars.bar} bars`);
    m(`s_{${k}}\\coloneq ${num(o.bars.spacing)}\\mathrm{in}`, "Spacing");
    m(`h_{${k}}\\coloneq ${o.h}=`, "Section depth", "in");
    m(`d_{${k}}\\coloneq h_{${k}}-c_{${k}}-\\frac{d_{b${k}}}{2}=`, "Effective depth", "in");
    m(`A_{s${k}}\\coloneq\\frac{${num(bar.area)}\\mathrm{in}^{2}}{s_{${k}}}=`, "Steel per foot", "in^2/ft");
    m(`a_{${k}}\\coloneq\\frac{A_{s${k}}\\cdot f_y}{0.85\\cdot f'_{c}}=`, "Stress block depth", "in");
    m(`\\varepsilon_{t${k}}\\coloneq0.003\\cdot\\frac{d_{${k}}-\\frac{a_{${k}}}{\\beta_1}}{\\frac{a_{${k}}}{\\beta_1}}=`, "Net tensile strain");
    m(`\\phi_{${k}}\\coloneq\\operatorname{if}\\left(\\varepsilon_{ty}+0.003\\le\\varepsilon_{t${k}},0.9,\\operatorname{if}\\left(\\varepsilon_{t${k}}\\le\\varepsilon_{ty},0.65,0.65+0.25\\cdot\\frac{\\varepsilon_{t${k}}-\\varepsilon_{ty}}{0.003}\\right)\\right)=`, "ACI 318-19 Table 21.2.2");
    m(`M_{u${k}}\\coloneq ${o.Mu}=`, "Factored moment", "kip*ft/ft");
    m(`M_{r${k}}\\coloneq\\phi_{${k}}\\cdot A_{s${k}}\\cdot f_y\\cdot\\left(d_{${k}}-\\frac{a_{${k}}}{2}\\right)=`, "ACI 318-19 22.3", "kip*ft/ft");
    m(ok(`M_{u${k}}`, `M_{r${k}}`), "Flexure");
    if (!o.all) return;
    m(`A_{m${k}}\\coloneq\\max\\left(0.0018\\cdot\\frac{60\\mathrm{ksi}}{f_y},0.0014\\right)\\cdot h_{${k}}=`, "Minimum steel, ACI 318-19 7.6.1.1", "in^2/ft");
    m(ok(`A_{m${k}}`, `A_{s${k}}`), "Minimum reinforcement");
    if (o.crack) {
      m(`r_{f${k}}\\coloneq\\frac{40\\mathrm{ksi}}{\\frac{2}{3}\\cdot f_y}=`, "40 ksi over fs = 2/3 fy, ACI 318-19 Table 24.3.2");
      m(`s_{x${k}}\\coloneq\\min\\left(15\\cdot r_{f${k}}\\cdot\\mathrm{in}-2.5\\cdot c_{${k}},12\\cdot r_{f${k}}\\cdot\\mathrm{in},3\\cdot h_{${k}},18\\mathrm{in}\\right)=`, "Spacing, ACI 318-19 24.3.2 and 7.7.2.3", "in");
    } else m(`s_{x${k}}\\coloneq\\min\\left(3\\cdot h_{${k}},18\\mathrm{in}\\right)=`, "Spacing, ACI 318-19 7.7.2.3", "in");
    m(ok(`s_{${k}}`, `s_{x${k}}`), "Bar spacing");
  };
  const shear = (k: string, Vu: string, d: string, As: string, footing: boolean, ref: string) => {
    m(`V_{u${k}}\\coloneq ${Vu}=`, "Factored shear", "kip/ft");
    m(`\\rho_{w${k}}\\coloneq\\frac{${As}}{${d}}=`);
    m(footing ? `\\lambda_{s${k}}\\coloneq1` : `\\lambda_{s${k}}\\coloneq\\min\\left(1,\\sqrt{\\frac{2}{1+\\frac{${d}}{10\\mathrm{in}}}}\\right)=`, footing ? "Size effect neglected for a footing, ACI 318-19 13.2.6.2" : "Size effect, ACI 318-19 Eq. 22.5.5.1.3");
    m(`V_{r${k}}\\coloneq0.75\\cdot\\min\\left(8\\cdot\\lambda_{s${k}}\\cdot\\rho_{w${k}}^{\\frac{1}{3}},5\\right)\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{psi}}}\\cdot\\mathrm{psi}\\cdot ${d}=`, ref, "kip/ft");
    m(ok(`V_{u${k}}`, `V_{r${k}}`), "Shear");
  };

  text("Members (ACI 318-19 strength design)", "heading", true);
  text("Stems", "subheading");
  text(`Each stem is a one-way slab (ACI 318-19 13.3.6.1) fixed into the base slab${prop ? " and propped by the landing or stair slab" : ", a cantilever"}, under the factored soil pressure${two ? " and surcharge" : ""}.`, "note");
  m("k_u\\coloneq\\gamma_H\\cdot\\cos\\left(\\delta\\right)\\cdot EFW_a=", "Factored pressure, per foot of depth", "kcf");
  m("s_u\\coloneq\\gamma_H\\cdot\\cos\\left(\\delta\\right)\\cdot\\frac{EFW_a}{\\gamma_s}\\cdot q_s=", "Factored uniform pressure", "ksf");
  if (prop) {
    text("Slab prop", "subheading");
    text("Method:- The prop force R_u keeps the prop point from moving: the free cantilever's deflection there (by the moment-area method, with the depth u measured down from the soil's top) over the deflection a³/3EI of a unit force. EI cancels.", "note");
    m(`t_s\\coloneq ${num(i.strutThickness)}\\mathrm{in}`, "Landing or stair slab thickness");
    m(`f'_{cs}\\coloneq ${num(i.strutFc)}\\mathrm{ksi}`, "Slab concrete");
    m(i.uPropHeight === null ? "a\\coloneq D_f-D-\\frac{t_s}{2}=" : `a\\coloneq ${num(i.uPropHeight)}\\mathrm{ft}`, "The slab's mid-depth above the base slab's top", "ft");
    m("c\\coloneq h_s-a=", "Soil above the prop", "ft");
    m("I_2\\coloneq\\frac{h_s^{4}-c^{4}}{4}-c\\cdot\\frac{h_s^{3}-c^{3}}{3}=", undefined, "ft^4");
    m("I_3\\coloneq\\frac{h_s^{5}-c^{5}}{5}-c\\cdot\\frac{h_s^{4}-c^{4}}{4}=", undefined, "ft^5");
    m("R_u\\coloneq\\frac{3\\cdot\\left(\\frac{k_u}{6}\\cdot I_3+\\frac{s_u}{2}\\cdot I_2\\right)}{a^{3}}=", "Factored prop force", "kip/ft");
    m("P_{cu}\\coloneq0.65\\cdot0.85\\cdot f'_{cs}\\cdot t_s=", "Bearing strength of the slab on the stem, ACI 318-19 22.8.3.2", "kip/ft");
    m(ok("R_u", "P_{cu}"), "Prop bearing");
    m("M_b\\coloneq k_u\\cdot\\frac{h_s^{3}}{6}+s_u\\cdot\\frac{h_s^{2}}{2}-R_u\\cdot a=", "At the base (positive: soil face in tension)", "kip*ft/ft");
    m("M_p\\coloneq k_u\\cdot\\frac{c^{3}}{6}+s_u\\cdot\\frac{c^{2}}{2}=", "At the prop", "kip*ft/ft");
    m("u_0\\coloneq\\frac{-s_u+\\sqrt{s_u^{2}+2\\cdot k_u\\cdot R_u}}{k_u}=", "Depth of zero shear below the prop", "ft");
    m("u_z\\coloneq\\min\\left(\\max\\left(u_0,c\\right),h_s\\right)=", undefined, "ft");
    m("M_z\\coloneq k_u\\cdot\\frac{u_z^{3}}{6}+s_u\\cdot\\frac{u_z^{2}}{2}-R_u\\cdot\\left(u_z-c\\right)=", "There", "kip*ft/ft");
    m("M_c\\coloneq M_b=", "Corner moment into the base slab", "kip*ft/ft");
  } else m("M_c\\coloneq k_u\\cdot\\frac{h_s^{3}}{6}+s_u\\cdot\\frac{h_s^{2}}{2}=", "At the base, also the corner moment into the base slab", "kip*ft/ft");
  text("Soil face (vertical bars)", "subheading");
  section("st", "Stem, soil face", { Mu: prop ? "\\max\\left(0\\mathrm{kip},M_b,M_p,M_z\\right)" : "M_c", h: "T_t", cover: i.coverStem, bars: i.stemBars, crack: true, all: true });
  if (prop) {
    // The shear's three places, each on its own line.
    m("V_{1s}\\coloneq\\left|k_u\\cdot\\frac{h_s^{2}}{2}+s_u\\cdot h_s-R_u\\right|=", "Shear at the base", "kip/ft");
    m("V_{2s}\\coloneq k_u\\cdot\\frac{c^{2}}{2}+s_u\\cdot c=", "Just above the prop", "kip/ft");
    m("V_{3s}\\coloneq\\left|V_{2s}-R_u\\right|=", "Just below it", "kip/ft");
  }
  shear(
    "st",
    prop ? "\\max\\left(V_{1s},V_{2s},V_{3s}\\right)" : "k_u\\cdot\\frac{h_s^{2}}{2}+s_u\\cdot h_s",
    "d_{st}",
    "A_{sst}",
    false,
    "No stirrups, ACI 318-19 Table 22.5.5.1(c), φ = 0.75",
  );
  if (prop) {
    text("Inside face, below the prop (vertical bars)", "subheading");
    section("in", "Stem, inside face", { Mu: "\\max\\left(0\\mathrm{kip},-\\min\\left(M_b,M_p,M_z\\right)\\right)", h: "T_t", cover: i.coverStem, bars: i.uInnerBars, crack: true, all: false });
  }
  text("Hooks of the soil-face bars into the base slab", "subheading");
  m("\\psi_c\\coloneq\\min\\left(1,\\frac{f'_{c}}{15000\\mathrm{psi}}+0.6\\right)=", "ACI 318-19 Table 25.4.3.2");
  m("l_{dh}\\coloneq\\max\\left(\\frac{\\frac{f_y}{\\mathrm{psi}}\\cdot1.6\\cdot\\psi_c}{55\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{psi}}}}\\cdot\\left(\\frac{d_{bst}}{\\mathrm{in}}\\right)^{1.5}\\cdot\\mathrm{in},8\\cdot d_{bst},6\\mathrm{in}\\right)=", "ACI 318-19 25.4.3.1, ψe = ψo = 1, ψr = 1.6", "in");
  m(`l_{av}\\coloneq D-${num(i.coverToe)}\\mathrm{in}=`, "Room in the base slab", "in");
  m(ok("l_{dh}", "l_{av}"), "Hook development");

  text("Base slab", "subheading", true);
  text("Method:- The factored base pressure is uniform. Between the stems the slab carries the corner moments (with those of the outer projections) and the net upward pressure; each outer projection cantilevers. Positive moment puts the bottom in tension. Both load factors on the dead load are checked.", "note");
  for (const [k, g] of [["1", "\\gamma_D"], ["2", "0.9"]] as const) {
    m(`V_{f${k}}\\coloneq ${g}\\cdot V_D+\\gamma_H\\cdot\\left(2\\cdot EH_V${two ? "+2\\cdot P_{sV}+2\\cdot q_s\\cdot P" : ""}\\right)=`, `${k === "1" ? num(i.asdGammaD) : "0.9"}D + ${num(i.asdGammaH)}H`, "kip/ft");
    m(`q_{u${k}}\\coloneq\\frac{V_{f${k}}}{B}=`, undefined, "ksf");
    m(`w_{${k}}\\coloneq q_{u${k}}-${g}\\cdot\\left(\\gamma_c\\cdot D+\\gamma_s\\cdot h_f+\\frac{W_{st}}{L}\\right)=`, "Net upward, between the stems", "ksf");
    m(`w_{o${k}}\\coloneq q_{u${k}}-${g}\\cdot\\left(\\gamma_c\\cdot D+\\gamma_s\\cdot h_s\\right)-\\gamma_H\\cdot q_s=`, "Net upward, outer projection", "ksf");
    m(`M_{o${k}}\\coloneq w_{o${k}}\\cdot\\frac{P^{2}}{2}=`, "Outer projection at the stem", "kip*ft/ft");
    m(`M_{e${k}}\\coloneq M_c+M_{o${k}}=`, "Span between the stems, at the stem faces", "kip*ft/ft");
    m(`M_{bt${k}}\\coloneq\\max\\left(0\\mathrm{kip},M_{e${k}},M_{e${k}}-w_{${k}}\\cdot\\frac{L^{2}}{8},M_{o${k}}\\right)=`, "Bottom in tension", "kip*ft/ft");
    m(`M_{tp${k}}\\coloneq\\max\\left(0\\mathrm{kip},-M_{e${k}},w_{${k}}\\cdot\\frac{L^{2}}{8}-M_{e${k}},-M_{o${k}}\\right)=`, "Top in tension", "kip*ft/ft");
    m(`V_{b${k}}\\coloneq\\max\\left(\\left|w_{${k}}\\right|\\cdot\\frac{L}{2},\\left|w_{o${k}}\\right|\\cdot P\\right)=`, "Shear at the stem faces", "kip/ft");
  }
  text("Bottom bars", "subheading");
  section("bo", "Base slab, bottom", { Mu: "\\max\\left(M_{bt1},M_{bt2}\\right)", h: "D", cover: i.coverToe, bars: i.toeBars, crack: false, all: true });
  text("Top bars", "subheading");
  section("tp", "Base slab, top", { Mu: "\\max\\left(M_{tp1},M_{tp2}\\right)", h: "D", cover: i.coverHeel, bars: i.heelBars, crack: false, all: true });
  text("Shear", "subheading");
  shear("ba", "\\max\\left(V_{b1},V_{b2}\\right)", "\\min\\left(d_{bo},d_{tp}\\right)", "\\min\\left(A_{sbo},A_{stp}\\right)", true, "No stirrups, ACI 318-19 Table 22.5.5.1(c), φ = 0.75");

  text("Shrinkage and temperature steel", "subheading");
  text("The horizontal bars at both faces together, ACI 318-19 24.4.3.2.", "note");
  for (const [k, name, bars, h] of [["ts", "Stems", i.stemTemp, "T_t"], ["tf", "Base slab", i.toeTemp, "D"]] as const) {
    m(`A_{${k}}\\coloneq\\frac{2\\cdot${num(BARS[bars.bar].area)}\\mathrm{in}^{2}}{${num(bars.spacing)}\\mathrm{in}}=`, `${name}: #${bars.bar} at ${num(bars.spacing)} in, each face`, "in^2/ft");
    m(`A_{r${k}}\\coloneq\\max\\left(0.0018\\cdot\\frac{60\\mathrm{ksi}}{f_y},0.0014\\right)\\cdot ${h}=`, undefined, "in^2/ft");
    m(ok(`A_{r${k}}`, `A_{${k}}`), name);
  }

  text("Required construction notes", "subheading", true);
  const notes = [
    "Keep the base slab continuous across the stairwell, without joints, so it ties the stems together.",
    "Hook the stems' soil-face bars into the base slab, with the hooks turned toward the stairwell and lapped with the bottom bars.",
    ...(prop
      ? [
          "Cast the landing and stair slabs tight against both stems, with no compressible joint material, and dowel them to both stems (drilled and epoxied, or cast in) so they stay in contact. Do not backfill until the slabs have reached 75 percent of their specified strength.",
          "The stems are designed with the slabs in place. Do not cut, core or remove the slabs between the stems.",
        ]
      : []),
    "Provide free-draining backfill and a perforated drain at the base of both stems with an outlet, so that no water pressure builds up behind them.",
  ];
  notes.forEach((n, k) => text(`${k + 1}. ${n}`));
  lines.push(...checksSummary([{ checks: designCipAsdU(i, designCipWall(i)).checks }]));
  return lines;
}

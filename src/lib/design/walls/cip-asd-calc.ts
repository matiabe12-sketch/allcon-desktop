import type { Line } from "@/lib/calcs/library/templates";
import { checksSummary } from "../checks-summary";
import { designCipWall } from "./cip";
import { designCipAsd } from "./cip-asd";
import { COLOR_NOTE, INPUT_COLOR, isInput, num } from "../calc-style";
import type { Figure } from "../figures";
import { BARS, type Bars, type CipInputs } from "./cip";

// The CIP cantilever wall's IRC/IBC allowable stress check as a calc package of its own, without
// the AASHTO LRFD design: the design basis, service loads, stability for each load case (with the
// slab strut, if any), and the members by ACI 318-19 strength design. Every step is live math, so
// Calcs works it out independently of the design engine (cip-asd.ts).

const ok = (demand: string, capacity: string) => `\\operatorname{if}\\left(${demand}\\le ${capacity},\\text{OK},\\text{NG}\\right)=`;

export function cipAsdCalcLines(i: CipInputs, title: string, figures?: { section?: Figure }): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note", newPage?: boolean) => lines.push({ text: t, ...(style ? { style } : {}), ...(newPage ? { newPage: true } : {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}), ...(math.length > 110 && ref ? { wide: true } : {}), ...(isInput(math) ? { color: INPUT_COLOR } : {}) });

  const batter = i.frontBatter > 0 || i.backBatter > 0;
  const pave = i.pavementThickness > 0;
  const slope = i.backslope > 0;
  const toeFill = i.Df * 12 > i.D;
  const rail = i.railWeight > 0;
  const two = i.asdSurcharge > 0;
  const cases = two ? [1, 2] : [1];
  const strut = i.strut;
  const key = i.shearKey;
  const H = i.Df === 0 ? i.He + i.D / 12 : i.He + i.Df;
  const yProp = i.Df - i.strutThickness / 24;
  const prop = strut && i.strutProp && yProp > 0;
  const yps = yProp - i.D / 12;
  const propStem = prop && yps > 0 && yps < H - i.D / 12 - i.pavementThickness / 12;

  text(title.toUpperCase(), "heading");
  text("Cast-in-place cantilever retaining wall, per foot of wall, checked by allowable stress design at service loads. Moments are taken about the toe.");

  // --- design basis ---------------------------------------------------------------------------
  text("Design basis", "subheading");
  text("Codes:- 2021 International Residential Code R404.4 and International Building Code 1807.2.3 for stability; ACI 318-19 for member strength.");
  text(`Stability:- Allowable stress design at service loads, with a factor of safety of at least ${num(i.asdFsOverturning)} against overturning and ${num(i.asdFsSliding)} against sliding, and the base pressure within the allowable bearing pressure.`);
  text(`Wall:- Cantilever wall ${num(H)} ft high overall, with a ${num(i.Tt)} in stem on a ${num(i.B / 12)} ft by ${num(i.D / 12)} ft footing (toe ${num(i.A / 12)} ft), and ${slope ? `a backslope of ${num(i.backslope)}H:1V` : "level backfill"}.`);
  text(`Loads:- Case 1 is the soil only.${two ? ` Case 2 adds a uniform surcharge of ${num(i.asdSurcharge * 1000)} psf on the backfill.` : ""} The members are designed for ${num(i.asdGammaD)}D + ${num(i.asdGammaH)}H (ACI 318-19 Table 5.3.1), with 0.9D also checked for the toe.`);
  if (strut) text("Sliding:- The landing slab is cast tight between this wall's stem and the opposite one, so it acts as a compression strut and carries the soil thrust across.");
  if (prop) text("Overturning:- The slab also props the wall against rotation. Its force is found by compatibility between the wall, the soil under the footing and the slab, for a lower and an upper bound of the soil's horizontal stiffness, and both are checked.");

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
  m(`H_e\\coloneq ${num(i.He)}\\mathrm{ft}`, "Exposed height");
  m(`D_f\\coloneq ${num(i.Df)}\\mathrm{ft}`, "Cover over the footing (to its bottom)");
  m(`D\\coloneq ${num(i.D)}\\mathrm{in}`, "Footing thickness");
  m(i.Df === 0 ? "H\\coloneq H_e+D=" : "H\\coloneq H_e+D_f=", "Design height", "ft");
  m("h_s\\coloneq H-D=", "Stem height", "ft");
  m(`T_t\\coloneq ${num(i.Tt)}\\mathrm{in}`, "Stem thickness at the top");
  if (batter) {
    m(`T_1\\coloneq ${num(i.frontBatter)}\\frac{\\mathrm{in}}{\\mathrm{ft}}\\cdot h_s=`, "Front batter width", "in");
    m(`T_2\\coloneq ${num(i.backBatter)}\\frac{\\mathrm{in}}{\\mathrm{ft}}\\cdot h_s=`, "Back batter width", "in");
  } else {
    m("T_1\\coloneq0\\mathrm{in}");
    m("T_2\\coloneq0\\mathrm{in}");
  }
  m("T_b\\coloneq T_t+T_1+T_2=", "Stem thickness at the bottom", "in");
  m(`B\\coloneq ${num(i.B)}\\mathrm{in}`, "Footing width");
  m(`A\\coloneq ${num(i.A)}\\mathrm{in}`, "Toe");
  m("C\\coloneq B-A-T_b=", "Heel", "in");
  m(`t\\coloneq ${num(i.pavementThickness)}\\mathrm{in}`, "Pavement");
  m("h\\coloneq H-t+\\left(T_2+C\\right)\\cdot\\tan\\left(\\beta\\right)=", "Retained height at the heel", "ft");
  if (figures?.section) lines.push({ region: figures.section });

  // --- service loads --------------------------------------------------------------------------
  text("Service loads", "subheading", true);
  if (rail) {
    m(`w_{rail}\\coloneq ${num(i.railWeight)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, "Barrier or rail on the wall");
    m(`c_{rail}\\coloneq ${num(i.railCg)}\\mathrm{in}`, "Its center of gravity from the stem's front face");
  }
  const vert: [string, string, string, string][] = [];
  if (batter) vert.push(["DC_1", "\\frac{1}{2}\\cdot T_1\\cdot h_s\\cdot\\gamma_c", "A+\\frac{2}{3}\\cdot T_1", "Front batter of the stem"]);
  vert.push(["DC_2", "T_t\\cdot h_s\\cdot\\gamma_c", "A+T_1+\\frac{T_t}{2}", "Stem"]);
  if (batter) vert.push(["DC_3", "\\frac{1}{2}\\cdot T_2\\cdot h_s\\cdot\\gamma_c", "A+T_1+T_t+\\frac{T_2}{3}", "Back batter of the stem"]);
  vert.push(["DC_4", "B\\cdot D\\cdot\\gamma_c", "\\frac{B}{2}", "Footing"]);
  if (rail) vert.push(["DC_5", "w_{rail}", "A+T_1+c_{rail}", "Barrier or rail"]);
  if (pave) vert.push(["DC_6", `t\\cdot${num(i.gammaPavement * 1000)}\\mathrm{pcf}\\cdot\\left(T_2+C\\right)`, "B-\\frac{T_2+C}{2}", "Pavement"]);
  vert.push(["EV_1", "C\\cdot\\left(h_s-t\\right)\\cdot\\gamma_s", "B-\\frac{C}{2}", "Soil on the heel"]);
  if (batter) vert.push(["EV_2", "\\frac{1}{2}\\cdot T_2\\cdot\\left(h_s-t\\right)\\cdot\\gamma_s", "A+T_1+T_t+\\frac{2}{3}\\cdot T_2", "Soil on the back batter"]);
  if (toeFill) vert.push(["EV_3", "A\\cdot\\left(D_f-D\\right)\\cdot\\gamma_s", "\\frac{A}{2}", "Soil on the toe"]);
  if (slope) vert.push(["EV_4", "\\frac{1}{2}\\cdot\\left(T_2+C\\right)^{2}\\cdot\\tan\\left(\\beta\\right)\\cdot\\gamma_s", "A+T_1+T_t+\\frac{2}{3}\\cdot\\left(T_2+C\\right)", "Soil in the backslope"]);
  for (const [name, force, arm, what] of vert) {
    m(`${name}\\coloneq ${force}=`, what, "kip/ft");
    m(`x_{${name.replace("_", "")}}\\coloneq ${arm}=`, `Arm of ${name.replace("_", "")}`, "ft");
  }
  m(`V_D\\coloneq ${vert.map(([n]) => n).join("+")}=`, "Weight of the wall and the soil on it", "kip/ft");
  m(`M_D\\coloneq ${vert.map(([n]) => `${n}\\cdot x_{${n.replace("_", "")}}`).join("+")}=`, "Its moment about the toe", "kip*ft/ft");
  m("P_a\\coloneq\\frac{1}{2}\\cdot EFW_a\\cdot h^{2}=", "Active earth force", "kip/ft");
  m("EH_V\\coloneq P_a\\cdot\\sin\\left(\\delta\\right)=", "Vertical component, at the heel", "kip/ft");
  m("EH_H\\coloneq P_a\\cdot\\cos\\left(\\delta\\right)=", "Horizontal component, at h/3", "kip/ft");
  if (two) {
    m(`q_s\\coloneq ${num(i.asdSurcharge * 1000)}\\mathrm{psf}`, "Uniform surcharge on the backfill (Case 2)");
    m("P_s\\coloneq\\frac{EFW_a}{\\gamma_s}\\cdot q_s\\cdot h=", "Surcharge force, a uniform pressure over the height", "kip/ft");
    m("P_{sV}\\coloneq P_s\\cdot\\sin\\left(\\delta\\right)=", "Vertical component, at the heel", "kip/ft");
    m("P_{sH}\\coloneq P_s\\cdot\\cos\\left(\\delta\\right)=", "Horizontal component, at h/2", "kip/ft");
  }
  if (key) {
    text("Shear key:- The passive resistance of the soil block in front of the key, with the fill over the toe that may be removed neglected.", "note");
    m(i.kpOverride !== null ? `K_p\\coloneq ${num(i.kpOverride)}` : "K_p\\coloneq\\frac{\\sin\\left(\\theta-\\phi\\right)^{2}}{\\left(1-\\sqrt{\\frac{\\sin\\left(\\phi+\\delta\\right)\\cdot\\sin\\left(\\phi+\\beta\\right)}{\\sin\\left(\\theta+\\delta\\right)\\cdot\\sin\\left(\\theta+\\beta\\right)}}\\right)^{2}\\cdot\\sin\\left(\\theta\\right)^{2}\\cdot\\sin\\left(\\theta+\\delta\\right)}=", "Passive coefficient");
    m(`\\phi_{sk}\\coloneq ${num(i.phiSub)}\\mathrm{deg}`, "Subgrade friction angle");
    m("\\delta_{sub}\\coloneq\\frac{2}{3}\\cdot\\phi_{sk}=", undefined, "deg");
    m(`d_{key}\\coloneq ${num(i.keyDepth)}\\mathrm{in}`, "Key depth below the footing");
    m(`D_w\\coloneq ${num(i.keyWidth)}\\mathrm{in}`, "Key width");
    m(i.keyFromHeel !== null ? `K_{key}\\coloneq ${num(i.keyFromHeel)}\\mathrm{in}` : "K_{key}\\coloneq\\frac{B}{3}=", "Heel to the key's centerline", "ft");
    m("X_{key}\\coloneq B-K_{key}-\\frac{D_w}{2}=", "Toe to the front of the key", "ft");
    m("c_k\\coloneq d_{key}+X_{key}\\cdot\\tan\\left(\\delta_{sub}\\right)=", "Depth of the soil block", "ft");
    m(`d_{ig}\\coloneq ${num(i.toeFillIgnored)}\\mathrm{ft}`, "Fill over the toe neglected");
    m("y_1\\coloneq\\max\\left(D_f-d_{ig},0\\mathrm{ft}\\right)=", undefined, "ft");
    m("P_p\\coloneq\\gamma_s\\cdot K_p\\cdot\\left(y_1+\\frac{c_k}{2}\\right)\\cdot c_k=", "Passive resistance", "kip/ft");
  } else m("P_p\\coloneq0\\frac{\\mathrm{kip}}{\\mathrm{ft}}", "No shear key; passive pressure in front of the toe neglected");

  // --- landing slab ---------------------------------------------------------------------------
  if (strut) {
    text("Landing slab", "subheading", true);
    m(`t_s\\coloneq ${num(i.strutThickness)}\\mathrm{in}`, "Slab thickness");
    m(`f'_{cs}\\coloneq ${num(i.strutFc)}\\mathrm{ksi}`, "Slab concrete");
    m(`L_s\\coloneq ${num(i.strutSpan)}\\mathrm{ft}`, "Clear span between the stems");
    m("P_c\\coloneq0.65\\cdot0.85\\cdot f'_{cs}\\cdot t_s=", "Bearing strength, ACI 318-19 22.8.3.2 with φ = 0.65 (Table 21.2.1)", "kip/ft");
    m("E_{cs}\\coloneq57000\\cdot\\sqrt{\\frac{f'_{cs}}{\\mathrm{psi}}}\\cdot\\mathrm{psi}=", "ACI 318-19 19.2.2.1(b)", "ksi");
    m("k_s\\coloneq\\frac{E_{cs}\\cdot t_s}{L_s}=", "Axial stiffness per inch of wall", "ksi");
  }
  if (prop) {
    text("The slab as a prop", "subheading");
    text(`Method:- The wall and footing move as a rigid body on soil springs: k_v under the base resists rocking and k_h resists sliding. The slab, at its mid-depth y_p above the footing's bottom, moves only as much as it shortens. Only the loads placed after the slab is cast count${i.strutBeforeBackfill ? " (it is cast before the backfill, so the earth and the soil on the footing)" : " (it is cast after the backfill, so the surcharge only)"}. The stem's own bending, which would add to the prop force, is neglected. As k_h/k_v is uncertain, the force is found for a lower and an upper bound and both are checked.`, "note");
    m("y_p\\coloneq D_f-\\frac{t_s}{2}=", "Height of the prop above the footing's bottom", "ft");
    m(`k_v\\coloneq ${num(i.strutKv)}\\frac{\\mathrm{psi}}{\\mathrm{in}}`, "Vertical modulus of subgrade reaction");
    m(`r_l\\coloneq ${num(i.strutKhLo)}`, "k_h/k_v, lower bound");
    m(`r_h\\coloneq ${num(i.strutKhHi)}`, "k_h/k_v, upper bound");
    m("K_{rot}\\coloneq\\frac{k_v\\cdot B^{3}}{12}=", "Rocking stiffness, per radian", "kip*ft/ft");
    m("K_{hl}\\coloneq r_l\\cdot k_v\\cdot B=", "Sliding stiffness, lower bound", "ksf");
    m("K_{hh}\\coloneq r_h\\cdot k_v\\cdot B=", "Sliding stiffness, upper bound", "ksf");
    m(i.strutOpposite ? "K_{sp}\\coloneq2\\cdot k_s=" : "K_{sp}\\coloneq k_s=", i.strutOpposite ? "The slab's spring, with the slab's middle fixed by the same wall opposite" : "The slab's spring", "ksf");
    if (i.strutBeforeBackfill) {
      const dcs = vert.map(([n]) => n).filter((n) => n.startsWith("DC"));
      m(`V_C\\coloneq ${dcs.join("+")}=`, "The wall's own weight, on before the slab", "kip/ft");
      m(`M_C\\coloneq ${dcs.map((n) => `${n}\\cdot x_{${n.replace("_", "")}}`).join("+")}=`, "Its moment about the toe", "kip*ft/ft");
      m("M_{c0}\\coloneq V_C\\cdot\\frac{B}{2}-M_C=", "Its moment about the base's center", "kip*ft/ft");
      m("H_0\\coloneq0\\frac{\\mathrm{kip}}{\\mathrm{ft}}");
    }
  }

  // --- stability ------------------------------------------------------------------------------
  /** The linear base pressure p(x) = max(0, p0 + p1·x) from the toe, for V at X (no tension). */
  const pressure = (s: string, V: string, X: string) => {
    m(`e_{${s}}\\coloneq\\frac{B}{2}-${X}=`, "Eccentricity, toward the toe if positive", "ft");
    // Each case on its own line (so each fits the page), then the one that applies.
    m(`p_{0a${s}}\\coloneq\\frac{${V}}{B}\\cdot\\left(1+\\frac{6\\cdot e_{${s}}}{B}\\right)=`, "Pressure at the toe: within the middle third", "ksf");
    m(`p_{0b${s}}\\coloneq\\frac{2\\cdot ${V}}{3\\cdot ${X}}=`, "Outside it, toward the toe", "ksf");
    m(`p_{0c${s}}\\coloneq\\frac{2\\cdot ${V}}{3\\cdot\\left(B-${X}\\right)}\\cdot\\left(1-\\frac{B}{3\\cdot\\left(B-${X}\\right)}\\right)=`, "Outside it, toward the heel", "ksf");
    m(`p_{0${s}}\\coloneq\\operatorname{if}\\left(\\left|e_{${s}}\\right|\\le\\frac{B}{6},p_{0a${s}},\\operatorname{if}\\left(0\\mathrm{ft}<e_{${s}},p_{0b${s}},p_{0c${s}}\\right)\\right)=`, "Pressure at the toe (may be negative where the base lifts)", "ksf");
    m(`p_{1a${s}}\\coloneq-\\frac{12\\cdot ${V}\\cdot e_{${s}}}{B^{3}}=`, "Its slope toward the heel: within the middle third", "ksf/ft");
    m(`p_{1b${s}}\\coloneq-\\frac{p_{0${s}}}{3\\cdot ${X}}=`, "Outside it, toward the toe", "ksf/ft");
    m(`p_{1c${s}}\\coloneq\\frac{2\\cdot ${V}}{9\\cdot\\left(B-${X}\\right)^{2}}=`, "Outside it, toward the heel", "ksf/ft");
    m(`p_{1${s}}\\coloneq\\operatorname{if}\\left(\\left|e_{${s}}\\right|\\le\\frac{B}{6},p_{1a${s}},\\operatorname{if}\\left(0\\mathrm{ft}<e_{${s}},p_{1b${s}},p_{1c${s}}\\right)\\right)=`, "Its slope toward the heel", "ksf/ft");
  };

  text("Stability (service loads)", "subheading", true);
  text(`Method:- The base pressure is trapezoidal while the resultant is within the middle third, and triangular beyond it, with no tension. ${two ? "The surcharge over the heel is counted for bearing only." : ""}`.trim(), "note");
  m(`e_{max}\\coloneq\\frac{B}{${i.asdEccLimit}}=`, i.asdEccLimit === 6 ? "Resultant in the middle third: the whole base in contact" : "Resultant in the middle two-thirds", "ft");
  for (const k of cases) {
    const s = k === 2 ? 1 : 0;
    text(k === 1 ? "Case 1, soil only" : "Case 2, soil and surcharge", "subheading");
    m(`V_{${k}}\\coloneq V_D+EH_V${s ? "+P_{sV}" : ""}=`, "Vertical load", "kip/ft");
    m(`M_{R${k}}\\coloneq M_D+EH_V\\cdot B${s ? "+P_{sV}\\cdot B" : ""}=`, "Resisting moment", "kip*ft/ft");
    m(`H_{${k}}\\coloneq EH_H${s ? "+P_{sH}" : ""}=`, "Sliding thrust", "kip/ft");
    m(`M_{O${k}}\\coloneq EH_H\\cdot\\frac{h}{3}${s ? "+P_{sH}\\cdot\\frac{h}{2}" : ""}=`, "Overturning moment", "kip*ft/ft");
    if (prop) {
      const Vb = s ? "V_{b2}" : `V_{${k}}`;
      const Xb = s ? "X_{b2}" : `X_{${k}}`;
      m(`X_{${k}}\\coloneq\\frac{M_{R${k}}-M_{O${k}}}{V_{${k}}}=`, "Resultant from the toe, without the prop", "ft");
      if (s) {
        m("V_{b2}\\coloneq V_2+q_s\\cdot\\left(T_2+C\\right)=", "With the surcharge over the heel", "kip/ft");
        m("X_{b2}\\coloneq\\frac{M_{R2}+q_s\\cdot\\left(T_2+C\\right)\\cdot\\left(B-\\frac{T_2+C}{2}\\right)-M_{O2}}{V_{b2}}=", undefined, "ft");
      }
      m(`M_{c${k}}\\coloneq ${Vb}\\cdot\\left(\\frac{B}{2}-${Xb}\\right)=`, "Moment about the base's center, toward the toe if positive", "kip*ft/ft");
      if (k === 1 && !i.strutBeforeBackfill) {
        m("M_{c0}\\coloneq M_{c1}=", "Already on when the slab is cast (the backfilled wall)", "kip*ft/ft");
        m("H_0\\coloneq H_1=", undefined, "kip/ft");
      }
      m(`H_{A${k}}\\coloneq H_{${k}}-H_0=`, "Thrust added after the slab is cast", "kip/ft");
      m(`M_{A${k}}\\coloneq M_{c${k}}-M_{c0}=`, "And its moment about the base's center", "kip*ft/ft");
      for (const [j, kh] of [["l", "K_{hl}"], ["h", "K_{hh}"]] as const) {
        m(`P_{${j}${k}}\\coloneq\\max\\left(0\\frac{\\mathrm{kip}}{\\mathrm{ft}},\\frac{\\frac{H_{A${k}}}{${kh}}+\\frac{M_{A${k}}\\cdot y_p}{K_{rot}}}{\\frac{1}{${kh}}+\\frac{y_p^{2}}{K_{rot}}+\\frac{1}{K_{sp}}}\\right)=`, `Prop force, ${j === "l" ? "lower" : "upper"}-bound k_h`, "kip/ft");
      }
      m(`P_{m${k}}\\coloneq\\min\\left(P_{l${k}},P_{h${k}}\\right)=`, "The smaller", "kip/ft");
      m(`FS_{o${k}}\\coloneq\\frac{M_{R${k}}+P_{m${k}}\\cdot y_p}{M_{O${k}}}=`, "Factor of safety against overturning, with the prop");
      m(ok(`FS_{ot}`, `FS_{o${k}}`), "Overturning, IRC R404.4");
      for (const j of ["l", "h"]) {
        m(`X_{${j}${k}}\\coloneq ${Xb}+\\frac{P_{${j}${k}}\\cdot y_p}{${Vb}}=`, `Bearing resultant with the ${j === "l" ? "lower" : "upper"}-bound prop`, "ft");
        pressure(`${j}${k}`, Vb, `X_{${j}${k}}`);
        m(`q_{${j}${k}}\\coloneq\\max\\left(p_{0${j}${k}},p_{0${j}${k}}+p_{1${j}${k}}\\cdot B\\right)=`, undefined, "ksf");
      }
      m(ok(`\\max\\left(\\left|e_{l${k}}\\right|,\\left|e_{h${k}}\\right|\\right)`, "e_{max}"), "Eccentricity");
      m(`q_{max${k}}\\coloneq\\max\\left(q_{l${k}},q_{h${k}}\\right)=`, "Maximum bearing pressure", "ksf");
      m(ok(`q_{max${k}}`, "q_a"), "Bearing");
      m(`R_{f${k}}\\coloneq\\mu\\cdot V_{${k}}=`, "Base friction", "kip/ft");
      m(ok(`FS_{sl}\\cdot\\max\\left(\\left|H_{${k}}-P_{l${k}}\\right|,\\left|H_{${k}}-P_{h${k}}\\right|\\right)`, `R_{f${k}}+P_p`), "Base shear left to the footing, IRC R404.4");
      continue;
    }
    m(`FS_{o${k}}\\coloneq\\frac{M_{R${k}}}{M_{O${k}}}=`, "Factor of safety against overturning");
    m(ok(`FS_{ot}`, `FS_{o${k}}`), "Overturning, IRC R404.4");
    m(`X_{${k}}\\coloneq\\frac{M_{R${k}}-M_{O${k}}}{V_{${k}}}=`, "Resultant from the toe", "ft");
    m(`e_{c${k}}\\coloneq\\frac{B}{2}-X_{${k}}=`, undefined, "ft");
    m(ok(`\\left|e_{c${k}}\\right|`, "e_{max}"), "Eccentricity");
    if (s) {
      m("V_{b2}\\coloneq V_2+q_s\\cdot\\left(T_2+C\\right)=", "With the surcharge over the heel", "kip/ft");
      m("X_{b2}\\coloneq\\frac{M_{R2}+q_s\\cdot\\left(T_2+C\\right)\\cdot\\left(B-\\frac{T_2+C}{2}\\right)-M_{O2}}{V_{b2}}=", undefined, "ft");
      pressure("b2", "V_{b2}", "X_{b2}");
    } else pressure(`b${k}`, `V_{${k}}`, `X_{${k}}`);
    m(`q_{max${k}}\\coloneq\\max\\left(p_{0b${k}},p_{0b${k}}+p_{1b${k}}\\cdot B\\right)=`, "Maximum bearing pressure", "ksf");
    m(ok(`q_{max${k}}`, "q_a"), "Bearing");
    m(`R_{f${k}}\\coloneq\\mu\\cdot V_{${k}}=`, "Base friction", "kip/ft");
    if (!strut) {
      m(`FS_{s${k}}\\coloneq\\frac{R_{f${k}}+P_p}{H_{${k}}}=`, "Factor of safety against sliding");
      m(ok("FS_{sl}", `FS_{s${k}}`), "Sliding, IRC R404.4");
    }
  }

  // --- slab strut -----------------------------------------------------------------------------
  if (strut) {
    text("Sliding with the slab strut", "subheading", true);
    text("Method:- The slab bears against the stem across its full thickness and against the opposite wall, so it carries the thrust in compression. It is much stiffer than the base friction, so it is also checked carrying the whole thrust alone. The slab bears on the subgrade along its length, which braces it against buckling.", "note");
    for (const k of cases) {
      m(`F_{r${k}}\\coloneq\\max\\left(0\\frac{\\mathrm{kip}}{\\mathrm{ft}},FS_{sl}\\cdot H_{${k}}-R_{f${k}}-P_p\\right)=`, `Case ${k}: slab force needed for the factor of safety`, "kip/ft");
      m(ok(`F_{r${k}}`, "P_c"), "Sliding, IRC R404.4");
      m(ok(`FS_{sl}\\cdot H_{${k}}`, "P_c"), `Case ${k}: the slab alone`);
    }
    if (i.strutOpposite && two) {
      text("The opposite wall is the same wall, so their thrusts balance through the slab. With the surcharge on one side only, the difference is resisted by the friction under both footings.", "note");
      m("\\Delta_H\\coloneq H_2-H_1=", "Unbalanced thrust", "kip/ft");
      m("FS_u\\coloneq\\frac{2\\cdot R_{f1}}{\\Delta_H}=", "Factor of safety, both footings");
      m(ok("FS_{sl}", "FS_u"), "Sliding of the pair");
    }
    text("Stiffness", "subheading");
    m(`H_{mx}\\coloneq ${two ? "\\max\\left(H_1,H_2\\right)" : "H_1"}=`, undefined, "kip/ft");
    m("\\Delta_s\\coloneq\\frac{H_{mx}}{k_s}=", "Shortening with the whole thrust in the slab", "in");
    m(`\\Delta_{all}\\coloneq ${num(i.strutMoveLimit)}\\mathrm{in}`, "Base movement allowed");
    m(ok("\\Delta_s", "\\Delta_{all}"), "Stiffness");
  }

  // --- members --------------------------------------------------------------------------------
  const flexure = (k: string, name: string, o: { Mu: string; h: string; cover: number; bars: Bars; crack: boolean; footing: boolean; Vu?: string }) => {
    const bar = BARS[o.bars.bar];
    m(`c_{${k}}\\coloneq ${num(o.cover)}\\mathrm{in}`, `${name}: clear cover`);
    m(`d_{b${k}}\\coloneq ${num(bar.dia)}\\mathrm{in}`, `#${o.bars.bar} bars`);
    m(`s_{${k}}\\coloneq ${num(o.bars.spacing)}\\mathrm{in}`, "Spacing");
    m(`h_{${k}}\\coloneq ${o.h}=`, "Section depth", "in");
    m(`d_{${k}}\\coloneq h_{${k}}-c_{${k}}-\\frac{d_{b${k}}}{2}=`, "Effective depth", "in");
    m(`A_{s${k}}\\coloneq\\frac{${num(bar.area)}\\mathrm{in}^{2}}{s_{${k}}}=`, "Steel per foot of wall", "in^2/ft");
    m(`a_{${k}}\\coloneq\\frac{A_{s${k}}\\cdot f_y}{0.85\\cdot f'_{c}}=`, "Stress block depth", "in");
    m(`\\varepsilon_{t${k}}\\coloneq0.003\\cdot\\frac{d_{${k}}-\\frac{a_{${k}}}{\\beta_1}}{\\frac{a_{${k}}}{\\beta_1}}=`, "Net tensile strain");
    m(`\\phi_{${k}}\\coloneq\\operatorname{if}\\left(\\varepsilon_{ty}+0.003\\le\\varepsilon_{t${k}},0.9,\\operatorname{if}\\left(\\varepsilon_{t${k}}\\le\\varepsilon_{ty},0.65,0.65+0.25\\cdot\\frac{\\varepsilon_{t${k}}-\\varepsilon_{ty}}{0.003}\\right)\\right)=`, "ACI 318-19 Table 21.2.2");
    m(`M_{u${k}}\\coloneq ${o.Mu}=`, "Factored moment", "kip*ft/ft");
    m(`M_{r${k}}\\coloneq\\phi_{${k}}\\cdot A_{s${k}}\\cdot f_y\\cdot\\left(d_{${k}}-\\frac{a_{${k}}}{2}\\right)=`, "ACI 318-19 22.3", "kip*ft/ft");
    m(ok(`M_{u${k}}`, `M_{r${k}}`), "Flexure");
    m(`A_{m${k}}\\coloneq\\max\\left(0.0018\\cdot\\frac{60\\mathrm{ksi}}{f_y},0.0014\\right)\\cdot h_{${k}}=`, "Minimum steel, ACI 318-19 7.6.1.1", "in^2/ft");
    m(ok(`A_{m${k}}`, `A_{s${k}}`), "Minimum reinforcement");
    if (o.crack) {
      m(`r_{f${k}}\\coloneq\\frac{40\\mathrm{ksi}}{\\frac{2}{3}\\cdot f_y}=`, "40 ksi over fs = 2/3 fy, ACI 318-19 Table 24.3.2");
      m(`s_{x${k}}\\coloneq\\min\\left(15\\cdot r_{f${k}}\\cdot\\mathrm{in}-2.5\\cdot c_{${k}},12\\cdot r_{f${k}}\\cdot\\mathrm{in},3\\cdot h_{${k}},18\\mathrm{in}\\right)=`, "Spacing, ACI 318-19 24.3.2 and 7.7.2.3", "in");
    } else m(`s_{x${k}}\\coloneq\\min\\left(3\\cdot h_{${k}},18\\mathrm{in}\\right)=`, "Spacing, ACI 318-19 7.7.2.3", "in");
    m(ok(`s_{${k}}`, `s_{x${k}}`), "Bar spacing");
    if (o.Vu) {
      m(`V_{u${k}}\\coloneq ${o.Vu}=`, "Factored shear", "kip/ft");
      m(`\\rho_{w${k}}\\coloneq\\frac{A_{s${k}}}{d_{${k}}}=`);
      m(o.footing ? `\\lambda_{s${k}}\\coloneq1` : `\\lambda_{s${k}}\\coloneq\\min\\left(1,\\sqrt{\\frac{2}{1+\\frac{d_{${k}}}{10\\mathrm{in}}}}\\right)=`, o.footing ? "Size effect neglected for a footing, ACI 318-19 13.2.6.2" : "Size effect, ACI 318-19 Eq. 22.5.5.1.3");
      m(`V_{r${k}}\\coloneq0.75\\cdot\\min\\left(8\\cdot\\lambda_{s${k}}\\cdot\\rho_{w${k}}^{\\frac{1}{3}},5\\right)\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{psi}}}\\cdot\\mathrm{psi}\\cdot d_{${k}}=`, "No stirrups, ACI 318-19 Table 22.5.5.1(c), φ = 0.75", "kip/ft");
      m(ok(`V_{u${k}}`, `V_{r${k}}`), "Shear");
    }
  };

  text("Members (ACI 318-19 strength design)", "heading", true);
  const sur = two;
  text("Stem (at its base)", "subheading");
  text("The stem is designed as a one-way slab (ACI 318-19 13.3.6.1).", "note");
  m("h_{ss}\\coloneq h_s-t=", undefined, "ft");
  m("EH_s\\coloneq\\cos\\left(\\delta\\right)\\cdot\\frac{1}{2}\\cdot EFW_a\\cdot h_{ss}^{2}=", "Earth force on the stem, horizontal", "kip/ft");
  if (sur) m("S_s\\coloneq\\cos\\left(\\delta\\right)\\cdot\\frac{EFW_a}{\\gamma_s}\\cdot q_s\\cdot h_{ss}=", "Surcharge on the stem, horizontal", "kip/ft");
  const last = cases[cases.length - 1];
  if (propStem) {
    text("With the prop:- The slab's force at service loads (the smaller bound, which understates its relief) acts on the stem at the slab. The stem is also checked at the slab, under the soil above it.", "note");
    m("y_{ps}\\coloneq y_p-D=", "Prop above the top of the footing", "ft");
    m("a_p\\coloneq h_{ss}-y_{ps}=", "Soil above the prop", "ft");
    m(`M_{sb}\\coloneq\\gamma_H\\cdot\\left(EH_s\\cdot\\frac{h_{ss}}{3}${sur ? "+S_s\\cdot\\frac{h_{ss}}{2}" : ""}\\right)-P_{m${last}}\\cdot y_{ps}=`, "At the base", "kip*ft/ft");
    m(`M_{sp}\\coloneq\\gamma_H\\cdot\\cos\\left(\\delta\\right)\\cdot\\left(EFW_a\\cdot\\frac{a_p^{3}}{6}${sur ? "+\\frac{EFW_a}{\\gamma_s}\\cdot q_s\\cdot\\frac{a_p^{2}}{2}" : ""}\\right)=`, "At the prop", "kip*ft/ft");
    m(`V_{sb}\\coloneq\\gamma_H\\cdot\\left(EH_s${sur ? "+S_s" : ""}\\right)-P_{m${last}}=`, "At the base", "kip/ft");
    m(`V_{sp}\\coloneq\\gamma_H\\cdot\\cos\\left(\\delta\\right)\\cdot\\left(EFW_a\\cdot\\frac{a_p^{2}}{2}${sur ? "+\\frac{EFW_a}{\\gamma_s}\\cdot q_s\\cdot a_p" : ""}\\right)=`, "At the prop", "kip/ft");
  }
  flexure("st", "Stem", {
    Mu: propStem ? "\\max\\left(M_{sb},M_{sp}\\right)" : `\\gamma_H\\cdot\\left(EH_s\\cdot\\frac{h_{ss}}{3}${sur ? "+S_s\\cdot\\frac{h_{ss}}{2}" : ""}\\right)`,
    Vu: propStem ? "\\max\\left(\\left|V_{sb}\\right|,V_{sp}\\right)" : `\\gamma_H\\cdot\\left(EH_s${sur ? "+S_s" : ""}\\right)`,
    h: "T_b",
    cover: i.coverStem,
    bars: i.stemBars,
    crack: true,
    footing: false,
  });

  text("Toe (at the stem's front face)", "subheading");
  text("Method:- The factored base pressure, for both load factors on the dead load, with the toe's own weight conservatively neglected.", "note");
  if (prop) text("With the prop:- Its service-load force (the smaller bound) is included at the slab, which understates its relief.", "note");
  for (const [s, g] of [["u1", "\\gamma_D"], ["u2", "0.9"]] as const) {
    m(`V_{${s}}\\coloneq ${g}\\cdot V_D+\\gamma_H\\cdot\\left(EH_V${sur ? "+P_{sV}" : ""}\\right)=`, `${g === "0.9" ? "0.9" : num(i.asdGammaD)}D + ${num(i.asdGammaH)}H`, "kip/ft");
    m(`X_{${s}}\\coloneq\\frac{${g}\\cdot M_D+\\gamma_H\\cdot\\left(EH_V${sur ? "+P_{sV}" : ""}\\right)\\cdot B-\\gamma_H\\cdot M_{O${last}}${prop ? `+P_{m${last}}\\cdot y_p` : ""}}{V_{${s}}}=`, "Resultant from the toe", "ft");
    pressure(s, `V_{${s}}`, `X_{${s}}`);
    m(`x_{s${s}}\\coloneq\\operatorname{if}\\left(0\\mathrm{ksf}\\le p_{0${s}},0\\mathrm{ft},\\min\\left(A,-\\frac{p_{0${s}}}{p_{1${s}}}\\right)\\right)=`, "Where the pressure under the toe starts", "ft");
    m(`x_{e${s}}\\coloneq\\operatorname{if}\\left(0\\mathrm{ksf}\\le p_{0${s}}+p_{1${s}}\\cdot A,A,\\max\\left(0\\mathrm{ft},-\\frac{p_{0${s}}}{p_{1${s}}}\\right)\\right)=`, "And where it ends", "ft");
    m(`p_{s${s}}\\coloneq\\max\\left(0\\mathrm{ksf},p_{0${s}}+p_{1${s}}\\cdot x_{s${s}}\\right)=`, undefined, "ksf");
    m(`p_{e${s}}\\coloneq\\max\\left(0\\mathrm{ksf},p_{0${s}}+p_{1${s}}\\cdot x_{e${s}}\\right)=`, undefined, "ksf");
    m(`F_{t${s}}\\coloneq\\frac{p_{s${s}}+p_{e${s}}}{2}\\cdot\\left(x_{e${s}}-x_{s${s}}\\right)=`, "Upward force on the toe", "kip/ft");
    m(`G_{s${s}}\\coloneq p_{s${s}}\\cdot\\left(3\\cdot A-2\\cdot x_{s${s}}-x_{e${s}}\\right)=`, "The trapezoid's two parts");
    m(`G_{e${s}}\\coloneq p_{e${s}}\\cdot\\left(3\\cdot A-x_{s${s}}-2\\cdot x_{e${s}}\\right)=`);
    m(`M_{t${s}}\\coloneq\\frac{x_{e${s}}-x_{s${s}}}{6}\\cdot\\left(G_{s${s}}+G_{e${s}}\\right)=`, "Its moment at the stem's face", "kip*ft/ft");
  }
  flexure("to", "Toe", {
    Mu: "\\max\\left(M_{tu1},M_{tu2}\\right)",
    Vu: "\\operatorname{if}\\left(M_{tu2}\\le M_{tu1},F_{tu1},F_{tu2}\\right)",
    h: "D",
    cover: i.coverToe,
    bars: i.toeBars,
    crack: false,
    footing: true,
  });

  text("Heel (at the stem's back face)", "subheading");
  text("Its weight, the soil on it" + (sur ? " and the surcharge" : "") + "; the bearing pressure under the heel is conservatively neglected.", "note");
  m(`w_h\\coloneq\\gamma_D\\cdot\\left(\\gamma_c\\cdot C\\cdot D+\\gamma_s\\cdot h_s\\cdot C\\right)${sur ? "+\\gamma_H\\cdot q_s\\cdot C" : ""}=`, "Factored load on the heel", "kip/ft");
  flexure("he", "Heel", { Mu: "w_h\\cdot\\frac{C}{2}", Vu: "w_h", h: "D", cover: i.coverHeel, bars: i.heelBars, crack: false, footing: true });

  text("Shrinkage and temperature steel", "subheading");
  text("The horizontal bars at both faces together, ACI 318-19 24.4.3.2.", "note");
  for (const [k, name, bars, h] of [["ts", "Stem", i.stemTemp, "T_b"], ["tf", "Footing", i.toeTemp, "D"]] as const) {
    m(`A_{${k}}\\coloneq\\frac{2\\cdot${num(BARS[bars.bar].area)}\\mathrm{in}^{2}}{${num(bars.spacing)}\\mathrm{in}}=`, `${name}: #${bars.bar} at ${num(bars.spacing)} in, each face`, "in^2/ft");
    m(`A_{r${k}}\\coloneq\\max\\left(0.0018\\cdot\\frac{60\\mathrm{ksi}}{f_y},0.0014\\right)\\cdot ${h}=`, undefined, "in^2/ft");
    m(ok(`A_{r${k}}`, `A_{${k}}`), name);
  }

  if (strut) {
    text("Required construction notes", "subheading", true);
    text("1. Cast the landing slab tight against both wall stems, with no compressible joint material between them, and do not backfill until the slab has reached 75 percent of its specified strength.");
    text("2. Keep the slab continuous between the walls, without openings or joints across the line of thrust.");
    text("3. Provide free-draining backfill and a perforated drain at the base of the wall with an outlet, so that no water pressure builds up behind it.");
    if (prop) {
      if (i.strutBeforeBackfill) text("4. The slab props the walls against overturning: cast the landing slab before backfilling behind either wall, and backfill both walls together, in lifts.");
      text(`${i.strutBeforeBackfill ? 5 : 4}. The footing is sized with the slab in place. Do not cut, core or remove the slab between the walls.`);
    }
  }
  lines.push(...checksSummary([{ checks: designCipAsd(i, designCipWall(i)).checks }]));
  return lines;
}

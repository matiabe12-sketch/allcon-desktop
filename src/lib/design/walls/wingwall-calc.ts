import type { Line } from "@/lib/calcs/library/templates";
import { checksSummary } from "../checks-summary";
import { designWingwall } from "./wingwall";
import { COLOR_NOTE, INPUT_COLOR, isInput, num } from "../calc-style";
import type { Figure } from "../figures";
import { BARS } from "./cip";
import type { WingwallInputs } from "./wingwall";

// A cantilever wingwall as a Calcs worksheet: inputs as definitions and every step as live math
// with its AASHTO reference, worked out by Calcs independently of the design engine (which supplies
// only the factors read from tables: the hook's bend, the top bar and coating factors).

const ok = (demand: string, capacity: string) => `\\operatorname{if}\\left(${demand}\\le ${capacity},\\text{OK},\\text{NG}\\right)=`;

export function wingwallCalcLines(i: WingwallInputs, title: string, figures?: { section?: Figure }): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note") => lines.push({ text: t, ...(style ? { style } : {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}), ...(math.length > 110 && ref ? { wide: true } : {}), ...(isInput(math) ? { color: INPUT_COLOR } : {}) });
  const bar = BARS[i.bars.bar];

  text(title.toUpperCase(), "heading");
  text("Wingwall cantilevered off an abutment, AASHTO LRFD. Earth pressure and live load surcharge act on the retained face down to a line from the wall's height at the abutment to the end height at its tip; the buried part below that line is neglected.");
  text(COLOR_NOTE, "note");

  text("Geometry and soil", "subheading");
  m(`H\\coloneq ${num(i.H)}\\mathrm{ft}`, "Height at the abutment face");
  m(`h\\coloneq ${num(i.h)}\\mathrm{ft}`, "Pressure depth at the tip");
  m(`L\\coloneq ${num(i.L)}\\mathrm{ft}`, "Length from the abutment face");
  m(`t\\coloneq ${num(i.t)}\\mathrm{in}`, "Thickness");
  m(`A\\coloneq ${num(i.A)}\\mathrm{ft}`, "Abutment width");
  m(`\\theta\\coloneq ${num(i.skew)}\\mathrm{deg}`, "Skew");
  if (figures?.section) lines.push({ region: figures.section });
  m(`\\gamma_s\\coloneq ${num(i.gammaS)}\\mathrm{kcf}`, "Backfill unit weight");
  if (i.atRest) {
    m(`\\phi\\coloneq ${num(i.phi)}\\mathrm{deg}`, "Backfill friction angle");
    m("k\\coloneq1-\\sin\\left(\\phi\\right)=", "At rest, AASHTO Eq. 3.11.5.2-1");
  } else m(`k\\coloneq ${num(i.k)}`, "Lateral earth pressure coefficient");
  m("W\\coloneq k\\cdot\\gamma_s=", "Equivalent fluid weight", "pcf");
  m(`S\\coloneq ${num(i.heq)}\\mathrm{ft}`, "Live load surcharge height, AASHTO 3.11.6.4");
  m(`\\gamma_c\\coloneq ${num(i.gammaC)}\\mathrm{kcf}`);
  m(`\\gamma_{DC}\\coloneq ${num(i.gDC)}`, "AASHTO T. 3.4.1-2");
  m(`\\gamma_{EH}\\coloneq ${num(i.gEH)}`, i.atRest ? "At rest, AASHTO T. 3.4.1-2" : "AASHTO T. 3.4.1-2");
  m(`\\gamma_{LS}\\coloneq ${num(i.gLS)}`, "AASHTO T. 3.4.1-1");

  text("Earth pressure resultants (pressure W (z + S) over the loaded face)", "subheading");
  text("Thrust P, its moment about the abutment face (axis A) and about the top of the wall (axis C); earth pressure alone with S = 0, the surcharge as the rest.", "note");
  const P = (S: string) => `\\frac{W\\cdot L}{6}\\cdot\\left(H^{2}+\\left(h+H\\right)\\cdot\\left(h+3\\cdot ${S}\\right)\\right)`;
  const MA = (S: string) => `\\frac{W\\cdot L^{2}}{24}\\cdot\\left(3\\cdot h^{2}+\\left(H+4\\cdot ${S}\\right)\\cdot\\left(H+2\\cdot h\\right)\\right)`;
  const MC = (S: string) => `\\frac{W\\cdot L}{12}\\cdot\\left(2\\cdot ${S}\\cdot h\\cdot H+\\left(H^{2}+h^{2}\\right)\\cdot\\left(H+h+2\\cdot ${S}\\right)\\right)`;
  m(`P_{EH}\\coloneq ${P("0\\mathrm{ft}")}=`, undefined, "kip");
  m(`P_{s}\\coloneq ${P("S")}=`, "Service", "kip");
  m(`M_{AEH}\\coloneq ${MA("0\\mathrm{ft}")}=`, undefined, "kip*ft");
  m(`M_{As}\\coloneq ${MA("S")}=`, "Service", "kip*ft");
  m(`M_{CEH}\\coloneq ${MC("0\\mathrm{ft}")}=`, undefined, "kip*ft");
  m(`M_{Cs}\\coloneq ${MC("S")}=`, "Service", "kip*ft");
  m("P_u\\coloneq\\gamma_{EH}\\cdot P_{EH}+\\gamma_{LS}\\cdot\\left(P_s-P_{EH}\\right)=", "Strength I", "kip");
  m("M_{Au}\\coloneq\\gamma_{EH}\\cdot M_{AEH}+\\gamma_{LS}\\cdot\\left(M_{As}-M_{AEH}\\right)=", undefined, "kip*ft");
  m("M_{Cu}\\coloneq\\gamma_{EH}\\cdot M_{CEH}+\\gamma_{LS}\\cdot\\left(M_{Cs}-M_{CEH}\\right)=", undefined, "kip*ft");
  m("x_s\\coloneq\\frac{M_{As}}{P_s}=", "Thrust from the abutment face, service", "ft");
  m("y_s\\coloneq\\frac{M_{Cs}}{P_s}=", "From the top of the wall", "ft");
  m("x_u\\coloneq\\frac{M_{Au}}{P_u}=", "Strength", "ft");
  m("y_u\\coloneq\\frac{M_{Cu}}{P_u}=", undefined, "ft");

  text("Self weight", "subheading");
  m("V_{ws}\\coloneq t\\cdot H\\cdot L\\cdot\\gamma_c=", undefined, "kip");
  m("V_{wu}\\coloneq\\gamma_{DC}\\cdot V_{ws}=", undefined, "kip");
  m("M_{wu}\\coloneq V_{wu}\\cdot\\frac{L}{2}=", "Vertical bending at the abutment face", "kip*ft");

  text("Section A: horizontal bars on the retained face, per foot of height", "subheading");
  m("M_u\\coloneq\\frac{M_{Au}}{H}=", undefined, "kip*ft/ft");
  m("M_s\\coloneq\\frac{M_{As}}{H}=", undefined, "kip*ft/ft");
  m(`f'_{c}\\coloneq ${num(i.fc)}\\mathrm{ksi}`);
  m(`f_y\\coloneq ${num(i.fy)}\\mathrm{ksi}`);
  m("E_c\\coloneq120000\\cdot0.15^{2}\\cdot\\left(\\frac{f'_{c}}{\\mathrm{ksi}}\\right)^{0.33}\\cdot\\mathrm{ksi}=", "AASHTO Eq. 5.4.2.4-1", "ksi");
  m("n\\coloneq\\frac{29000\\mathrm{ksi}}{E_c}=");
  m(`c_c\\coloneq ${num(i.cover)}\\mathrm{in}`, "Cover");
  m(`d_b\\coloneq ${num(bar.dia)}\\mathrm{in}`, `#${i.bars.bar} bars`);
  m(`s\\coloneq ${num(i.bars.spacing)}\\mathrm{in}`, "Spacing");
  m("d_e\\coloneq t-c_c-\\frac{d_b}{2}=", "Effective depth", "in");
  m(`A_s\\coloneq\\frac{${num(bar.area)}\\mathrm{in}^{2}}{s}=`, "Steel per foot of height", "in^2/ft");
  m("\\beta_1\\coloneq\\max\\left(0.65,\\min\\left(0.85,0.85-0.05\\cdot\\frac{f'_{c}-4\\mathrm{ksi}}{\\mathrm{ksi}}\\right)\\right)=", "AASHTO 5.6.2.2");
  m("a\\coloneq\\frac{A_s\\cdot f_y}{0.85\\cdot f'_{c}}=", "Stress block depth", "in");
  m("M_r\\coloneq0.9\\cdot A_s\\cdot f_y\\cdot\\left(d_e-\\frac{a}{2}\\right)=", "AASHTO 5.6.3.2", "kip*ft/ft");
  m(ok("M_u", "M_r"), "Flexure");
  m("f_r\\coloneq0.24\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}=", "AASHTO 5.4.2.6");
  m("M_{cr}\\coloneq0.67\\cdot1.6\\cdot f_r\\cdot\\frac{t^{2}}{6}=", "AASHTO Eq. 5.6.3.3-1", "kip*ft/ft");
  m(ok("\\min\\left(1.33\\cdot M_u,M_{cr}\\right)", "M_r"), "Minimum reinforcement, AASHTO 5.6.3.3");
  m("\\rho\\coloneq\\frac{A_s}{d_e}=");
  m("k_c\\coloneq\\sqrt{2\\cdot\\rho\\cdot n+\\left(\\rho\\cdot n\\right)^{2}}-\\rho\\cdot n=");
  m("f_{ss}\\coloneq\\frac{M_s}{A_s\\cdot\\left(1-\\frac{k_c}{3}\\right)\\cdot d_e}=", "Service steel stress", "ksi");
  m("d_c\\coloneq c_c+\\frac{d_b}{2}=", undefined, "in");
  m("\\beta_s\\coloneq1+\\frac{d_c}{0.7\\cdot\\left(t-d_c\\right)}=");
  m(`s_{max}\\coloneq\\frac{700\\cdot${i.exposure === 1 ? "1.00" : "0.75"}\\cdot\\frac{\\mathrm{kip}}{\\mathrm{in}}}{\\beta_s\\cdot f_{ss}}-2\\cdot d_c=`, `Crack control, AASHTO Eq. 5.6.7-1 (Class ${i.exposure})`, "in");
  m(ok("s", "s_{max}"), "Bar spacing");
  m("V_u\\coloneq\\frac{P_u}{H}=", "Shear at the abutment face", "kip/ft");
  m("d_v\\coloneq\\max\\left(d_e-\\frac{a}{2},0.9\\cdot d_e,0.72\\cdot t\\right)=", "AASHTO 5.7.2.8", "in");
  m("V_r\\coloneq0.9\\cdot0.0316\\cdot2\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}\\cdot d_v=", "AASHTO 5.7.3.3 (β = 2)", "kip/ft");
  m(ok("V_u", "V_r"), "Shear");
  // The horizontal bars into the abutment (AASHTO 5.10.8.2.1 and 5.10.8.2.4), as the engine develops them.
  const r = designWingwall(i);
  const { hook, straight } = r.anchorage;
  const coated = r.anchorage.coating === "epoxy";
  const { front, vert } = r.temperature;
  const fb = BARS[front.bar];
  const vb = BARS[vert.bar];
  text("Horizontal bars into the abutment", "subheading");
  text(`Both faces' horizontal bars run along the wall through the abutment to its far face, less the cover. The retained face's bars end in a standard 90° hook; the front face's run straight. The bars are ${coated ? "epoxy coated" : "uncoated"}. Each develops its full yield, and the top bars have more than 12 in of fresh concrete cast below them.`, "note");
  m("A'\\coloneq\\frac{A}{\\cos\\left(\\theta\\right)}=", "Abutment width along the wall", "ft");
  m("\l_{av}\\coloneq A'-c_c=", "Length available in the abutment", "in");
  m(`A_b\\coloneq ${num(bar.area)}\\mathrm{in}^{2}`, `#${i.bars.bar} bar area`);
  m(`r_h\\coloneq\\frac{${num(r.anchorage.hookInside / bar.dia)}\\cdot d_b+d_b}{2}=`, "Bend radius to the bar's center, AASHTO 5.10.2.3", "in");
  m("\\nu\\coloneq\\max\\left(0.45,\\min\\left(0.65,0.85-\\frac{f'_{c}}{20\\mathrm{ksi}}\\right)\\right)=", "AASHTO T. 5.8.2.5.3a-1");
  m("F_h\\coloneq d_b\\cdot r_h\\cdot\\nu\\cdot f'_{c}=", "Force the bend takes, AASHTO Eq. 5.10.8.2.4a-2", "kip");
  m("f_h\\coloneq f_y-\\frac{F_h}{A_b}=", "Stress left to develop", "ksi");
  m("\l_{db}\\coloneq0.17\\cdot d_b\\cdot\\left(\\frac{f_h}{1.97\\cdot\\left(\\frac{f'_{c}}{\\mathrm{ksi}}\\right)^{0.25}\\cdot\\mathrm{ksi}}\\right)^{2}=", "AASHTO Eq. 5.10.8.2.1a-2", "in");
  m(`\\lambda_{rl}\\coloneq ${num(hook.location)}`, hook.location > 1 ? "Top bars, AASHTO 5.10.8.2.1b" : "AASHTO 5.10.8.2.1b");
  m(`\\lambda_{cf}\\coloneq ${num(hook.coatingFactor)}`, coated ? "Epoxy-coated hook, AASHTO 5.10.8.2.1b" : "Uncoated, AASHTO 5.10.8.2.1b");
  m("c_b\\coloneq\\min\\left(c_c+\\frac{d_b}{2},\\frac{s}{2}\\right)=", "AASHTO 5.10.8.2.1c", "in");
  m("\\lambda_{rc}\\coloneq\\max\\left(0.3,\\min\\left(1,\\frac{d_b}{c_b}\\right)\\right)=", "No transverse bars counted, AASHTO 5.10.8.2.1c");
  m("\l_{dm}\\coloneq\l_{db}\\cdot\\min\\left(1.7,\\lambda_{rl}\\cdot\\lambda_{cf}\\right)\\cdot\\lambda_{rc}=", undefined, "in");
  m("\l_{dh}\\coloneq\\max\\left(8\\cdot d_b,6\\mathrm{in},\l_{dm}+r_h+\\frac{d_b}{2}\\right)=", "Hooked development, AASHTO 5.10.8.2.4", "in");
  m(ok("\l_{dh}", "\l_{av}"), "Retained face, hooked");
  m(`d_{bf}\\coloneq ${num(fb.dia)}\\mathrm{in}`, `#${front.bar} bars, front face`);
  m(`s_f\\coloneq ${num(front.spacing)}\\mathrm{in}`, "Spacing");
  m("\l_{dbf}\\coloneq0.17\\cdot d_{bf}\\cdot\\left(\\frac{f_y}{1.97\\cdot\\left(\\frac{f'_{c}}{\\mathrm{ksi}}\\right)^{0.25}\\cdot\\mathrm{ksi}}\\right)^{2}=", "AASHTO Eq. 5.10.8.2.1a-2", "in");
  m(`\\lambda_{cff}\\coloneq ${num(straight.coatingFactor)}`, coated ? (straight.coatingFactor < 1.5 ? "Epoxy coated, cover at least 3 db and clear spacing at least 6 db" : "Epoxy coated, AASHTO 5.10.8.2.1b") : "Uncoated, AASHTO 5.10.8.2.1b");
  m("c_{bf}\\coloneq\\min\\left(c_c+\\frac{d_{bf}}{2},\\frac{s_f}{2}\\right)=", undefined, "in");
  m("\\lambda_{rcf}\\coloneq\\max\\left(0.3,\\min\\left(1,\\frac{d_{bf}}{c_{bf}}\\right)\\right)=");
  m("\l_{df}\\coloneq\\max\\left(12\\mathrm{in},\l_{dbf}\\cdot\\min\\left(1.7,\\lambda_{rl}\\cdot\\lambda_{cff}\\right)\\cdot\\lambda_{rcf}\\right)=", "Straight development, AASHTO 5.10.8.2.1", "in");
  m(ok("\l_{df}", "\l_{av}"), "Front face, straight");

  // Shrinkage and temperature steel, each face each way (AASHTO 5.10.6), as the engine checks it.
  text("Shrinkage and temperature steel, each face each way", "subheading");
  text("The front face's horizontal bars and the vertical bars on each face carry no design moment; they are sized as shrinkage and temperature steel.", "note");
  m(`b_T\\coloneq ${num(r.temperature.bT / 12)}\\mathrm{ft}`, "The wall's least width along the bars (its height at the tip)");
  m("A_{st}\\coloneq\\max\\left(0.11\\frac{\\mathrm{in}^{2}}{\\mathrm{ft}},\\min\\left(0.60\\frac{\\mathrm{in}^{2}}{\\mathrm{ft}},\\frac{1.30\\cdot b_T\\cdot t}{2\\cdot\\left(b_T+t\\right)\\cdot f_y}\\cdot\\frac{\\mathrm{kip}}{\\mathrm{in}\\cdot\\mathrm{ft}}\\right)\\right)=", "Shrinkage and temperature steel, AASHTO Eqs. 5.10.6-1 and -2", "in^2/ft");
  m(`A_{sf}\\coloneq\\frac{${num(fb.area)}\\mathrm{in}^{2}}{s_f}=`, `#${front.bar} @ ${front.spacing} in, horizontal, front face`, "in^2/ft");
  m(`s_v\\coloneq ${num(vert.spacing)}\\mathrm{in}`, "The vertical bars' spacing");
  m(`A_{sv}\\coloneq\\frac{${num(vb.area)}\\mathrm{in}^{2}}{s_v}=`, `#${vert.bar} @ ${vert.spacing} in, vertical, each face`, "in^2/ft");
  m(ok("A_{st}", "A_s"), "Horizontal, retained face");
  m(ok("A_{st}", "A_{sf}"), "Horizontal, front face");
  m(ok("A_{st}", "A_{sv}"), "Vertical, each face");
  m(ok("\\max\\left(s,s_f,s_v\\right)", `${i.t > 18 ? 12 : Math.min(3 * i.t, 18)}\\mathrm{in}`), `Spacing, AASHTO 5.10.6 (${i.t > 18 ? "over 18 in thick: 12 in" : "3t and 18 in"})`);

  // The wall's own weight, carried in its plane (the engine's in-plane check).
  text("Self weight carried in the wall's plane", "subheading");
  text("The wall is a cantilever beam off the abutment as deep as its height, its top in tension at the abutment face. Its tension steel is the horizontal bars in the top quarter of the wall, their centroid H/8 below the top: the front face's at their full area and the retained face's at the share the earth pressure moment leaves them.", "note");
  m("A_{sw}\\coloneq\\frac{H}{4}\\cdot\\left(A_{sf}+A_s\\cdot\\max\\left(0,1-\\frac{M_u}{M_r}\\right)\\right)=", "Tension steel", "in^2");
  m("d_w\\coloneq\\frac{7}{8}\\cdot H=", "Depth to its centroid", "in");
  m("a_w\\coloneq\\frac{A_{sw}\\cdot f_y}{0.85\\cdot f'_{c}\\cdot t}=", undefined, "in");
  m("M_{rw}\\coloneq0.9\\cdot A_{sw}\\cdot f_y\\cdot\\left(d_w-\\frac{a_w}{2}\\right)=", "AASHTO 5.6.3.2", "kip*ft");
  m(ok("M_{wu}", "M_{rw}"), "Flexure");
  m("d_{vw}\\coloneq\\max\\left(d_w-\\frac{a_w}{2},0.9\\cdot d_w,0.72\\cdot H\\right)=", "AASHTO 5.7.2.8", "in");
  m("V_{rw}\\coloneq0.9\\cdot0.0316\\cdot2\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}\\cdot t\\cdot d_{vw}=", "AASHTO 5.7.3.3 (β = 2)", "kip");
  m(ok("V_{wu}", "V_{rw}"), "Shear");

  // The connection to the abutment (the engine's conn- checks).
  const cn = r.connection;
  const ab = BARS[cn.abutBars.bar];
  text("The connection to the abutment", "subheading");
  text("The wingwall's root moment turns the corner: the tension in its retained face carries on into the abutment's back face. Corner bars, L-bars round the inside corner, take it there over the abutment's thickness, per foot of height; the abutment's own horizontal bars are not counted. One leg runs along the abutment past the wingwall's inside face by its development length, the other laps the retained face's bars in the wingwall by a Class B splice. The vertical joint carries the earth's thrust and the wall's weight together by shear friction; only the front face's bars clamp it, the retained face's being in flexural tension.", "note");
  m(`h_{ab}\\coloneq ${num(cn.hAb)}\\mathrm{in}`, "The abutment's thickness");
  m(`s_{ab}\\coloneq ${num(cn.abutBars.spacing)}\\mathrm{in}`, `#${cn.abutBars.bar} corner bars along the abutment's back face`);
  m(`d_{ab}\\coloneq h_{ab}-c_c-\\frac{${num(ab.dia)}\\mathrm{in}}{2}=`, "Effective depth", "in");
  m(`A_{ab}\\coloneq\\frac{${num(ab.area)}\\mathrm{in}^{2}}{s_{ab}}=`, "Steel per foot", "in^2/ft");
  m("a_{ab}\\coloneq\\frac{A_{ab}\\cdot f_y}{0.85\\cdot f'_{c}}=", undefined, "in");
  m("M_{rab}\\coloneq0.9\\cdot A_{ab}\\cdot f_y\\cdot\\left(d_{ab}-\\frac{a_{ab}}{2}\\right)=", "AASHTO 5.6.3.2", "kip*ft/ft");
  m(ok("M_u", "M_{rab}"), "The wingwall's moment round the corner");
  m(`f_{sab}\\coloneq ${num(cn.flex.fss, 3)}\\mathrm{ksi}`, "Service I steel stress under M_s, cracked section");
  m(`s_{mab}\\coloneq ${num(cn.flex.sMax, 3)}\\mathrm{in}`, "Crack control, AASHTO Eq. 5.6.7-1");
  m(ok("s_{ab}", "s_{mab}"), "Spacing");
  m(`\l_{dab}\\coloneq ${num(cn.dev.required, 3)}\\mathrm{in}`, `Straight development, AASHTO 5.10.8.2.1 (${coated ? "epoxy coated" : "uncoated"}, top bars)`);
  m(`\l_{lap}\\coloneq ${num(cn.lap, 3)}\\mathrm{in}`, "Class B lap with the retained face's bars, 1.3 ℓd of the larger bar, AASHTO 5.10.8.4.3a");
  text(`The legs:- along the abutment, ${cn.legAb} in past the wingwall's inside face (ℓd and the cover); into the wingwall, ${cn.legWing} in from the abutment's front face (through the abutment along the skew, then the lap).`, "note");
  text(cn.joint === "monolithic" ? "The joint is cast monolithically: c = 0.40 ksi, μ = 1.4, K1 = 0.25, K2 = 1.5 ksi (AASHTO 5.7.4.4)." : "A construction joint roughened to 0.25 in: c = 0.24 ksi, μ = 1.0, K1 = 0.25, K2 = 1.5 ksi (AASHTO 5.7.4.4).", "note");
  m("A_{cv}\\coloneq t\\cdot H=", "The joint's area", "in^2");
  m("A_{vf}\\coloneq A_{sf}\\cdot H=", "The front face's bars crossing it", "in^2");
  m("V_{ui}\\coloneq\\sqrt{P_u^{2}+V_{wu}^{2}}=", "The thrust and the weight together", "kip");
  m(`V_{nf}\\coloneq${num(cn.sf.c)}\\mathrm{ksi}\\cdot A_{cv}+${num(cn.sf.mu)}\\cdot A_{vf}\\cdot f_y=`, "AASHTO Eq. 5.7.4.3-3, no axial load", "kip");
  m(`V_{ni}\\coloneq\\min\\left(V_{nf},${num(cn.sf.K1)}\\cdot f'_{c}\\cdot A_{cv},${num(cn.sf.K2)}\\mathrm{ksi}\\cdot A_{cv}\\right)=`, "AASHTO Eqs. 5.7.4.3-4, -5", "kip");
  m(ok("V_{ui}", "0.9\\cdot V_{ni}"), "Shear friction, AASHTO 5.7.4.3");
  if (cn.waived) m(ok("\\frac{V_{ui}}{A_{cv}}", "0.210\\mathrm{ksi}"), "The minimum steel across the joint may be waived, AASHTO 5.7.4.2");
  else m(ok("\\frac{0.05\\mathrm{ksi}\\cdot A_{cv}}{f_y}", "A_{vf}"), "Minimum steel across the joint, AASHTO Eq. 5.7.4.2-1");

  text("Section B: forces the abutment takes, about its centroidal axes", "subheading");
  for (const [s, V, name] of [["s", "V_{ws}", "Service"], ["u", "V_{wu}", "Strength I"]] as const) {
    m(`M_{y${s}}\\coloneq P_${s}\\cdot\\left(x_${s}+\\frac{A'}{2}\\right)=`, name, "kip*ft");
    m(`M_{x${s}}\\coloneq P_${s}\\cdot\\left(\\frac{H}{2}-y_${s}\\right)=`, undefined, "kip*ft");
    m(`T_{z${s}}\\coloneq ${V}\\cdot\\left(\\frac{L}{2}+\\frac{A'}{2}\\right)=`, "Torsion from self weight", "kip*ft");
  }
  text("The tension P, shear V, torsion and both moments act together on the abutment; detail the wingwall bars to develop into it.", "note");
  lines.push(...checksSummary([{ checks: r.checks }]));
  return lines;
}

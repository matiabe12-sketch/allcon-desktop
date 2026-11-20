import type { Line } from "@/lib/calcs/library/templates";
import { rateSlabBridge } from "./lrfr-slab";
import { ratingFactorLines, ratingTableLines } from "../girders/lrfr-calc";
import { checksSummary } from "../checks-summary";
import { COLOR_NOTE, info, INPUT_COLOR, isInput, num } from "../calc-style";
import { BARS, type Bars } from "../walls/cip";
import { designSlabBridge, type SlabBridgeInputs, type SlabSection } from "./slab-bridge";

// A cast-in-place slab bridge as a Calcs worksheet: the strips, the dead loads, the HL-93 moments from the influence
// lines as given values, then each governing section's flexure, minimum steel, crack control and fatigue as live math;
// shear, distribution and temperature bars, the least depth, the deflection and the supports' reactions.

const ok = (demand: string, capacity: string) => `\\operatorname{if}\\left(${demand}\\le ${capacity},\\text{OK},\\text{NG}\\right)=`;

export const SLAB_BRIDGE_GROUPS: { title: string; of: (id: string) => boolean }[] = [
  { title: "Interior strip", of: (id) => id.startsWith("interior") },
  { title: "Edge strip (edge beam)", of: (id) => id.startsWith("edge") },
  { title: "Bars and depth", of: (id) => /^(bottom-spacing|top-spacing|dist|temp|depth)/.test(id) },
  { title: "Shear", of: (id) => id === "shear" },
  { title: "Live load deflection", of: (id) => id.startsWith("deflection") },
];

export function slabBridgeCalcLines(i: SlabBridgeInputs, title: string): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note", extra?: { newPage?: boolean; keepWithNext?: boolean }) => lines.push({ text: t, ...(style ? { style } : {}), ...(extra ?? {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}), ...(math.length > 110 && ref ? { wide: true } : {}), ...(isInput(math) ? { color: INPUT_COLOR } : {}) });
  const r = designSlabBridge(i);
  const spans = i.spans.filter((L) => L > 0);
  const kft = "\\frac{\\mathrm{kip}\\cdot\\mathrm{ft}}{\\mathrm{ft}}";
  const barArea = (b: Bars) => `\\frac{${num(BARS[b.bar].area)}\\mathrm{in}^{2}}{${num(b.spacing)}\\mathrm{in}}`;

  text(title.toUpperCase(), "heading");
  text(`Purpose:- The design of a ${num(i.t)} in cast-in-place concrete slab bridge, ${spans.length} span${spans.length > 1 ? "s" : ""} of ${spans.map((L) => num(L)).join(", ")} ft${r.continuous ? ", continuous over its piers" : ""}, ${num(i.W)} ft wide${i.skew > 0 ? `, skewed ${num(i.skew)}°` : ""}, its main bars parallel to traffic, to AASHTO LRFD (10th Edition).`);
  text(`Method:- The slab is designed per foot of width as a beam ${r.continuous ? "continuous over its piers" : "on each simple span"}: its own weight, the barriers and the overlay; the HL-93 live load (the design truck with its rear axles 14 to 30 ft apart, the tandem, each with IM 33%, and the 0.64 klf lane load${r.continuous ? "; over an interior support 90% of two trucks at least 50 ft apart with 90% of the lane" : ""}, AASHTO 3.6.1.3) moved over the influence lines, over the equivalent strip (AASHTO 4.6.2.3). The edge strip under the barrier carries one line of wheels and the lane's part tributary to it (AASHTO 4.6.2.1.4b).`);
  text(COLOR_NOTE, "note");

  text("The slab and its strips (AASHTO 4.6.2.3)", "subheading", { newPage: true, keepWithNext: true });
  m(`W_s\\coloneq ${num(i.W)}\\mathrm{ft}`, "Width, out to out");
  m(`b_b\\coloneq ${num(i.barrierWidth)}\\mathrm{ft}`, "The edge to the barrier's inside face");
  m("W_r\\coloneq W_s-2\\cdot b_b=", "Clear roadway", "ft");
  m(`N_L\\coloneq ${r.NL}`, "Design lanes, whole 12 ft lanes, AASHTO 3.6.1.1.1");
  m(`t_s\\coloneq ${num(i.t)}\\mathrm{in}`, "Slab depth");
  m(`\\theta\\coloneq ${num(i.skew)}\\mathrm{deg}`, "Skew");
  m("r_{sk}\\coloneq\\min\\left(1.05-0.25\\cdot\\tan\\left(\\theta\\right),1\\right)=", "AASHTO Eq. 4.6.2.3-3, on the longitudinal moments");
  r.strips.forEach((s, k) => {
    const n = k + 1;
    m(`L_{${n}}\\coloneq ${num(s.L)}\\mathrm{ft}`, `Span ${n}`);
    m(`E_{1s${n}}\\coloneq10\\mathrm{in}+5\\cdot\\sqrt{\\frac{\\min\\left(L_{${n}},60\\mathrm{ft}\\right)}{\\mathrm{ft}}\\cdot\\frac{\\min\\left(W_s,30\\mathrm{ft}\\right)}{\\mathrm{ft}}}\\cdot\\mathrm{in}=`, "One lane, AASHTO Eq. 4.6.2.3-1", "in");
    if (r.NL > 1) {
      m(`E_{ms${n}}\\coloneq\\min\\left(84\\mathrm{in}+1.44\\cdot\\sqrt{\\frac{\\min\\left(L_{${n}},60\\mathrm{ft}\\right)}{\\mathrm{ft}}\\cdot\\frac{\\min\\left(W_s,60\\mathrm{ft}\\right)}{\\mathrm{ft}}}\\cdot\\mathrm{in},\\frac{W_s}{N_L}\\right)=`, "More lanes, AASHTO Eq. 4.6.2.3-2", "in");
      m(`E_{s${n}}\\coloneq\\min\\left(E_{1s${n}},E_{ms${n}}\\right)=`, "The strip", "in");
    } else m(`E_{s${n}}\\coloneq E_{1s${n}}=`, "The strip", "in");
    m(`E_{e${n}}\\coloneq\\min\\left(b_b+12\\mathrm{in}+\\frac{E_{s${n}}}{4},\\frac{E_{s${n}}}{2},72\\mathrm{in}\\right)=`, "The edge strip, AASHTO 4.6.2.1.4b", "in");
  });

  text("Dead loads per foot of width", "subheading", { keepWithNext: true });
  m(`\\gamma_c\\coloneq ${num(i.gammaC)}\\mathrm{kcf}`);
  m("w_{sl}\\coloneq\\gamma_c\\cdot t_s=", "The slab", "ksf");
  m(`w_{bar}\\coloneq ${num(i.barrierWeight)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, "Each barrier");
  m("w_{DC}\\coloneq w_{sl}+\\frac{2\\cdot w_{bar}}{W_s}=", "The interior strip: the barriers spread over the width", "ksf");
  m(`w_{DW}\\coloneq ${num(i.gammaWS)}\\mathrm{kcf}\\cdot ${num(i.wearing)}\\mathrm{in}\\cdot\\frac{W_r}{W_s}=`, "The overlay, on the roadway", "ksf");
  text("The edge strip:- its own slab and one barrier over its width, the overlay on its part past the barrier.");

  const Ec = r.concrete.Ec;
  m(`f'_{c}\\coloneq ${num(i.fc)}\\mathrm{ksi}`);
  m(`f_y\\coloneq ${num(i.fy)}\\mathrm{ksi}`);
  m("E_c\\coloneq120000\\cdot\\left(\\frac{\\gamma_c}{\\mathrm{kcf}}\\right)^{2}\\cdot\\left(\\frac{f'_{c}}{\\mathrm{ksi}}\\right)^{0.33}\\cdot\\mathrm{ksi}=", "AASHTO Eq. 5.4.2.4-1", "ksi");
  void Ec;
  m("f_r\\coloneq0.24\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}=", "AASHTO 5.4.2.6");

  // Each governing section, worked out.
  const section = (q: SlabSection, k: string, tag: string) => {
    const bars = q.negative ? i.top : i.bottom;
    const cover = q.negative ? i.coverTop : i.coverBot;
    const db = BARS[bars.bar].dia;
    text(`${tag}: ${q.label}, ${q.negative ? "the top bars" : "the bottom bars"} in tension`, "subheading", { keepWithNext: true });
    m(`M_{DC${k}}\\coloneq ${num(q.MDC, 3)}${kft}`, "From the beam, per foot");
    m(`M_{DW${k}}\\coloneq ${num(q.MDW, 3)}${kft}`);
    m(`E_{${k}}\\coloneq ${num(q.E, 3)}\\mathrm{in}`, q.where === "interior" ? "The strip" : "The edge strip");
    m(`M_{LL${k}}\\coloneq ${num(q.MLL, 3)}${kft}`, q.where === "interior" ? "The lane's HL-93 envelope with IM over the strip, times r_sk" : "One wheel line and the lane's tributary part (the larger of half the lane's envelope and that part), × 1.2, over the edge strip, times r_sk");
    m(`M_{u${k}}\\coloneq1.25\\cdot M_{DC${k}}+1.5\\cdot M_{DW${k}}+1.75\\cdot M_{LL${k}}=`, "Strength I", "kip*ft/ft");
    m(`M_{s${k}}\\coloneq M_{DC${k}}+M_{DW${k}}+M_{LL${k}}=`, "Service I", "kip*ft/ft");
    m(`A_{s${k}}\\coloneq ${num(q.f.As, 4)}\\frac{\\mathrm{in}^{2}}{\\mathrm{ft}}`, q.where === "edge" && i.edgeBars && i.edgeBars.count > 0 ? `#${bars.bar} at ${num(bars.spacing)} in with ${i.edgeBars.count} #${i.edgeBars.bar} added over the edge strip` : `#${bars.bar} at ${num(bars.spacing)} in`);
    m(`d_{e${k}}\\coloneq t_s-${num(cover)}\\mathrm{in}-\\frac{${num(db)}\\mathrm{in}}{2}=`, "Effective depth", "in");
    m(`a_{${k}}\\coloneq\\frac{A_{s${k}}\\cdot f_y}{0.85\\cdot f'_{c}}=`, "Stress block", "in");
    m(`M_{r${k}}\\coloneq0.9\\cdot A_{s${k}}\\cdot f_y\\cdot\\left(d_{e${k}}-\\frac{a_{${k}}}{2}\\right)=`, "AASHTO 5.6.3.2", "kip*ft/ft");
    m(ok(`M_{u${k}}`, `M_{r${k}}`), "Flexure");
    m(`M_{cr${k}}\\coloneq0.67\\cdot1.6\\cdot f_r\\cdot\\frac{t_s^{2}}{6}=`, "AASHTO Eq. 5.6.3.3-1", "kip*ft/ft");
    m(ok(`\\min\\left(1.33\\cdot M_{u${k}},M_{cr${k}}\\right)`, `M_{r${k}}`), "Minimum reinforcement, AASHTO 5.6.3.3");
    m(`j_{${k}}\\coloneq ${num(q.f.j, 4)}`, "The cracked section's lever arm over d");
    m(`f_{ss${k}}\\coloneq\\frac{M_{s${k}}}{A_{s${k}}\\cdot j_{${k}}\\cdot d_{e${k}}}=`, "Service steel stress", "ksi");
    m(`d_{c${k}}\\coloneq ${num(cover)}\\mathrm{in}+\\frac{${num(db)}\\mathrm{in}}{2}=`, undefined, "in");
    m(`\\beta_{s${k}}\\coloneq1+\\frac{d_{c${k}}}{0.7\\cdot\\left(t_s-d_{c${k}}\\right)}=`);
    m(`s_{mx${k}}\\coloneq\\frac{700\\cdot${i.exposure === 1 ? "1.00" : "0.75"}\\cdot\\frac{\\mathrm{kip}}{\\mathrm{in}}}{\\beta_{s${k}}\\cdot f_{ss${k}}}-2\\cdot d_{c${k}}=`, `Crack control, AASHTO Eq. 5.6.7-1 (Class ${i.exposure})`, "in");
    m(ok(`${num(bars.spacing)}\\mathrm{in}`, `s_{mx${k}}`), "Bar spacing");
    m(`M_{f${k}}\\coloneq ${num(q.Mfat, 3)}${kft}`, q.where === "interior" ? "Fatigue I: 1.75 × the fatigue truck with IM 15% over 1.2 E₁ (C4.6.2.3), times r_sk" : "Fatigue I: 1.75 × half the fatigue truck (one wheel line) with IM 15% over the edge strip");
    m(`f_{rg${k}}\\coloneq\\frac{M_{f${k}}}{A_{s${k}}\\cdot j_{${k}}\\cdot d_{e${k}}}=`, "Stress range", "ksi");
    m(`f_{mn${k}}\\coloneq\\frac{M_{DC${k}}+M_{DW${k}}}{A_{s${k}}\\cdot j_{${k}}\\cdot d_{e${k}}}=`, "Under the permanent loads", "ksi");
    m(ok(`f_{rg${k}}`, `26\\mathrm{ksi}-22\\cdot\\frac{f_{mn${k}}}{f_y}\\cdot\\mathrm{ksi}`), "Fatigue, AASHTO Eq. 5.5.3.2-1");
  };
  const govern = (where: "interior" | "edge", negative: boolean) => {
    const set = r.sections.filter((q) => q.where === where && q.negative === negative);
    return set.length ? set.reduce((a, b) => (b.Mu / b.f.MR > a.Mu / a.f.MR ? b : a)) : null;
  };
  const cases: [SlabSection | null, string, string][] = [
    [govern("interior", false), "ip", "Interior strip, positive moment"],
    [r.continuous ? govern("interior", true) : null, "in", "Interior strip, over the piers"],
    [govern("edge", false), "ep", "Edge strip, positive moment"],
    [r.continuous ? govern("edge", true) : null, "en", "Edge strip, over the piers"],
  ];
  for (const [q, k, tag] of cases) if (q) section(q, k, tag);

  text("Shear (AASHTO 5.12.2.1)", "subheading", { keepWithNext: true });
  text("Shear:- a slab designed for moment by AASHTO 4.6.2.3 may be taken as satisfactory for shear (AASHTO 5.12.2.1). The concrete's resistance with β = 2 is shown for information.");
  m(`V_u\\coloneq ${num(r.shear.Vmax, 3)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, "Strength I at the supports, the interior strip");
  m(`d_v\\coloneq ${num(r.shear.dv, 3)}\\mathrm{in}`, "AASHTO 5.7.2.8");
  m("V_c\\coloneq0.0316\\cdot2\\cdot\\sqrt{\\frac{f'_{c}}{\\mathrm{ksi}}}\\cdot\\mathrm{ksi}\\cdot12\\mathrm{in}\\cdot\\frac{d_v}{\\mathrm{ft}}=", "AASHTO Eq. 5.7.3.3-3, per foot", "kip/ft");
  m(info("V_u", "0.9\\cdot V_c"), "For information");

  text("Distribution and temperature bars, the least depth", "subheading", { keepWithNext: true });
  m(`L_{mn}\\coloneq ${num(r.dist.Lmin)}\\mathrm{ft}`, "The shortest span");
  m("p\\coloneq\\min\\left(\\frac{100}{\\sqrt{\\frac{L_{mn}}{\\mathrm{ft}}}},50\\right)=", "Percent of the main bars, primary bars parallel to traffic, AASHTO 9.7.3.2");
  m(`A_{sm}\\coloneq ${barArea(i.bottom)}=`, "The bottom main bars", "in^2/ft");
  m(`A_{sd}\\coloneq ${barArea(i.dist)}=`, `Bottom transverse, #${i.dist.bar} at ${num(i.dist.spacing)} in`, "in^2/ft");
  m(ok("\\frac{p}{100}\\cdot A_{sm}", "A_{sd}"), "Distribution reinforcement");
  m("A_{st}\\coloneq\\max\\left(\\frac{1.3\\cdot W_s\\cdot t_s}{2\\cdot\\left(W_s+t_s\\right)\\cdot f_y}\\cdot\\frac{\\mathrm{kip}}{\\mathrm{in}\\cdot\\mathrm{ft}},0.11\\frac{\\mathrm{in}^{2}}{\\mathrm{ft}}\\right)=", "Shrinkage and temperature, each face, AASHTO Eq. 5.10.6-1", "in^2/ft");
  for (const [sym, name, b] of [["tt", "Top transverse", i.topTrans], ["tl", "Top longitudinal", i.topLong]] as const) {
    m(`A_{${sym}}\\coloneq ${barArea(b)}=`, `${name}, #${b.bar} at ${num(b.spacing)} in`, "in^2/ft");
    m(ok("A_{st}", `A_{${sym}}`), "Shrinkage and temperature");
  }
  m(`S_{mx}\\coloneq ${num(r.depth.S)}\\mathrm{ft}`, "The longest span");
  m(r.continuous ? "h_{mn}\\coloneq\\max\\left(\\frac{S_{mx}+10\\mathrm{ft}}{30},0.54\\mathrm{ft}\\right)=" : "h_{mn}\\coloneq1.2\\cdot\\frac{S_{mx}+10\\mathrm{ft}}{30}=", `AASHTO Table 2.5.2.6.3-1, ${r.continuous ? "continuous" : "simple"} slabs`, "in");
  m(ok("h_{mn}", "t_s"), "The least depth");

  if (r.deflection.length) {
    text("Live load deflection (AASHTO 2.5.2.6.2)", "subheading", { keepWithNext: true });
    text(`Deflection:- every design lane loaded with its multiple presence factor, the whole width deflecting together, on the gross section (E_c I_g of the ${num(i.W)} ft slab): the design truck with IM, or 25% of it with the lane load (AASHTO 3.6.1.3.2); the deflection at midspan for a unit load anywhere by virtual work over the beam.`);
    r.deflection.forEach((d, k) => {
      m(`\\delta_{${k + 1}}\\coloneq ${num(d.d, 4)}\\mathrm{in}`, `Span ${d.span + 1}: the truck ${num(d.truck, 4)} in, the lane ${num(d.lane, 4)} in`);
      m(ok(`\\delta_{${k + 1}}`, `\\frac{${num(d.L)}\\mathrm{ft}}{${num(i.deflectionLimit)}}`), `L/${num(i.deflectionLimit)}`);
    });
  }

  text("Reactions per foot of width (unfactored), for the substructure", "subheading", { keepWithNext: true });
  r.reactions.forEach((x, k) => {
    m(`R_{${k + 1}}\\coloneq ${num(x.DC, 3)}${"\\frac{\\mathrm{kip}}{\\mathrm{ft}}"}`, `Support ${k + 1}: DC ${num(x.DC, 3)}, DW ${num(x.DW, 3)}, LL ${num(x.LL, 3)} (with IM ${num(x.LLIM, 3)}) kip/ft, every lane with its multiple presence factor over the width`);
  });

  // The load rating (LRFR), when it's turned on.
  if (i.rating?.on) {
    const q = rateSlabBridge(i, i.rating);
    lines.push(...ratingFactorLines(q, "Load and Resistance Factor Rating by the AASHTO Manual for Bridge Evaluation, Section 6A.5, with the CDOT Bridge Rating Manual: the interior and edge strips above rated in flexure from their dead loads, strips and resistances; other vehicles take HL-93's strip scaled by their effect over HL-93's on the same beam. Shear isn't rated (AASHTO 5.12.2.1)."));
    const at = (a: { span: number; x: number; limit: string }) => `span ${a.span + 1}, ${num(a.x, 1)} ft: ${a.limit.toLowerCase()}`;
    text(`HL-93 inventory RF ${num(q.hl93.inventory.rf, 2)} at ${at(q.hl93.inventory)}; operating RF ${num(q.hl93.operating.rf, 2)} at ${at(q.hl93.operating)}.`);
    lines.push(...ratingTableLines(q, `${num(i.wearing, 2)} in`));
  }
  lines.push(...checksSummary(SLAB_BRIDGE_GROUPS.map((g) => ({ title: g.title, checks: r.checks.filter((c) => g.of(c.id)) }))));
  return lines;
}

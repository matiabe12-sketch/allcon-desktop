import type { Line } from "@/lib/calcs/library/templates";
import type { Figure } from "../figures";
import { COLOR_NOTE, isInput, num } from "../calc-style";
import { checksSummary } from "../checks-summary";
import { designSteelGirder, hybridRh, type SteelGirderInputs, type SteelGirderResult } from "./steel";
import { FATIGUE_CATEGORIES, fatigueResistance, studResistance } from "./steel-details";
import { plates } from "./steel-section";
import { fuOf } from "./steel-splice";
import { connectionFactor } from "./steel-sole";

// A steel girder check as a Calcs worksheet: the bridge, the girder's sections and the loads; the girder
// line's governing effects as given values (from the analysis with the girder's own stiffness and HL-93 by
// influence lines); and each governing check worked out as live math with its AASHTO reference: positive
// flexure and ductility, negative flexure (local and lateral-torsional buckling), shear, constructibility,
// Service II, the proportion limits and the live load deflection.

/** A check's unit as the worksheet writes it. */
const unitTex = (u: string) => ({ kip: "\\mathrm{kip}", ksi: "\\mathrm{ksi}", "kip·ft": "\\mathrm{kip}\\cdot\\mathrm{ft}", in: "\\mathrm{in}", "kip·in/rad": "\\mathrm{kip}\\cdot\\mathrm{in}", "in⁴": "\\mathrm{in}^{4}", "°": "\\mathrm{deg}" })[u] ?? "";

const ok = (demand: string, capacity: string) => `\\operatorname{if}\\left(${demand}\\le ${capacity},\\text{OK},\\text{NG}\\right)=`;

export function steelCalcLines(i: SteelGirderInputs, title: string, result?: SteelGirderResult, figures?: { elevation?: Figure; camber?: Figure; screed?: Figure; crossFrame?: Figure; endFrame?: Figure; soles?: Figure[]; splices?: Figure[] }): Line[] {
  const r = result ?? designSteelGirder(i);
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note", extra?: { newPage?: boolean; keepWithNext?: boolean }) => lines.push({ text: t, ...(style ? { style } : {}), ...(extra ?? {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}), ...(math.length > 110 && ref ? { wide: true } : {}), ...(isInput(math) ? { input: true } : {}) });
  const given = (math: string, ref?: string) => lines.push({ math, ...(ref ? { ref } : {}) });
  const check = (id: string) => r.checks.find((c) => c.id === id);
  const stationOf = (id: string) => r.stations.reduce<SteelGirderResult["stations"][number] | null>((b, s) => ((s.ratios[id] ?? -1) > (b ? (b.ratios[id] ?? -1) : -1) ? s : b), null);
  const where = (s: SteelGirderResult["stations"][number]) => `${num(s.X, 2)} ft from the girder's start (span ${s.span + 1}, ${num(s.x / r.spans[s.span], 2)}L)`;

  text(title.toUpperCase(), "heading");
  text(
    `Purpose:- The check of a composite steel I-girder line of ${r.spans.length === 1 ? `one ${num(r.spans[0])} ft span` : `${r.spans.length} continuous spans (${r.spans.map((L) => num(L)).join(", ")} ft)`}, ${i.nGirders} girders at ${num(i.S)} ft, to AASHTO LRFD 10th Edition Article 6.10.`,
  );
  text(
    "Method:- A line girder: DC1 on the steel alone, DC2 and DW on the long-term composite section (3n), the live load on the short-term composite section (n), each with the girder's stiffness along it (6.10.1.5); HL-93 placed by influence lines, with 90% of two trucks and the lane for negative moment and pier reactions (3.6.1.3.1); distribution factors by 4.6.2.2. The effects at the governing sections are given; the resistances are worked out here.",
  );
  if (r.grid)
    text(
      `Refined analysis:- The loads' effects from a grid of the whole bridge (AASHTO 4.6.3.3): ${i.nGirders} girders${i.radius > 0 ? ` on a ${num(i.radius)} ft radius` : ""}${i.skew ? `, supports skewed ${num(i.skew)}°` : ""}, each bending and twisting (the torsion constant raised for warping restrained at the cross-frames), the cross-frames' trusses (single angles at 0.65 of their area, AASHTO C4.6.3.3.4), and the deck as transverse strips in the composite stages; the deck's loads to the girders by the lever rule. HL-93 placed on each response's influence surface, lanes 12 ft wide anywhere across the roadway with the multiple presence factors; the fatigue truck alone. The girder checked takes the envelope of the ${i.girder === "both" ? "girders" : `${i.girder} girders`} (girders ${r.grid.girders.map((j) => j + 1).join(", ")}). The distribution factors below are for information.`,
    );
  text(COLOR_NOTE, "note");

  if (figures?.elevation) {
    text("Girder elevation", "subheading", { newPage: true, keepWithNext: true });
    text("The girder's field sections, taken at the plate transitions (their splices aren't designed here), with its studs, connection plates and stiffeners, each flange's tension (T) and compression (C) zones from the Strength I envelope, and the girder's ends beyond the bearings; flange thicknesses exaggerated. Tension zones need the fracture-toughness (CVN) requirement (AASHTO 6.6.2.1).", undefined, { keepWithNext: true });
    lines.push({ region: figures.elevation });
  }

  text("Bridge, deck and girder", "subheading", { newPage: true, keepWithNext: true });
  m(`S\\coloneq ${num(i.S)}\\mathrm{ft}`, "Girder spacing");
  m(`N_b\\coloneq ${i.nGirders}`, "Girders");
  m(`t_s\\coloneq ${num(i.deckT - i.sacrificial)}\\mathrm{in}`, "Structural deck thickness");
  m(`f'_{c}\\coloneq ${num(i.fcDeck)}\\mathrm{ksi}`);
  m(`n\\coloneq ${num(r.n)}`, i.n > 0 ? "Modular ratio, as given" : "Modular ratio Es/Ec, AASHTO 5.4.2.4");
  m(`F_{yw}\\coloneq ${num(i.Fyw)}\\mathrm{ksi}`);
  m(`F_{yf}\\coloneq ${num(i.Fyf)}\\mathrm{ksi}`);
  m("E_s\\coloneq29000\\mathrm{ksi}", "AASHTO 6.4.1");
  m(`b_{eff}\\coloneq ${num(r.beff.used)}\\mathrm{in}`, `Effective width, AASHTO 4.6.2.6.1 (${i.girder === "both" ? "the smaller of interior and exterior" : `${i.girder} girder`})`);
  text(`Sections:- ${r.sections.map((s) => `${s.k + 1}: ${s.name} (${num(s.weight)} plf)`).join("; ")}.`);
  text(`Distribution factors:- ${r.df.spans.map((d, k) => `span ${k + 1} moment ${num(d.moment, 3)}, shear ${num(d.shear, 3)}`).join("; ")}${r.df.piers.length ? `; ${r.df.piers.map((d, k) => `pier ${k + 1} negative moment ${num(d.moment, 3)}`).join("; ")}` : ""} (AASHTO 4.6.2.2${i.rigidMethod ? ", the exterior girder not less than the rigid cross-section" : ""}).`);
  text(`Dead loads per girder:- DC1 besides the steel ${num(r.loads.dc1Deck, 3)} klf, DC2 ${num(r.loads.dc2, 3)} klf, DW ${num(r.loads.dw, 3)} klf; the steel from its sections.`);

  // --- Positive flexure ---
  const pos = check("flex-pos");
  const sp = stationOf("flex-pos");
  if (pos && sp) {
    text("Positive flexure (AASHTO 6.10.7.1)", "subheading", { newPage: true, keepWithNext: true });
    text(`Section:- ${where(sp)}, section ${sp.seg + 1}.`);
    const note = pos.note ?? "";
    const flP = Number(/fℓ ([\d.]+) ksi/.exec(note)?.[1] ?? 0);
    const SxtP = Number(/Sxt ([\d.]+) in³/.exec(note)?.[1] ?? 0);
    given(`M_{u}\\coloneq ${num(pos.demand - (flP * SxtP) / 36)}\\mathrm{kip}\\cdot\\mathrm{ft}`, note.includes("Mrd") ? "Strength I from the girder line, with the redistribution moment (AASHTO B6.4.1.2)" : "Strength I from the girder line");
    const Mp = Number(/Mp ([\d.]+)/.exec(note)?.[1] ?? 0);
    const dpdt = Number(/Dp\/Dt ([\d.]+)/.exec(note)?.[1] ?? 0);
    given(`M_{p}\\coloneq ${num(Mp)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Plastic moment, AASHTO D6.1");
    given(`r_{D}\\coloneq ${num(dpdt, 3)}`, "Dp/Dt, the plastic axis's depth over the composite depth");
    m("M_{n1}\\coloneq\\operatorname{if}\\left(r_{D}\\le0.1,M_{p},M_{p}\\cdot\\left(1.07-0.7\\cdot r_{D}\\right)\\right)=", "AASHTO Eqs. 6.10.7.1.2-1, -2", "kip*ft");
    if (note.includes("1.3RhMy")) {
      given(`M_{n}\\coloneq ${num(pos.capacity)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Limited to 1.3RhMy in a continuous span, AASHTO Eq. 6.10.7.1.2-3");
    } else m("M_{n}\\coloneq M_{n1}=", undefined, "kip*ft");
    m("\\phi_f\\coloneq1.0", "AASHTO 6.5.4.2");
    if (flP > 0) {
      given(`f_{lp}\\coloneq ${num(flP)}\\mathrm{ksi}`, "The bottom flange's lateral bending (curvature), AASHTO 6.10.1.6");
      given(`S_{xt}\\coloneq ${num(SxtP)}\\mathrm{in}^{3}`, "Myt / Fyt, the bottom flange");
      m(ok("M_{u}+\\frac{f_{lp}\\cdot S_{xt}}{3}", "\\phi_f\\cdot M_{n}"), "AASHTO Eq. 6.10.7.1.1-1");
    } else m(ok("M_{u}", "\\phi_f\\cdot M_{n}"), "AASHTO Eq. 6.10.7.1.1-1");
  }
  const duc = check("ductility");
  if (duc) {
    given(`D_{p}\\coloneq ${num(duc.demand)}\\mathrm{in}`, "Top of deck to the plastic neutral axis");
    given(`D_{t}\\coloneq ${num(duc.capacity / 0.42)}\\mathrm{in}`, "Total depth of the composite section");
    m(ok("D_{p}", "0.42\\cdot D_{t}"), "Ductility, AASHTO Eq. 6.10.7.3-1");
  }

  // --- Negative flexure ---
  const neg = check("flex-neg-c");
  const sn = stationOf("flex-neg-c");
  if (neg && sn) {
    const p = plates(i.segments[sn.seg]);
    const note = neg.note ?? "";
    const Lb = Number(/Lb ([\d.]+) ft/.exec(note)?.[1] ?? 0);
    const Cb = Number(/Cb ([\d.]+)/.exec(note)?.[1] ?? 1);
    const Rb = Number(/Rb ([\d.]+)/.exec(note)?.[1] ?? 1);
    text("Negative flexure (AASHTO 6.10.8)", "subheading", { newPage: true, keepWithNext: true });
    text(`Section:- ${where(sn)}, section ${sn.seg + 1}: the bottom flange in compression, braced at the cross-frames; the top flange braced by the deck.`);
    if (!(pos && sp)) m("\\phi_f\\coloneq1.0", "AASHTO 6.5.4.2");
    const flN = Number(/fℓ ([\d.]+) ksi/.exec(note)?.[1] ?? 0);
    given(`f_{bu}\\coloneq ${num(neg.demand - flN / 3)}\\mathrm{ksi}`, "Strength I, DC1 on the steel, the rest on the steel and the deck's bars, AASHTO 6.10.1.1.1c");
    if (flN > 0) given(`f_{ln}\\coloneq ${num(flN)}\\mathrm{ksi}`, `The bottom flange's lateral bending (curvature)${note.includes("amplified") ? ", amplified by Eq. 6.10.1.6-4" : ""}, AASHTO 6.10.1.6`);
    m(`b_{fc}\\coloneq ${num(p.bottom.b)}\\mathrm{in}`);
    m(`t_{fc}\\coloneq ${num(p.bottom.t)}\\mathrm{in}`);
    m(`D\\coloneq ${num(p.D)}\\mathrm{in}`);
    m(`t_{w}\\coloneq ${num(p.tw)}\\mathrm{in}`);
    given(`D_{c}\\coloneq ${num(Math.max(0, r.sections[sn.seg].bars.yNA - p.bottom.t))}\\mathrm{in}`, "Web depth in compression, the steel and bars, AASHTO D6.3.1");
    m(`L_{b}\\coloneq ${num(Lb)}\\mathrm{ft}`, "Unbraced length, between cross-frames");
    given(`C_{b}\\coloneq ${num(Cb, 3)}`, "From the moments at the unbraced length's quarter points, AASHTO Eq. 6.10.8.2.3b-1");
    given(`R_{b}\\coloneq ${num(Rb, 3)}`, "Web load-shedding, AASHTO 6.10.1.10.2");
    const sc = r.sections[sn.seg].steel;
    const Rh = hybridRh(p.D * p.tw, Math.min(p.top.b * p.top.t, p.bottom.b * p.bottom.t), Math.max(sc.yNA - p.bottom.t, sc.depth - p.top.t - sc.yNA), p.tw, i.Fyw, i.Fyf);
    if (Rh === 1) m("R_{h}\\coloneq1.0", "Homogeneous section, AASHTO 6.10.1.10.1");
    else given(`R_{h}\\coloneq ${num(Rh, 3)}`, "Hybrid factor, AASHTO 6.10.1.10.1");
    m("\\lambda_{f}\\coloneq\\frac{b_{fc}}{2\\cdot t_{fc}}=", "AASHTO Eq. 6.10.8.2.2-3");
    m("\\lambda_{pf}\\coloneq0.38\\cdot\\sqrt{\\frac{E_s}{F_{yf}}}=", "AASHTO Eq. 6.10.8.2.2-4");
    m("F_{yr}\\coloneq\\max\\left(0.5\\cdot F_{yf},\\min\\left(0.7\\cdot F_{yf},F_{yw}\\right)\\right)=", "AASHTO 6.10.8.2.2", "ksi");
    m("\\lambda_{rf}\\coloneq0.56\\cdot\\sqrt{\\frac{E_s}{F_{yr}}}=", "AASHTO Eq. 6.10.8.2.2-5");
    m("F_{yc}\\coloneq R_{b}\\cdot R_{h}\\cdot F_{yf}=", "The flange's yield limit", "ksi");
    m("F_{FLBi}\\coloneq\\left(1-\\left(1-\\frac{F_{yr}}{R_{h}\\cdot F_{yf}}\\right)\\cdot\\frac{\\lambda_{f}-\\lambda_{pf}}{\\lambda_{rf}-\\lambda_{pf}}\\right)\\cdot F_{yc}=", "Noncompact flange, AASHTO Eq. 6.10.8.2.2-2", "ksi");
    m("F_{FLB}\\coloneq\\operatorname{if}\\left(\\lambda_{f}\\le\\lambda_{pf},F_{yc},F_{FLBi}\\right)=", "AASHTO Eqs. 6.10.8.2.2-1, -2", "ksi");
    m("r_{t}\\coloneq\\frac{b_{fc}}{\\sqrt{12\\cdot\\left(1+\\frac{D_{c}\\cdot t_{w}}{3\\cdot b_{fc}\\cdot t_{fc}}\\right)}}=", "AASHTO Eq. 6.10.8.2.3b-3", "in");
    m("L_{p}\\coloneq1.1\\cdot r_{t}\\cdot\\sqrt{\\frac{E_s}{F_{yf}}}=", "AASHTO Eq. 6.10.8.2.3a-4", "ft");
    m("F_{yrL}\\coloneq0.5\\cdot F_{yf}=", "Webs without longitudinal stiffeners, AASHTO 6.10.8.2.3a", "ksi");
    m("L_{r}\\coloneq\\pi\\cdot r_{t}\\cdot\\sqrt{\\frac{E_s}{F_{yrL}}}=", "AASHTO Eq. 6.10.8.2.3a-5", "ft");
    m("F_{e}\\coloneq\\frac{C_{b}\\cdot\\pi^{2}\\cdot E_s}{\\left(\\frac{L_{b}}{r_{t}}\\right)^{2}}=", "AASHTO Eq. 6.10.8.2.3b-2", "ksi");
    m("F_{LTBi}\\coloneq\\min\\left(C_{b}\\cdot\\left(1-\\left(1-\\frac{F_{yrL}}{R_{h}\\cdot F_{yf}}\\right)\\cdot\\frac{L_{b}-L_{p}}{L_{r}-L_{p}}\\right)\\cdot F_{yc},F_{yc}\\right)=", "Inelastic, AASHTO Eq. 6.10.8.2.3a-2", "ksi");
    m("F_{LTBe}\\coloneq\\min\\left(R_{b}\\cdot F_{e},F_{yc}\\right)=", "Elastic, AASHTO Eq. 6.10.8.2.3a-3", "ksi");
    m("F_{LTB}\\coloneq\\operatorname{if}\\left(L_{b}\\le L_{p},F_{yc},\\operatorname{if}\\left(L_{b}\\le L_{r},F_{LTBi},F_{LTBe}\\right)\\right)=", "AASHTO Eqs. 6.10.8.2.3a-1 to -3", "ksi");
    m("F_{nc}\\coloneq\\min\\left(F_{FLB},F_{LTB}\\right)=", "AASHTO 6.10.8.2.1", "ksi");
    m(ok(flN > 0 ? "f_{bu}+\\frac{f_{ln}}{3}" : "f_{bu}", "\\phi_f\\cdot F_{nc}"), "AASHTO Eq. 6.10.8.1.1-1");
    const t = check("flex-neg-t");
    if (t) {
      given(`f_{bt}\\coloneq ${num(t.demand)}\\mathrm{ksi}`, "The top flange, in tension");
      m(ok("f_{bt}", "\\phi_f\\cdot R_{h}\\cdot F_{yf}"), "AASHTO Eq. 6.10.8.1.3-1");
    }
  }

  // --- Shear ---
  const sh = check("shear");
  const ss = stationOf("shear");
  if (sh && ss) {
    const p = plates(i.segments[ss.seg]);
    const stiff = !(sh.note ?? "").startsWith("unstiffened");
    const d0 = Number(/do ([\d.]+) in/.exec(sh.note ?? "")?.[1] ?? 0);
    const end = (sh.note ?? "").startsWith("end panel");
    text("Shear (AASHTO 6.10.9)", "subheading", { newPage: true, keepWithNext: true });
    text(`Section:- ${where(ss)}, section ${ss.seg + 1}.`);
    given(`V_{u}\\coloneq ${num(ss.Vu)}\\mathrm{kip}`, "Strength I from the girder line");
    m(`D_{v}\\coloneq ${num(p.D)}\\mathrm{in}`);
    m(`t_{v}\\coloneq ${num(p.tw)}\\mathrm{in}`);
    if (stiff) {
      m(`d_{o}\\coloneq ${num(d0)}\\mathrm{in}`, "Transverse stiffener spacing");
      m("k_{v}\\coloneq5+\\frac{5}{\\left(\\frac{d_{o}}{D_{v}}\\right)^{2}}=", "AASHTO Eq. 6.10.9.3.2-7");
    } else m("k_{v}\\coloneq5", "Unstiffened web, AASHTO 6.10.9.2");
    m("a_{v}\\coloneq\\sqrt{\\frac{E_s\\cdot k_{v}}{F_{yw}}}=");
    m("\\lambda_{v}\\coloneq\\frac{D_{v}}{t_{v}}=", "The web's slenderness");
    m("C_{i}\\coloneq\\frac{1.12\\cdot a_{v}}{\\lambda_{v}}=", "Inelastic buckling, AASHTO Eq. 6.10.9.3.2-5");
    m("C_{e}\\coloneq\\frac{1.57\\cdot a_{v}^{2}}{\\lambda_{v}^{2}}=", "Elastic buckling, AASHTO Eq. 6.10.9.3.2-6");
    m("C\\coloneq\\operatorname{if}\\left(\\lambda_{v}\\le1.12\\cdot a_{v},1,\\operatorname{if}\\left(\\lambda_{v}\\le1.40\\cdot a_{v},C_{i},C_{e}\\right)\\right)=", "AASHTO Eqs. 6.10.9.3.2-4 to -6");
    m("V_{p}\\coloneq0.58\\cdot F_{yw}\\cdot D_{v}\\cdot t_{v}=", "AASHTO Eq. 6.10.9.2-2", "kip");
    if (stiff && !end) {
      const pp = p;
      const ratio = (2 * pp.D * pp.tw) / (pp.top.b * pp.top.t + pp.bottom.b * pp.bottom.t);
      if (ratio <= 2.5) m("V_{n}\\coloneq V_{p}\\cdot\\left(C+\\frac{0.87\\cdot\\left(1-C\\right)}{\\sqrt{1+\\left(\\frac{d_{o}}{D_{v}}\\right)^{2}}}\\right)=", "Tension-field action, AASHTO Eq. 6.10.9.3.2-2", "kip");
      else m("V_{n}\\coloneq V_{p}\\cdot\\left(C+\\frac{0.87\\cdot\\left(1-C\\right)}{\\sqrt{1+\\left(\\frac{d_{o}}{D_{v}}\\right)^{2}}+\\frac{d_{o}}{D_{v}}}\\right)=", "AASHTO Eq. 6.10.9.3.2-8", "kip");
    } else m("V_{n}\\coloneq C\\cdot V_{p}=", end ? "End panel, AASHTO 6.10.9.3.3" : "AASHTO Eq. 6.10.9.2-1", "kip");
    m("\\phi_v\\coloneq1.0", "AASHTO 6.5.4.2");
    m(ok("V_{u}", "\\phi_v\\cdot V_{n}"), "AASHTO Eq. 6.10.9.1-1");
  }

  // --- Constructibility, Service II, deflection: the governing values and their limits ---
  const flat = (ids: [string, string, string][], heading: string, prefix: string, newPage = heading.startsWith("Constructibility")) => {
    const rows = ids.map(([id, name, ref]) => ({ c: check(id), name, ref })).filter((x) => x.c);
    if (!rows.length) return;
    text(heading, "subheading", { newPage, keepWithNext: true });
    rows.forEach(({ c, name, ref }, k) => {
      const tag = `${prefix}${k + 1}`;
      text(`${name}:- ${c!.name.replace(/^[^:]+: /, "")}${c!.note ? ` (${c!.note})` : ""}.`, undefined, { keepWithNext: true });
      given(`f_{${tag}}\\coloneq ${num(c!.demand, 3)}${unitTex(c!.unit)}`, "From the girder line");
      given(`F_{${tag}}\\coloneq ${num(c!.capacity, 3)}${unitTex(c!.unit)}`, "The limit, worked out as for the strength checks");
      m(ok(`f_{${tag}}`, `F_{${tag}}`), ref);
    });
  };
  flat(
    [
      ["flex-pos-c", "Compression flange", "AASHTO Eq. 6.10.7.2.1-1"],
      ["flex-pos-t", "Tension flange, fbu + fℓ/3", "AASHTO Eq. 6.10.7.2.1-2"],
    ],
    `Positive flexure, noncompact section${r.curved ? " (a curved girder's, AASHTO 6.10.6.2.2)" : ""} (AASHTO 6.10.7.2)`,
    "n",
    true,
  );
  // The steel section's hybrid factor at a field section (6.10.1.10.1).
  const rhOf = (k: number) => {
    const p = plates(i.segments[k]);
    const sc = r.sections[k].steel;
    return hybridRh(p.D * p.tw, Math.min(p.top.b * p.top.t, p.bottom.b * p.bottom.t), Math.max(sc.yNA - p.bottom.t, sc.depth - p.top.t - sc.yNA), p.tw, i.Fyw, i.Fyf);
  };
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.003 * Math.max(1, Math.abs(b));
  const rhLine = (k: number, t: string) => {
    const Rh = rhOf(k);
    if (Rh === 1) m(`R_{h${t}}\\coloneq1.0`, "Homogeneous section, AASHTO 6.10.1.10.1");
    else given(`R_{h${t}}\\coloneq ${num(Rh, 3)}`, "Hybrid factor, AASHTO 6.10.1.10.1");
  };
  /** The compression flange's Fnc (6.10.8.2.2 and 6.10.8.2.3, Rb = 1 on the bare steel), its variables tagged t. */
  const fncLines = (t: string) => {
    m(`\\lambda_{f${t}}\\coloneq\\frac{b_{fc${t}}}{2\\cdot t_{fc${t}}}=`, "AASHTO Eq. 6.10.8.2.2-3");
    m(`\\lambda_{pf${t}}\\coloneq0.38\\cdot\\sqrt{\\frac{E_s}{F_{yf}}}=`, "AASHTO Eq. 6.10.8.2.2-4");
    m(`F_{yr${t}}\\coloneq\\max\\left(0.5\\cdot F_{yf},\\min\\left(0.7\\cdot F_{yf},F_{yw}\\right)\\right)=`, "AASHTO 6.10.8.2.2", "ksi");
    m(`\\lambda_{rf${t}}\\coloneq0.56\\cdot\\sqrt{\\frac{E_s}{F_{yr${t}}}}=`, "AASHTO Eq. 6.10.8.2.2-5");
    m(`F_{yc${t}}\\coloneq R_{h${t}}\\cdot F_{yf}=`, "The flange's yield limit (Rb = 1)", "ksi");
    m(`F_{FLBi${t}}\\coloneq\\left(1-\\left(1-\\frac{F_{yr${t}}}{F_{yc${t}}}\\right)\\cdot\\frac{\\lambda_{f${t}}-\\lambda_{pf${t}}}{\\lambda_{rf${t}}-\\lambda_{pf${t}}}\\right)\\cdot F_{yc${t}}=`, "Noncompact flange, AASHTO Eq. 6.10.8.2.2-2", "ksi");
    m(`F_{FLB${t}}\\coloneq\\operatorname{if}\\left(\\lambda_{f${t}}\\le\\lambda_{pf${t}},F_{yc${t}},F_{FLBi${t}}\\right)=`, "AASHTO Eqs. 6.10.8.2.2-1, -2", "ksi");
    m(`r_{t${t}}\\coloneq\\frac{b_{fc${t}}}{\\sqrt{12\\cdot\\left(1+\\frac{D_{c${t}}\\cdot t_{w${t}}}{3\\cdot b_{fc${t}}\\cdot t_{fc${t}}}\\right)}}=`, "AASHTO Eq. 6.10.8.2.3b-3", "in");
    m(`L_{p${t}}\\coloneq1.1\\cdot r_{t${t}}\\cdot\\sqrt{\\frac{E_s}{F_{yf}}}=`, "AASHTO Eq. 6.10.8.2.3a-4", "ft");
    m(`F_{yrL${t}}\\coloneq0.5\\cdot F_{yf}=`, "Webs without longitudinal stiffeners, AASHTO 6.10.8.2.3a", "ksi");
    m(`L_{r${t}}\\coloneq\\pi\\cdot r_{t${t}}\\cdot\\sqrt{\\frac{E_s}{F_{yrL${t}}}}=`, "AASHTO Eq. 6.10.8.2.3a-5", "ft");
    m(`F_{e${t}}\\coloneq\\frac{C_{b${t}}\\cdot\\pi^{2}\\cdot E_s}{\\left(\\frac{L_{b${t}}}{r_{t${t}}}\\right)^{2}}=`, "AASHTO Eq. 6.10.8.2.3b-2", "ksi");
    m(`F_{LTBi${t}}\\coloneq\\min\\left(C_{b${t}}\\cdot\\left(1-\\left(1-\\frac{F_{yrL${t}}}{F_{yc${t}}}\\right)\\cdot\\frac{L_{b${t}}-L_{p${t}}}{L_{r${t}}-L_{p${t}}}\\right)\\cdot F_{yc${t}},F_{yc${t}}\\right)=`, "Inelastic, AASHTO Eq. 6.10.8.2.3a-2", "ksi");
    m(`F_{LTBe${t}}\\coloneq\\min\\left(F_{e${t}},F_{yc${t}}\\right)=`, "Elastic, AASHTO Eq. 6.10.8.2.3a-3", "ksi");
    m(`F_{LTB${t}}\\coloneq\\operatorname{if}\\left(L_{b${t}}\\le L_{p${t}},F_{yc${t}},\\operatorname{if}\\left(L_{b${t}}\\le L_{r${t}},F_{LTBi${t}},F_{LTBe${t}}\\right)\\right)=`, "AASHTO Eqs. 6.10.8.2.3a-1 to -3 (Rb = 1)", "ksi");
    m(`F_{nc${t}}\\coloneq\\min\\left(F_{FLB${t}},F_{LTB${t}}\\right)=`, "AASHTO 6.10.8.2.1", "ksi");
  };

  // --- Constructibility (6.10.3), worked at each governing section: the deck placed on the bare steel ---
  const conIds: [string, string, string][] = [
    ["con-yield", "Compression flange, yielding", "AASHTO Eq. 6.10.3.2.1-1"],
    ["con-fnc", "Compression flange, buckling", "AASHTO Eq. 6.10.3.2.1-2"],
    ["con-web", "Web bend-buckling", "AASHTO Eq. 6.10.3.2.1-3"],
    ["con-tension", "Tension flange", "AASHTO Eq. 6.10.3.2.2-1"],
    ["con-shear", "Shear", "AASHTO Eq. 6.10.3.3-1"],
    ["con-fl", "Flange lateral bending", "AASHTO Eq. 6.10.1.6-1"],
  ];
  const conLeft: [string, string, string][] = [];
  {
    const flexIds = ["con-yield", "con-fnc", "con-web", "con-tension"];
    const present = flexIds.filter((id) => check(id) && stationOf(id));
    const groups = new Map<number, string[]>();
    for (const id of present) {
      const X = stationOf(id)!.X;
      groups.set(X, [...(groups.get(X) ?? []), id]);
    }
    const workable = i.constructionLL === 0 && present.length > 0;
    if (workable) {
      text("Constructibility: the deck placed on the steel (AASHTO 6.10.3)", "subheading", { newPage: true, keepWithNext: true });
      text(
        `Method:- The deck's weight on the erected steelwork, the steel alone carrying it: 1.4 DC1 (AASHTO 3.4.2.1, its additional combination for steel superstructures; 1.25 DC1 of Strength I is smaller with no construction loads). The compression flange braced at the cross-frames; Rb = 1 (AASHTO 6.10.1.10.2).`,
        undefined,
        { keepWithNext: true },
      );
      m("\\phi_f\\coloneq1.0", "AASHTO 6.5.4.2");
      let g = 0;
      for (const [X, ids] of groups) {
        const s = r.stations.find((x) => x.X === X)!;
        const k = s.seg;
        const p = plates(i.segments[k]);
        const sc = r.sections[k].steel;
        const topComp = s.M.dc1 >= 0;
        const cf = topComp ? p.top : p.bottom;
        const Mc = 1.4 * i.eta * s.M.dc1;
        const fbu = (Math.abs(Mc) * 12) / (topComp ? sc.Stop : sc.Sbot);
        const fbt = (Math.abs(Mc) * 12) / (topComp ? sc.Sbot : sc.Stop);
        const Dc = topComp ? Math.max(0, sc.depth - p.top.t - sc.yNA) : Math.max(0, sc.yNA - p.bottom.t);
        // Only where the engine's values follow from these (no construction loads or other stages); else the summary.
        const fits = ids.every((id) => {
          const c = check(id)!;
          if (id === "con-web") return near(fbu, c.demand);
          if (id === "con-tension") return c.demand >= fbt - 1e-6;
          return c.demand >= fbu - 1e-6;
        });
        if (!fits) {
          for (const id of ids) conLeft.push(conIds.find((x) => x[0] === id)!);
          continue;
        }
        g++;
        const t = `c${g}`;
        text(`Section ${g}:- ${where(s)}, section ${k + 1}: the ${topComp ? "top" : "bottom"} flange in compression.`, undefined, { keepWithNext: true });
        given(`M_{DC1${t}}\\coloneq ${num(s.M.dc1)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "DC1: the steel, the wet deck and haunch, from the girder line");
        m(`M_{u${t}}\\coloneq1.4\\cdot${num(i.eta)}\\cdot\\left|M_{DC1${t}}\\right|=`, "1.4 η DC1, AASHTO 3.4.2.1", "kip*ft");
        given(`S_{xc${t}}\\coloneq ${num(topComp ? sc.Stop : sc.Sbot)}\\mathrm{in}^{3}`, `The steel section, to the ${topComp ? "top" : "bottom"} flange`);
        given(`S_{xt${t}}\\coloneq ${num(topComp ? sc.Sbot : sc.Stop)}\\mathrm{in}^{3}`, `The steel section, to the ${topComp ? "bottom" : "top"} flange`);
        m(`f_{bu${t}}\\coloneq\\frac{M_{u${t}}}{S_{xc${t}}}=`, "Compression flange", "ksi");
        rhLine(k, t);
        const flOf = (id: string) => {
          const c = check(id)!;
          return id === "con-fnc" ? (c.demand - fbu) * 3 : c.demand - (id === "con-tension" ? fbt : fbu);
        };
        const flc = ids.includes("con-yield") ? flOf("con-yield") : ids.includes("con-fnc") ? flOf("con-fnc") : 0;
        if (flc > 0.005 && (ids.includes("con-yield") || ids.includes("con-fnc"))) given(`f_{l${t}}\\coloneq ${num(flc, 3)}\\mathrm{ksi}`, "The compression flange's lateral bending (overhang brackets, curvature), AASHTO 6.10.1.6");
        const fl = flc > 0.005 ? `+f_{l${t}}` : "";
        if (ids.includes("con-yield")) m(ok(`f_{bu${t}}${fl}`, `\\phi_f\\cdot R_{h${t}}\\cdot F_{yf}`), "Yielding, AASHTO Eq. 6.10.3.2.1-1");
        if (ids.includes("con-fnc") || ids.includes("con-web")) {
          m(`b_{fc${t}}\\coloneq ${num(cf.b)}\\mathrm{in}`);
          m(`t_{fc${t}}\\coloneq ${num(cf.t)}\\mathrm{in}`);
          m(`D_{${t}}\\coloneq ${num(p.D)}\\mathrm{in}`);
          m(`t_{w${t}}\\coloneq ${num(p.tw)}\\mathrm{in}`);
          given(`D_{c${t}}\\coloneq ${num(Dc)}\\mathrm{in}`, "Web depth in compression, the steel section, AASHTO D6.3.1");
        }
        if (ids.includes("con-fnc")) {
          const note = check("con-fnc")!.note ?? "";
          m(`L_{b${t}}\\coloneq ${num(Number(/Lb ([\d.]+) ft/.exec(note)?.[1] ?? 0))}\\mathrm{ft}`, "Unbraced length, between cross-frames");
          given(`C_{b${t}}\\coloneq ${num(Number(/Cb ([\d.]+)/.exec(note)?.[1] ?? 1), 3)}`, "From the moments at the unbraced length's quarter points, AASHTO Eq. 6.10.8.2.3b-1");
          fncLines(t);
          m(ok(`f_{bu${t}}${flc > 0.005 ? `+\\frac{f_{l${t}}}{3}` : ""}`, `\\phi_f\\cdot F_{nc${t}}`), "Flange buckling, AASHTO Eq. 6.10.3.2.1-2");
        }
        if (ids.includes("con-web")) {
          m(`k_{w${t}}\\coloneq\\frac{9}{\\left(\\frac{D_{c${t}}}{D_{${t}}}\\right)^{2}}=`, "AASHTO Eq. 6.10.1.9.1-2");
          m(`F_{crw${t}}\\coloneq\\min\\left(\\frac{0.9\\cdot E_s\\cdot k_{w${t}}}{\\left(\\frac{D_{${t}}}{t_{w${t}}}\\right)^{2}},R_{h${t}}\\cdot F_{yf},\\frac{F_{yw}}{0.7}\\right)=`, "AASHTO Eq. 6.10.1.9.1-1", "ksi");
          m(ok(`f_{bu${t}}`, `\\phi_f\\cdot F_{crw${t}}`), "Web bend-buckling, AASHTO Eq. 6.10.3.2.1-3");
        }
        if (ids.includes("con-tension")) {
          m(`f_{bt${t}}\\coloneq\\frac{M_{u${t}}}{S_{xt${t}}}=`, "Tension flange", "ksi");
          const flt = flOf("con-tension");
          if (flt > 0.005) given(`f_{lt${t}}\\coloneq ${num(flt, 3)}\\mathrm{ksi}`, "The tension flange's lateral bending, AASHTO 6.10.1.6");
          m(ok(`f_{bt${t}}${flt > 0.005 ? `+f_{lt${t}}` : ""}`, `\\phi_f\\cdot R_{h${t}}\\cdot F_{yf}`), "AASHTO Eq. 6.10.3.2.2-1");
        }
      }
      if (!g) conLeft.length = 0;
      if (!g) for (const id of present) conLeft.push(conIds.find((x) => x[0] === id)!);
    } else for (const id of present) conLeft.push(conIds.find((x) => x[0] === id)!);
    conLeft.push(...conIds.filter(([id]) => !flexIds.includes(id)));
  }

  // --- Service II (6.10.4.2), worked: 1.0 DC + 1.0 DW + 1.3 LL on the stage that carries each ---
  const svcLeft: [string, string, string][] = [["svc-web", "Web bend-buckling", "AASHTO Eq. 6.10.4.2.2-4"]];
  {
    const rows = (
      [
        ["svc-top", "Top flange", "AASHTO Eq. 6.10.4.2.2-1", "Stop"],
        ["svc-bot", "Bottom flange", "AASHTO Eq. 6.10.4.2.2-2", "Sbot"],
      ] as const
    ).filter(([id]) => check(id) && stationOf(id));
    let opened = false;
    rows.forEach(([id, name, ref, face]) => {
      const c = check(id)!;
      const s = stationOf(id)!;
      const k = s.seg;
      const note = c.note ?? "";
      const negative = note.startsWith("negative");
      const cracked = /deck cracked/.test(note);
      const Mrd = Number(/Mrd (-?[\d.]+) kip/.exec(note)?.[1] ?? 0);
      const flS = face === "Sbot" ? Number(/fℓ ([\d.]+) ksi \(curvature\)/.exec(note)?.[1] ?? 0) : 0;
      const sec = r.sections[k];
      const ll = negative ? s.M.llNeg : s.M.llPos;
      const lt = cracked ? sec.bars : sec.long;
      const st = cracked ? sec.bars : sec.short;
      const f = Math.abs((s.M.dc1 * 12) / sec.steel[face] + ((s.M.dc2 + s.M.dw + Mrd) * 12) / lt[face] + (1.3 * ll * 12) / st[face]) + flS / 2;
      if (!near(f, c.demand)) {
        svcLeft.unshift([id, name, ref]);
        return;
      }
      if (!opened) {
        text("Service II: permanent deformations (AASHTO 6.10.4.2)", "subheading", { newPage: true, keepWithNext: true });
        text(
          "Method:- 1.0 DC + 1.0 DW + 1.3 LL (AASHTO Table 3.4.1-1): DC1 on the steel, DC2 and DW on the long-term composite section (3n), the live load on the short-term (n). In negative flexure the deck counts only where the studs run throughout and its tension under these loads stays within 2fr; otherwise the steel and the deck's bars carry them (AASHTO 6.10.4.2.1).",
          undefined,
          { keepWithNext: true },
        );
        opened = true;
      }
      const t = face === "Stop" ? "sT" : "sB";
      text(`${name}:- ${where(s)}, section ${k + 1}, ${negative ? "negative" : "positive"} moment.`, undefined, { keepWithNext: true });
      given(`M_{1${t}}\\coloneq ${num(s.M.dc1)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "DC1, on the steel");
      given(`M_{2${t}}\\coloneq ${num(s.M.dc2 + s.M.dw)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "DC2 + DW");
      given(`M_{L${t}}\\coloneq ${num(ll)}\\mathrm{kip}\\cdot\\mathrm{ft}`, `LL+IM, ${negative ? "negative" : "positive"}, from the girder line`);
      if (Mrd) given(`M_{rd${t}}\\coloneq ${num(Mrd)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "The redistribution moment at service, on the long-term section, AASHTO B6.3.3");
      if (negative && i.studsThroughout) {
        given(`S_{d3${t}}\\coloneq ${num(sec.long.Sdeck)}\\mathrm{in}^{3}`, "Long-term section (3n), to the top of the deck");
        given(`S_{dn${t}}\\coloneq ${num(sec.short.Sdeck)}\\mathrm{in}^{3}`, "Short-term section (n), to the top of the deck");
        m(`f_{dk${t}}\\coloneq-\\left(\\frac{M_{2${t}}}{3\\cdot n\\cdot S_{d3${t}}}+\\frac{1.3\\cdot M_{L${t}}}{n\\cdot S_{dn${t}}}\\right)=`, "The deck's longitudinal tension", "ksi");
        m(`f_{rs${t}}\\coloneq0.24\\cdot\\sqrt{${num(i.fcDeck)}}\\cdot\\mathrm{ksi}=`, "Modulus of rupture, AASHTO 5.4.2.6", "ksi");
        m(`\\operatorname{if}\\left(f_{dk${t}}\\le2\\cdot f_{rs${t}},\\text{effective},\\text{cracked}\\right)=`, "The deck in negative flexure at service, AASHTO 6.10.4.2.1");
      }
      const side = face === "Stop" ? "top" : "bottom";
      given(`S_{nc${t}}\\coloneq ${num(sec.steel[face])}\\mathrm{in}^{3}`, `The steel, to the ${side} flange`);
      given(`S_{lt${t}}\\coloneq ${num(lt[face])}\\mathrm{in}^{3}`, cracked ? `The steel and the deck's bars, to the ${side} flange` : `Long-term composite (3n), to the ${side} flange`);
      given(`S_{st${t}}\\coloneq ${num(st[face])}\\mathrm{in}^{3}`, cracked ? `The steel and the deck's bars, to the ${side} flange` : `Short-term composite (n), to the ${side} flange`);
      m(`f_{f${t}}\\coloneq\\left|\\frac{M_{1${t}}}{S_{nc${t}}}+\\frac{M_{2${t}}${Mrd ? `+M_{rd${t}}` : ""}}{S_{lt${t}}}+\\frac{1.3\\cdot M_{L${t}}}{S_{st${t}}}\\right|=`, "The flange's stress", "ksi");
      if (flS > 0) given(`f_{l${t}}\\coloneq ${num(flS, 3)}\\mathrm{ksi}`, "The bottom flange's lateral bending (curvature), AASHTO 6.10.1.6");
      rhLine(k, t);
      m(ok(`f_{f${t}}${flS > 0 ? `+\\frac{f_{l${t}}}{2}` : ""}`, `0.95\\cdot R_{h${t}}\\cdot F_{yf}`), ref);
    });
  }
  if (conLeft.length) flat(conLeft, conLeft.length === conIds.length ? "Constructibility: the deck placed on the steel (AASHTO 6.10.3)" : "Constructibility: the other checks", "c", conLeft.length === conIds.length);
  if (r.windConstruction) {
    const wc = r.windConstruction;
    text("Wind during construction (AASHTO 3.4.2.1, C4.6.2.7.1)", "subheading", { keepWithNext: true });
    text(
      `Method:- Strength III on the bare steel at ${num(i.wind.construction)} mph (PZ ${num(wc.PZ, 4)} ksf): 1.25 DC1 with the deck wet, which can't yet carry the wind as a diaphragm. The fascia girder's lower half loads its bottom flange, its upper half with the haunch and the wet deck its top flange; each flange bends between the cross-frames and, with no wind bracing, with all the girders' flanges over the span: Mw = W Lb² / 10 + W L² / (8 Nb) (AASHTO Eq. C4.6.2.7.1-3).`,
      undefined,
      { keepWithNext: true },
    );
    given(`W_{ct}\\coloneq ${num(wc.Wtop, 4)}\\mathrm{klf}`, "On the top flange");
    given(`W_{cb}\\coloneq ${num(wc.Wbot, 4)}\\mathrm{klf}`, "On the bottom flange");
  }
  flat(
    [
      ["cw-yield", "Compression flange, yielding", "AASHTO Eq. 6.10.3.2.1-1"],
      ["cw-fnc", "Compression flange, buckling", "AASHTO Eq. 6.10.3.2.1-2"],
      ["cw-tension", "Tension flange", "AASHTO Eq. 6.10.3.2.2-1"],
      ["cw-fl", "Flange lateral bending", "AASHTO Eq. 6.10.1.6-1"],
    ],
    "Construction wind: the checks",
    "cw",
    false,
  );
  flat(svcLeft, svcLeft.length === 3 ? "Service II: permanent deformations (AASHTO 6.10.4.2)" : "Service II: web bend-buckling", "s", svcLeft.length === 3);
  if (i.pours.length) {
    flat(
      [
        ["pour-yield", "Flange, yielding", "AASHTO 6.10.3.4.1, Eq. 6.10.3.2.1-1"],
        ["pour-fnc", "Compression flange, buckling", "AASHTO 6.10.3.4.1, Eq. 6.10.3.2.1-2"],
        ["pour-tension", "Tension flange", "AASHTO 6.10.3.4.1, Eq. 6.10.3.2.2-1"],
      ],
      "Deck placement, pour by pour (AASHTO 6.10.3.4)",
      "p",
    );
    text(
      `Sequence:- ${[...i.pours].sort((a, b) => a.order - b.order).map((q, k) => `${k + 1}: ${num(q.from)} to ${num(q.to)} ft`).join("; ")}. Each pour's wet concrete (1.4 DC, AASHTO 3.4.2.1) on the steel where the deck is still wet and on the short-term composite section where earlier pours have hardened (AASHTO 6.10.1.1.1d); the steel's resistance and bracing (Cb = 1).`,
    );
    const pd = check("pour-deck");
    if (pd) {
      given(`f_{dk}\\coloneq ${num(pd.demand, 3)}\\mathrm{ksi}`, "The hardened deck's largest tension from the later pours, on n");
      m(`f_{r}\\coloneq0.24\\cdot\\sqrt{${num(i.fcDeck)}}\\cdot\\mathrm{ksi}=`, "AASHTO 5.4.2.6", "ksi");
      if (pd.demand <= pd.capacity) m(ok("f_{dk}", "f_{r}"), "AASHTO 6.10.3.2.4");
      else text(`Deck tension:- Above fr, so the 6.10.1.7 longitudinal bars are needed (AASHTO 6.10.3.2.4); ${i.bars.pct >= 1 ? `the deck has ${num(i.bars.pct)}%` : "provide at least 1%"}.`);
    }
  }

  // --- Appendices A6 and B6 at the interior piers ---
  if (r.b6.piers.length && (i.appendixA6 || i.redistribution)) {
    text(`Negative flexure at the piers (AASHTO Appendices A6${i.redistribution ? " and B6" : ""})`, "subheading", { newPage: true, keepWithNext: true });
    for (const q of r.b6.piers) {
      const t = `${q.pier}`;
      const failed = q.reqs.filter((x) => x.demand > x.capacity + 1e-9);
      text(
        `Pier ${t}:- Unbraced lengths ${num(q.a, 2)} to ${num(q.X, 2)} and ${num(q.X, 2)} to ${num(q.b, 2)} ft. ${i.redistribution ? (failed.length ? `Not redistributed: ${failed.map((x) => x.name).join("; ")} (AASHTO B6.2).` : "Every requirement of AASHTO B6.2.1 to B6.2.6 is met.") : ""}`,
        undefined,
        { keepWithNext: true },
      );
      given(`M_{e${t}}\\coloneq ${num(Math.abs(q.Me))}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Strength I elastic moment at the pier");
      given(`M_{yc${t}}\\coloneq ${num(q.Myc)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Yield moment, compression flange, AASHTO D6.2.3");
      given(`M_{yt${t}}\\coloneq ${num(q.Myt)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Yield moment, tension flange or the bars, whichever yields first, AASHTO D6.2.3");
      if (q.useA6) {
        given(`M_{p${t}}\\coloneq ${num(q.Mp)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Plastic moment, the steel and bars, AASHTO D6.1");
        if (q.a6.compact) {
          m(`R_{pc${t}}\\coloneq\\frac{M_{p${t}}}{M_{yc${t}}}=`, "Compact web, AASHTO Eq. A6.2.1-6");
          m(`R_{pt${t}}\\coloneq\\frac{M_{p${t}}}{M_{yt${t}}}=`, "AASHTO Eq. A6.2.1-7");
        } else if (i.Fyw < i.Fyf) {
          given(`R_{pc${t}}\\coloneq ${num(q.a6.Rpc, 3)}`, "Noncompact hybrid web, AASHTO Eq. A6.2.2-6");
          given(`R_{pt${t}}\\coloneq ${num(q.a6.Rpt, 3)}`, "AASHTO Eq. A6.2.2-7");
        } else {
          given(`\\lambda_{w${t}}\\coloneq ${num(q.a6.lw, 3)}`, "2Dc/tw");
          given(`\\lambda_{rw${t}}\\coloneq ${num(q.a6.lrw, 3)}`, "AASHTO Eq. A6.2.2-3");
          given(`\\lambda_{pw${t}}\\coloneq ${num(q.a6.lpwDc, 3)}`, "λpw(Dc), AASHTO Eq. A6.2.2-8");
          m(`R_{pc${t}}\\coloneq\\min\\left(\\frac{M_{p${t}}}{M_{yc${t}}},\\left(1-\\left(1-\\frac{M_{yc${t}}}{M_{p${t}}}\\right)\\cdot\\frac{\\lambda_{w${t}}-\\lambda_{pw${t}}}{\\lambda_{rw${t}}-\\lambda_{pw${t}}}\\right)\\cdot\\frac{M_{p${t}}}{M_{yc${t}}}\\right)=`, "Noncompact web, Rh = 1, AASHTO Eq. A6.2.2-6");
          m(`R_{pt${t}}\\coloneq\\min\\left(\\frac{M_{p${t}}}{M_{yt${t}}},\\left(1-\\left(1-\\frac{M_{yt${t}}}{M_{p${t}}}\\right)\\cdot\\frac{\\lambda_{w${t}}-\\lambda_{pw${t}}}{\\lambda_{rw${t}}-\\lambda_{pw${t}}}\\right)\\cdot\\frac{M_{p${t}}}{M_{yt${t}}}\\right)=`, "AASHTO Eq. A6.2.2-7");
        }
        given(`M_{nc${t}}\\coloneq ${num(q.a6.Mnc / 12)}\\mathrm{kip}\\cdot\\mathrm{ft}`, `By ${q.a6.governs}${q.a6.Mnc >= q.a6.Rpc * q.Myc * 12 - 1e-6 ? ", at the plateau Rpc Myc" : ""}, AASHTO A6.3`);
        m(`M_{nt${t}}\\coloneq R_{pt${t}}\\cdot M_{yt${t}}=`, "AASHTO A6.4", "kip*ft");
        m(`M_{n${t}}\\coloneq\\min\\left(M_{nc${t}},M_{nt${t}}\\right)=`, "AASHTO B6.5", "kip*ft");
      } else given(`M_{n${t}}\\coloneq ${num(q.Mn / 12)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "The smaller of Fnc Sxc and Fnt Sxt by 6.10.8, AASHTO B6.5");
      if (i.redistribution && r.b6.active && r.b6.refined && q.qualifies) {
        // B6.6: the continuity relation and the moment-rotation curve meet at the pier's plastic rotation.
        m(`b_{fc${t}}\\coloneq ${num(q.bfc)}\\mathrm{in}`);
        m(`t_{fc${t}}\\coloneq ${num(q.tfc, 3)}\\mathrm{in}`);
        m(`D_{w${t}}\\coloneq ${num(q.D)}\\mathrm{in}`);
        m(
          `\\theta_{RL${t}}\\coloneq ${q.enhanced ? "0.137" : "0.128"}-0.143\\cdot\\frac{b_{fc${t}}}{t_{fc${t}}}\\cdot\\sqrt{\\frac{F_{yf}}{E_s}}-0.0216\\cdot\\frac{D_{w${t}}}{b_{fc${t}}}+0.0241\\cdot\\frac{b_{fc${t}}}{t_{fc${t}}}\\cdot\\sqrt{\\frac{F_{yf}}{E_s}}\\cdot\\frac{D_{w${t}}}{b_{fc${t}}}=`,
          q.enhanced ? "Enhanced moment-rotation, AASHTO Eq. B6.6.2-1" : "AASHTO Eq. B6.6.2-2",
        );
        given(`k_{\\theta${t}}\\coloneq ${num(q.ktheta)}\\mathrm{kip}\\cdot\\mathrm{in}`, "Moment at the pier from a unit plastic rotation there, per radian: the short-term composite section with the deck effective throughout, AASHTO B6.6.1");
        given(`\\theta_{p${t}}\\coloneq ${num(q.byCombo.I.theta, 5)}`, "Plastic rotation, rad: continuity and the moment-rotation curve solved together at every pier, AASHTO B6.6.1");
        if (r.b6.piers.length === 1) m(`M_{c${t}}\\coloneq M_{e${t}}-k_{\\theta${t}}\\cdot\\theta_{p${t}}=`, "Continuity, the total moment at the pier", "kip*ft");
        else given(`M_{c${t}}\\coloneq ${num(q.byCombo.I.M)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Continuity, with the other piers' plastic rotations");
        m(`M_{m${t}}\\coloneq\\phi_f\\cdot M_{n${t}}\\cdot\\min\\left(0.7+60\\cdot\\theta_{p${t}},1\\right)=`, "The nominal moment-rotation curve to θRL, AASHTO Fig. B6.6.2-1", "kip*ft");
        m(`M_{rd${t}}\\coloneq M_{e${t}}-M_{c${t}}=`, "AASHTO B6.6.1", "kip*ft");
        m(ok(`\\theta_{p${t}}`, `\\theta_{RL${t}}`), "AASHTO B6.6.2");
        text(`Redistribution (refined):- The moment ${num(q.Mrd)} kip·ft at the pier, straight lines to zero at the abutments (AASHTO B6.4.2.2), is added to the elastic moments elsewhere; flexure within the unbraced lengths next to the pier isn't checked (B6.4.1.1). At Service II on the nominal curve: θp ${num(q.thetaSvc, 5)} rad, Mrd ${num(q.MrdSvc)} kip·ft (Me ${num(Math.abs(q.MeSvc))} kip·ft).`);
        const svc = r.checks.find((x) => x.id === `b6r-svc-${q.pier}`);
        if (svc) {
          given(`\\theta_{ps${t}}\\coloneq ${num(q.thetaSvc, 5)}`, "Service II plastic rotation, rad");
          m(ok(`\\theta_{ps${t}}`, `\\theta_{RL${t}}`), "AASHTO B6.6.2");
        }
        for (const c of r.combos.filter((x) => x !== "I")) {
          const b = q.byCombo[c];
          given(`\\theta_{p${c}${t}}\\coloneq ${num(b.theta, 5)}`, `Strength ${c} plastic rotation, rad (Mn less fℓ Sxc / 3, fℓ ${num(b.fl, 3)} ksi)`);
          m(ok(`\\theta_{p${c}${t}}`, `\\theta_{RL${t}}`), "AASHTO B6.6.2");
        }
      } else if (i.redistribution && r.b6.active && !r.b6.refined) {
        m(`b_{fc${t}}\\coloneq ${num(q.bfc)}\\mathrm{in}`);
        m(`t_{fc${t}}\\coloneq ${num(q.tfc, 3)}\\mathrm{in}`);
        m(`D_{w${t}}\\coloneq ${num(q.D)}\\mathrm{in}`);
        const c0 = q.enhanced ? "2.78" : "2.63";
        m(`\\lambda_{e${t}}\\coloneq\\frac{b_{fc${t}}}{t_{fc${t}}}\\cdot\\sqrt{\\frac{F_{yf}}{E_s}}=`, "The flange's slenderness term");
        m(`\\rho_{e${t}}\\coloneq${c0}-2.3\\cdot\\lambda_{e${t}}-0.35\\cdot\\frac{D_{w${t}}}{b_{fc${t}}}+0.39\\cdot\\lambda_{e${t}}\\cdot\\frac{D_{w${t}}}{b_{fc${t}}}=`, q.enhanced ? "Enhanced moment-rotation, AASHTO Eq. B6.5.1-3" : "AASHTO Eq. B6.5.2-2");
        m(`M_{pe${t}}\\coloneq\\min\\left(M_{n${t}},\\rho_{e${t}}\\cdot M_{n${t}}\\right)=`, q.enhanced ? "AASHTO Eq. B6.5.1-3" : "AASHTO Eq. B6.5.2-2", "kip*ft");
        m(`M_{rd${t}}\\coloneq\\max\\left(M_{e${t}}-\\phi_f\\cdot M_{pe${t}},0\\mathrm{kip}\\cdot\\mathrm{ft}\\right)=`, "AASHTO Eq. B6.4.2.1-1 (no flange lateral bending)", "kip*ft");
        m(ok(`M_{rd${t}}`, `0.2\\cdot M_{e${t}}`), "AASHTO Eq. B6.4.2.1-3");
        for (const c of r.combos.filter((x) => x !== "I")) {
          const b = q.byCombo[c];
          given(`M_{e${c}${t}}\\coloneq ${num(Math.abs(b.Me))}\\mathrm{kip}\\cdot\\mathrm{ft}`, `Strength ${c} elastic moment at the pier`);
          given(`M_{pe${c}${t}}\\coloneq ${num(b.Mpe / 12)}\\mathrm{kip}\\cdot\\mathrm{ft}`, `Mpe with Mn less fℓ Sxc / 3 (fℓ ${num(b.fl, 3)} ksi, the wind), AASHTO B6.5`);
          m(`M_{rd${c}${t}}\\coloneq\\max\\left(M_{e${c}${t}}-\\phi_f\\cdot M_{pe${c}${t}},0\\mathrm{kip}\\cdot\\mathrm{ft}\\right)=`, "AASHTO Eq. B6.4.2.1-1", "kip*ft");
          m(ok(`M_{rd${c}${t}}`, `0.2\\cdot M_{e${c}${t}}`), "AASHTO Eq. B6.4.2.1-3");
        }
        text(`Redistribution:- The moment ${num(q.Mrd)} kip·ft at the pier, straight lines to zero at the abutments (AASHTO B6.4.2.2), is added to the elastic moments elsewhere; flexure within the unbraced lengths next to the pier isn't checked (B6.4.1.1). At Service II the redistribution moment is ${num(q.MrdSvc)} kip·ft (Me ${num(Math.abs(q.MeSvc))}, Mpe ${num(q.Mpe.service / 12)} kip·ft, B6.3.3.1).`);
      }
    }
    const a6c = check("flex-neg-a6c");
    const sa = stationOf("flex-neg-a6c");
    if (a6c && sa) {
      text(`Elsewhere in negative flexure (Appendix A6):- ${where(sa)}.`, undefined, { keepWithNext: true });
      given(`M_{ua}\\coloneq ${num(a6c.demand)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Strength I with the redistribution moment");
      given(`M_{nca}\\coloneq ${num(a6c.capacity)}\\mathrm{kip}\\cdot\\mathrm{ft}`, `φf Mnc (${a6c.note?.split(";")[0] ?? ""})`);
      m(ok("M_{ua}", "M_{nca}"), "AASHTO Eq. A6.1.1-1");
    }
  }

  // --- Cross-frames ---
  const cfr = r.crossFrames;
  if (cfr) {
    const c = cfr.cases.reduce((b, x) => (x.req / x.act > b.req / b.act ? x : b), cfr.cases[0]);
    const cf = i.crossFrame;
    text("Cross-frames (AASHTO 6.7.4.2.2)", "subheading", { newPage: true, keepWithNext: true });
    text(`Method:- ${cf.type}-type cross-frames as torsional braces for the deck's placement on the steel (1.4 DC1, AASHTO 3.4.2.1; Cb = 1), the members single angles; ${c.full ? "at least 0.8 of the girder's depth on full-depth connection plates" : "shallower than 0.8 of the girder's depth or without full-depth plates"}. Governing: ${c.label}.`, undefined, { keepWithNext: true });
    m(`S_{cf}\\coloneq ${num(i.S * 12)}\\mathrm{in}`, "Girder spacing");
    m(`h_{b}\\coloneq ${num(cf.hb)}\\mathrm{in}`, "Between the struts' centroids");
    m(`n_{g}\\coloneq ${i.nGirders}`);
    m(`L_{cf}\\coloneq ${num(c.L)}\\mathrm{ft}`, c.label.startsWith("pier") ? "The two spans' average" : "Span");
    m(`n_{b}\\coloneq ${Math.max(1, c.n)}`, "Intermediate brace points in the span");
    given(`M_{ucf}\\coloneq ${num(c.Mu)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "1.4 DC1 on the steel, AASHTO 3.4.2.1");
    given(`I_{yeff}\\coloneq ${num(c.Iyeff)}\\mathrm{in}^{4}`, "AASHTO Eqs. 6.7.4.2.2-4, -5");
    given(`I_{xcf}\\coloneq ${num(c.Ix)}\\mathrm{in}^{4}`, "The steel section");
    m(`\\beta_{Treq}\\coloneq\\frac{${c.full ? "2.4" : "3.6"}\\cdot L_{cf}\\cdot M_{ucf}^{2}}{0.8\\cdot n_{b}\\cdot E_s\\cdot I_{yeff}}=`, c.full ? "AASHTO Eq. 6.7.4.2.2-2, φsb = 0.8" : "AASHTO Eq. 6.7.4.2.2-3, φsb = 0.8", "kip*in");
    m(`A_{d}\\coloneq0.65\\cdot${num(cfr.diag.A, 3)}\\mathrm{in}^{2}=`, `Diagonal ${cfr.diag.name}, single angle`, "in^2");
    m(`A_{st}\\coloneq0.65\\cdot${num(cfr.strut.A, 3)}\\mathrm{in}^{2}=`, `Strut ${cfr.strut.name}`, "in^2");
    m(cf.type === "X" ? "L_{d}\\coloneq\\sqrt{S_{cf}^{2}+h_{b}^{2}}=" : "L_{d}\\coloneq\\sqrt{\\left(\\frac{S_{cf}}{2}\\right)^{2}+h_{b}^{2}}=", undefined, "in");
    m(cf.type === "X" ? "\\beta_{br}\\coloneq\\frac{A_{d}\\cdot E_s\\cdot S_{cf}^{2}\\cdot h_{b}^{2}}{L_{d}^{3}}=" : "\\beta_{br}\\coloneq\\frac{2\\cdot E_s\\cdot S_{cf}^{2}\\cdot h_{b}^{2}}{\\frac{8\\cdot L_{d}^{3}}{A_{d}}+\\frac{S_{cf}^{3}}{A_{st}}}=", cf.type === "X" ? "AASHTO Eq. 6.7.4.2.2-8" : "AASHTO Eq. 6.7.4.2.2-9", "kip*in");
    m("\\beta_{g}\\coloneq\\frac{24\\cdot\\left(n_{g}-1\\right)^{2}\\cdot S_{cf}^{2}\\cdot E_s\\cdot I_{xcf}}{n_{g}\\cdot L_{cf}^{3}}=", "AASHTO Eq. 6.7.4.2.2-13", "kip*in");
    if (Number.isFinite(c.bsec)) {
      given(`\\beta_{sec}\\coloneq ${num(c.bsec)}\\mathrm{kip}\\cdot\\mathrm{in}`, "Web distortion, AASHTO Eq. 6.7.4.2.2-12");
      m("\\beta_{Tact}\\coloneq\\frac{1}{\\frac{1}{\\beta_{br}}+\\frac{1}{\\beta_{sec}}+\\frac{1}{\\beta_{g}}}=", "AASHTO Eq. 6.7.4.2.2-6", "kip*in");
    } else m("\\beta_{Tact}\\coloneq\\frac{1}{\\frac{1}{\\beta_{br}}+\\frac{1}{\\beta_{g}}}=", "βsec infinite for full-depth plates, AASHTO Eq. 6.7.4.2.2-6", "kip*in");
    m(ok("\\beta_{Treq}", "\\beta_{Tact}"), "AASHTO Eq. 6.7.4.2.2-1");
    text(`Members:- The brace moment Mbr ${num(c.Mbr, 2)} kip·in (AASHTO Eq. 6.7.4.2.2-${c.full ? "14" : "15"}) as a couple at the struts and a shear across the bay; the wind on the fascia girder's bottom half, W = PD d/2 (AASHTO C4.6.2.7.1-1), ${cfr.winds.map((w) => `${w.combination} ${num(w.W, 3)} klf`).join(", ")}, ${num(cfr.Fwind, 2)} kip at a cross-frame.`, undefined, { keepWithNext: true });
    for (const [mb, label, P] of [[cfr.strut, "st", cfr.strutForce], [cfr.diag, "dg", cfr.diagForce]] as const) {
      given(`P_{u${label}}\\coloneq ${num(P, 3)}\\mathrm{kip}`, r.grid ? (label === "st" ? "Strut: the larger of the grid's Strength I force, the deck placement's with the stability bracing's, and the wind's" : "Diagonal: the larger of the grid's Strength I force and the deck placement's with the stability bracing's") : label === "st" ? `Strut: the larger of the stability and wind forces${cfr.curve ? ", with the curvature's radial force" : ""}` : `Diagonal: the stability bracing force${cfr.curve ? ", with the curvature's shear" : ""}`);
      m(`\l_{${label}}\\coloneq ${num(mb.l)}\\mathrm{in}`, label === "st" ? "Between its connections" : "Its length");
      m(`r_{x${label}}\\coloneq ${num(mb.rx, 3)}\\mathrm{in}`, `${mb.name}, about the axis parallel to the connected leg`);
      m(`A_{${label}}\\coloneq ${num(mb.A, 3)}\\mathrm{in}^{2}`);
      m(`K_{${label}}\\coloneq\\operatorname{if}\\left(\\frac{\l_{${label}}}{r_{x${label}}}\\le80,72+0.75\\cdot\\frac{\l_{${label}}}{r_{x${label}}},32+1.25\\cdot\\frac{\l_{${label}}}{r_{x${label}}}\\right)=`, "(Kℓ/r)eff, AASHTO Eqs. 6.9.4.4-1, -2");
      m(`P_{e${label}}\\coloneq\\frac{\\pi^{2}\\cdot E_s\\cdot A_{${label}}}{K_{${label}}^{2}}=`, "AASHTO Eq. 6.9.4.1.2-1", "kip");
      m(`P_{o${label}}\\coloneq${num(i.crossFrame.Fy)}\\mathrm{ksi}\\cdot A_{${label}}=`, undefined, "kip");
      m(`P_{n${label}}\\coloneq\\operatorname{if}\\left(\\frac{P_{e${label}}}{P_{o${label}}}\\ge0.44,0.658^{\\frac{P_{o${label}}}{P_{e${label}}}}\\cdot P_{o${label}},0.877\\cdot P_{e${label}}\\right)=`, "AASHTO Eqs. 6.9.4.1.1-1, -2", "kip");
      m(ok(`P_{u${label}}`, `0.95\\cdot P_{n${label}}`), "φc = 0.95, AASHTO 6.9.2.1");
      m(ok(`\\frac{\l_{${label}}}{${num(mb.rz, 3)}\\mathrm{in}}`, r.curved ? "120" : "140"), r.curved ? "ℓ/rz, primary members (cross-frames of a curved girder, AASHTO 6.7.4.1), AASHTO 6.9.3" : "ℓ/rz, secondary members, AASHTO 6.9.3");
    }
    if (cfr.curve) {
      const cv = cfr.curve;
      text(
        `Curvature's forces (V-load approximation):- Each flange's force M/D turns through ℓ/R between cross-frames, a radial force at the struts; the girders' torques M ℓ / R are balanced by vertical shears across the cross-frames, linear in the girders' offsets from the bridge's center. Governing: ${cv.stage}, the cross-frame at ${num(cv.X, 2)} ft.`,
        undefined,
        { keepWithNext: true },
      );
      given(`M_{cv}\\coloneq ${num(Math.abs(cv.M))}\\mathrm{kip}\\cdot\\mathrm{ft}`, `${cv.stage}, per girder`);
      m(`l_{cv}\\coloneq ${num(cv.ell)}\\mathrm{ft}`, "The longer bay beside the cross-frame");
      m(`R_{cv}\\coloneq ${num(i.radius)}\\mathrm{ft}`, "Girder radius");
      const kcv = Math.max(0, r.segmentStarts.filter((x) => x <= cv.X + 1e-9).length - 1);
      given(`D_{cv}\\coloneq ${num(plates(i.segments[kcv]).D)}\\mathrm{in}`, "Web depth");
      m("P_{cv}\\coloneq\\frac{M_{cv}\\cdot l_{cv}}{R_{cv}\\cdot D_{cv}}=", "The radial force at a strut", "kip");
      given(`V_{cv}\\coloneq ${num(cv.V, 3)}\\mathrm{kip}`, `The largest bay's shear: ${i.nGirders} girders' torques by equilibrium across the cross-section`);
      m(`F_{cv}\\coloneq\\frac{V_{cv}}{2}\\cdot\\frac{L_{d}}{h_{b}}=`, "Each diagonal's share", "kip");
    }
    if (figures?.crossFrame) {
      text("Cross-frame detail", "subheading", { newPage: true, keepWithNext: true });
      text("The intermediate cross-frame between two girders, to scale across: its members, connection plates, the members' end connections and the working points.", undefined, { keepWithNext: true });
      lines.push({ region: figures.crossFrame });
    }
    // --- The members' end connections ---
    const cons = cfr.connections;
    if (cons.length) {
      const cn = i.crossFrame.connection;
      const g = cons.reduce((b, x) => (Math.max(...x.checks.map((k) => k.demand / Math.max(1e-9, k.capacity))) > Math.max(...b.checks.map((k) => k.demand / Math.max(1e-9, k.capacity))) ? x : b), cons[0]);
      text("Cross-frame connections (AASHTO 6.13)", "subheading", { newPage: !figures?.crossFrame, keepWithNext: true });
      text(
        `Method:- ${cn.kind === "bolted" ? `Each angle bolted through one leg to the connection plate with ${cn.bolts} – ${num(cn.d, 3)} in ${cn.grade} bolts in a line, pretensioned, slip-critical (AASHTO 6.13.2.1.1), holes ${cn.holes} full size` : `Each angle welded along both edges of one leg to the connection plate, 2 × ${num(cn.weld, 3)} in fillets ${num(cn.weldLength)} in long`}. The members' forces either way (the diagonals and the wind reverse)${r.curved ? "; on a curved girder the cross-frames are primary members, so the connections take the larger of the average of the force and the member's resistance, and 75% of the resistance (AASHTO 6.13.1)" : ""}. Worked: the ${g.label}; the other member's checks are listed.`,
        undefined,
        { keepWithNext: true },
      );
      given(`P_{uc}\\coloneq ${num(g.Pu, 3)}\\mathrm{kip}`, `The ${g.label}'s design force`);
      m(`F_{uc}\\coloneq ${num(cn.Fu)}\\mathrm{ksi}`, "Tensile strength of the angles and plate, AASHTO Table 6.4.1-1");
      m(`A_{gc}\\coloneq ${num(g.a.A, 3)}\\mathrm{in}^{2}`, `${g.a.name}`);
      m(`t_{ac}\\coloneq ${num(g.a.t, 3)}\\mathrm{in}`, "Angle leg");
      const worked = new Set<number>();
      const idx = (start: string) => g.checks.findIndex((k) => k.name.startsWith(start));
      if (cn.kind === "bolted") {
        m(`d_{b}\\coloneq ${num(cn.d, 3)}\\mathrm{in}`);
        m(`n_{bt}\\coloneq ${cn.bolts}`, "Bolts in the line");
        m("A_{bt}\\coloneq\\frac{\\pi\\cdot d_{b}^{2}}{4}=", undefined, "in^2");
        m(`F_{ub}\\coloneq ${cn.grade === "A490" ? 150 : 120}\\mathrm{ksi}`, `ASTM F3125 Grade ${cn.grade}, AASHTO Table 6.4.3.1.1-1`);
        m(`R_{ns}\\coloneq${cn.threads === "excluded" ? "0.56" : "0.45"}\\cdot A_{bt}\\cdot F_{ub}=`, `One shear plane, threads ${cn.threads}, AASHTO Eq. 6.13.2.7-${cn.threads === "excluded" ? "1" : "2"}`, "kip");
        m(ok("P_{uc}", "0.80\\cdot n_{bt}\\cdot R_{ns}"), "φs = 0.80, AASHTO 6.5.4.2");
        worked.add(idx("bolts in shear"));
        m(`t_{pc}\\coloneq\\min\\left(t_{ac},${num(cn.plateT, 3)}\\mathrm{in}\\right)=`, "The thinner ply", "in");
        m(`d_{hc}\\coloneq ${num(cn.d + (cn.d >= 1 ? 0.125 : 0.0625), 4)}\\mathrm{in}`, "Standard hole, AASHTO Table 6.13.2.4.2-1");
        m(`L_{ce}\\coloneq ${num(cn.edge, 3)}\\mathrm{in}-\\frac{d_{hc}}{2}=`, "Clear end distance", "in");
        m(`L_{cs}\\coloneq ${num(cn.spacing, 3)}\\mathrm{in}-d_{hc}=`, "Clear spacing", "in");
        m("R_{nbe}\\coloneq\\min\\left(1.2\\cdot L_{ce}\\cdot t_{pc}\\cdot F_{uc},2.4\\cdot d_{b}\\cdot t_{pc}\\cdot F_{uc}\\right)=", "The end bolt, AASHTO Eqs. 6.13.2.9-1, -2", "kip");
        m("R_{nbi}\\coloneq\\min\\left(1.2\\cdot L_{cs}\\cdot t_{pc}\\cdot F_{uc},2.4\\cdot d_{b}\\cdot t_{pc}\\cdot F_{uc}\\right)=", "Each other bolt", "kip");
        m("R_{nb}\\coloneq R_{nbe}+\\left(n_{bt}-1\\right)\\cdot R_{nbi}=", "AASHTO 6.13.2.9", "kip");
        m(ok("P_{uc}", "0.80\\cdot R_{nb}"), "φbb = 0.80, AASHTO 6.5.4.2");
        worked.add(idx("bearing at the bolt holes"));
        given(`P_{sc}\\coloneq ${num(g.Ps, 3)}\\mathrm{kip}`, cn.serviceForce > 0 ? "Service II force, as given from a refined analysis" : "Service II: the deck placement's unfactored force (the line girder gives the cross-frames no live load force)");
        m(`R_{sl}\\coloneq n_{bt}\\cdot ${num({ A: 0.3, B: 0.5, C: 0.3 }[cn.surface], 2)}\\cdot${num(g.Pt)}\\mathrm{kip}=`, `Kh 1.0, Ks for a Class ${cn.surface} surface, Pt, AASHTO Eq. 6.13.2.8-1, Tables 6.13.2.8-1, -3`, "kip");
        m(ok("P_{sc}", "R_{sl}"), "AASHTO Eq. 6.13.2.2-1");
        worked.add(idx("slip at Service II"));
        m("A_{nc}\\coloneq A_{gc}-d_{hc}\\cdot t_{ac}=", "The hole's nominal diameter, AASHTO 6.8.3", "in^2");
      } else {
        m(`w_{c}\\coloneq ${num(cn.weld, 3)}\\mathrm{in}`, "Fillet size");
        m(`L_{w}\\coloneq ${num(cn.weldLength, 3)}\\mathrm{in}`, "Each of the two welds");
        m("R_{w}\\coloneq2\\cdot0.6\\cdot0.80\\cdot70\\mathrm{ksi}\\cdot0.707\\cdot w_{c}\\cdot L_{w}=", "E70 electrodes, φe2 = 0.80, AASHTO Eq. 6.13.3.2.4b-1", "kip");
        m(ok("P_{uc}", "R_{w}"), "AASHTO 6.13.3.2.4b");
        worked.add(idx("fillet welds"));
        m("A_{nc}\\coloneq A_{gc}=", "No holes", "in^2");
      }
      given(`U_{c}\\coloneq ${num(g.U, 3)}`, "Shear lag, the larger of 1 − x̄/L and the single-angle value, AASHTO Table 6.8.2.2-1");
      const ti = idx(`${g.a.name} in tension`);
      if (ti >= 0) {
        m(`P_{rt}\\coloneq\\min\\left(0.95\\cdot${num(i.crossFrame.Fy)}\\mathrm{ksi}\\cdot A_{gc},0.80\\cdot F_{uc}\\cdot A_{nc}\\cdot ${cn.kind === "bolted" && cn.holes === "punched" ? "0.9" : "1.0"}\\cdot U_{c}\\right)=`, "AASHTO Eqs. 6.8.2.1-1, -2", "kip");
        m(ok("P_{uc}", "P_{rt}"), "The member in tension");
        worked.add(ti);
      }
      const bi = idx("block shear");
      given(`R_{bs}\\coloneq ${num(g.Rblock, 3)}\\mathrm{kip}`, cn.kind === "bolted" ? "0.80 Rp (0.58 Fu Avn + Fu Atn) ≤ 0.80 Rp (0.58 Fy Avg + Fu Atn): shear along the bolt line to the end, tension to the leg's toe, AASHTO Eq. 6.13.4-1" : "The plate along the two welds and across the leg, AASHTO Eq. 6.13.4-1");
      m(ok("P_{uc}", "R_{bs}"), "AASHTO 6.13.4");
      worked.add(bi);
      if (g.fatigue) {
        given(`\\Delta_{Pc}\\coloneq ${num(cn.fatigueRange, 3)}\\mathrm{kip}`, "The member's force range under the fatigue truck, from a refined analysis");
        m("\\Delta_{fc}\\coloneq\\frac{\\Delta_{Pc}}{U_{c}\\cdot A_{gc}}=", "AASHTO 6.6.1.2.3 (slip-critical: on the gross section with shear lag)", "ksi");
        given(`\\Delta_{Fc}\\coloneq ${num(g.fatigue.Fn, 3)}\\mathrm{ksi}`, `Category ${g.fatigue.cat}, ${g.fatigue.combo}, ${i.S > 20 ? 1 : 2} cycles per truck (transverse members, AASHTO Table 6.6.1.2.5-2)`);
        m(ok(`0.65\\cdot${num(g.fatigue.gamma / 0.65, 2)}\\cdot\\Delta_{fc}`, "\\Delta_{Fc}"), "AASHTO Eq. 6.6.1.2.2-1; the live load factor times 0.65 for cross-frames, AASHTO 3.4.5");
        worked.add(idx("fatigue"));
      }
      const rest = [...cons.filter((x) => x !== g).flatMap((x) => x.checks.map((k) => ({ ...k, label: x.label }))), ...g.checks.filter((_, n) => !worked.has(n)).map((k) => ({ ...k, label: g.label }))];
      rest.forEach((k, n) => {
        text(`${k.label[0].toUpperCase()}${k.label.slice(1)}, ${k.name}:-`, undefined, { keepWithNext: true });
        given(`f_{k${n + 1}}\\coloneq ${num(k.demand, 3)}${unitTex(k.unit === "bolts" ? "" : k.unit)}`, "Demand");
        given(`F_{k${n + 1}}\\coloneq ${num(k.capacity, 3)}${unitTex(k.unit === "bolts" ? "" : k.unit)}`, "Resistance or limit");
        m(ok(`f_{k${n + 1}}`, `F_{k${n + 1}}`), k.ref);
      });
    }
  }

  // --- Strength III and V: the wind on the exterior girder's bottom flange; and the curvature's flange bending ---
  if (r.combos.length > 1 || r.curved) {
    text(r.combos.length > 1 ? `Flange lateral bending: ${r.combos.length > 1 ? "the wind at Strength III and V" : ""}${r.curved ? " and curvature" : ""} (AASHTO 6.10.1.6)` : "Flange lateral bending: curvature (AASHTO 6.10.1.6)", "subheading", { newPage: true, keepWithNext: true });
    if (r.combos.length > 1) {
      const sw = stationOf("s5-fl") ?? stationOf("s3-fl");
      const p = plates(i.segments[sw ? sw.seg : 0]);
      const lb = (() => {
        if (!sw) return r.crossFrames?.LbMax ?? 0;
        const b = r.braces;
        let a = 0;
        while (a + 1 < b.length && b[a + 1] <= sw.X + 1e-9) a++;
        return Math.max(b[Math.min(a + 1, b.length - 1)] - b[a], a > 0 && Math.abs(b[a] - sw.X) < 1e-6 ? b[a] - b[a - 1] : 0);
      })();
      text(`Method:- The wind on the lower half of the fascia girder is carried by its bottom flange to the cross-frames (AASHTO 4.6.2.7.1); Strength III ${r.windW.III > 0 ? `at the site's ${num(i.wind.V)} mph` : "not considered (no design wind speed given)"}, Strength V at 80 mph (AASHTO Table 3.8.1.1.2-1), WS factor 1.0, live load 1.35 at Strength V; the redistribution moments recomputed with Mn less fℓ Sxc / 3.${sw ? ` Worked at ${where(sw)}.` : ""}`, undefined, { keepWithNext: true });
      for (const c of ["III", "V"] as const) {
        if (!(r.windW[c] > 0)) continue;
        given(`W_{${c}}\\coloneq ${num(r.windW[c], 4)}\\mathrm{klf}`, `η γ PD d / 2 with PD ${num((2 * r.windW[c]) / i.eta / (r.crossFrames?.depthFt ?? 1), 4)} ksf (AASHTO 3.8.1.2) on the girder's depth, AASHTO Eq. C4.6.2.7.1-1`);
        m(`L_{bw${c}}\\coloneq ${num(lb)}\\mathrm{ft}`, "Unbraced length");
        m(`M_{w${c}}\\coloneq\\frac{W_{${c}}\\cdot L_{bw${c}}^{2}}{10}=`, "AASHTO Eq. C4.6.2.7.1-2", "kip*ft");
        m(`f_{lw${c}}\\coloneq\\frac{6\\cdot M_{w${c}}}{${num(p.bottom.t, 3)}\\mathrm{in}\\cdot\\left(${num(p.bottom.b, 3)}\\mathrm{in}\\right)^{2}}=`, "On the bottom flange's lateral section modulus tf bf² / 6", "ksi");
      }
    }
    if (r.curved) {
      const sc = stationOf("flex-pos") ?? stationOf("flex-pos-t");
      if (sc) {
        const p = plates(i.segments[sc.seg]);
        const b = r.braces;
        let a = 0;
        while (a + 1 < b.length && b[a + 1] <= sc.X + 1e-9) a++;
        const ell = b[Math.min(a + 1, b.length - 1)] - b[a];
        text(`Curvature:- The girder of radius ${num(i.radius)} ft is analyzed straight on its arc spans (AASHTO 4.6.1.2.4b, its limits checked below); the flanges' lateral bending by Eq. C4.6.1.2.4b-1 with N = 10. Worked at ${where(sc)}, Strength I.`, undefined, { keepWithNext: true });
        given(`M_{lc}\\coloneq ${num(sc.Mpos)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Strength I major-axis moment");
        m(`l_{lc}\\coloneq ${num(ell)}\\mathrm{ft}`, "Unbraced length");
        m(`R_{lc}\\coloneq ${num(i.radius)}\\mathrm{ft}`);
        m(`D_{lc}\\coloneq ${num(p.D)}\\mathrm{in}`);
        m("M_{lat}\\coloneq\\frac{M_{lc}\\cdot l_{lc}^{2}}{10\\cdot R_{lc}\\cdot D_{lc}}=", "AASHTO Eq. C4.6.1.2.4b-1", "kip*ft");
        m(`f_{lc}\\coloneq\\frac{6\\cdot M_{lat}}{${num(p.bottom.t, 3)}\\mathrm{in}\\cdot\\left(${num(p.bottom.b, 3)}\\mathrm{in}\\right)^{2}}=`, "The bottom flange", "ksi");
      }
    }
    const ids: [string, string, string][] = [];
    if (r.curved) {
      r.spans.forEach((_, j) => ids.push([`curve-span-${j}`, `Curvature limit, span ${j + 1}`, "AASHTO 4.6.1.2.4b"]));
      ids.push(["curve-skew", "Curvature, skew of the bearing lines", "AASHTO 4.6.1.2.4b"]);
      ids.push(["flex-fl", "Strength I, fℓ ≤ 0.6 Fyf", "AASHTO Eq. 6.10.1.6-1"]);
    }
    for (const [pre, c] of [["s3", "III"], ["s5", "V"]] as const) {
      ids.push([`${pre}-pos`, `Strength ${c}, positive flexure, Mu + fℓ Sxt / 3`, "AASHTO Eq. 6.10.7.1.1-1"]);
      ids.push([`${pre}-pos-c`, `Strength ${c}, positive flexure, compression flange`, "AASHTO Eq. 6.10.7.2.1-1"]);
      ids.push([`${pre}-pos-t`, `Strength ${c}, positive flexure, tension flange`, "AASHTO Eq. 6.10.7.2.1-2"]);
      ids.push([`${pre}-neg-c`, `Strength ${c}, negative flexure, bottom flange fbu + fℓ/3`, "AASHTO Eq. 6.10.8.1.1-1"]);
      ids.push([`${pre}-neg-t`, `Strength ${c}, negative flexure, top flange`, "AASHTO Eq. 6.10.8.1.3-1"]);
      ids.push([`${pre}-neg-a6c`, `Strength ${c}, Appendix A6, Mu + fℓ Sxc / 3`, "AASHTO Eq. A6.1.1-1"]);
      ids.push([`${pre}-neg-a6t`, `Strength ${c}, Appendix A6, tension flange`, "AASHTO Eq. A6.1.4-1"]);
      ids.push([`${pre}-fl`, `Strength ${c}, fℓ ≤ 0.6 Fyf`, "AASHTO Eq. 6.10.1.6-1"]);
    }
    flat(ids, "Checks with flange lateral bending", "w", false);
  }

  // --- End cross-frames at the abutments (6.7.4.2) ---
  if (r.endFrames) {
    const efr = r.endFrames;
    const ef = i.endFrame;
    text("End cross-frames at the abutments (AASHTO 6.7.4.2)", "subheading", { newPage: true, keepWithNext: true });
    text(
      `Method:- ${ef.type}-type frames of single angles on the bearing stiffeners, at both abutments. They brace the girders' ends while the deck is placed (the stability bracing's stiffness and strength of AASHTO 6.7.4.2.2 for the end span, 1.4 DC1 by AASHTO 3.4.2.1) and carry the lateral loads to the bearings (AASHTO 6.7.4.2.1): ${efr.abutment === "seat" ? "on this seat abutment, the construction wind and the design wind at Strength III and V" : `at this ${efr.abutment} abutment, the construction wind only, as the concrete end diaphragm cast with the deck then carries the deck's edge and the lateral loads (CDOT BDM 11.3)`}. The lateral reaction enters at the fascia girder and is shared by the bearings: the first bay takes (Nb − 1)/Nb of it.`,
      undefined,
      { keepWithNext: true },
    );
    if (figures?.endFrame) lines.push({ region: figures.endFrame });
    efr.ends.forEach((e, q) => {
      const t = `e${q + 1}`;
      text(`${e.label[0].toUpperCase()}${e.label.slice(1)}:- span ${e.span + 1}'s deck placement.`, undefined, { keepWithNext: true });
      m(`h_{b${t}}\\coloneq ${num((r.endFrames?.frame.hb ?? ef.hb))}\\mathrm{in}`, "Between the struts' working points");
      given(`d_{g${t}}\\coloneq ${num(e.depth, 3)}\\mathrm{in}`, "The girder's depth at the abutment");
      m(ok(`${i.segments[e.seg].kind === "rolled" ? "0.5" : "0.75"}\\cdot d_{g${t}}`, `h_{b${t}}`), "AASHTO 6.7.4.2.1");
      given(`M_{u${t}}\\coloneq ${num(e.Mu)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "1.4 DC1 on the steel, the end span's largest, AASHTO 3.4.2.1");
      given(`\\beta_{Treq${t}}\\coloneq ${num(e.req, 0)}\\mathrm{kip}\\cdot\\mathrm{in}`, `Required stiffness, AASHTO Eq. 6.7.4.2.2-2 (${e.full ? "2.4" : "3.6"}), per radian`);
      given(`\\beta_{Tact${t}}\\coloneq ${num(e.act, 0)}\\mathrm{kip}\\cdot\\mathrm{in}`, "The brace system's stiffness, AASHTO Eqs. 6.7.4.2.2-6 to -13, per radian");
      m(ok(`\\beta_{Treq${t}}`, `\\beta_{Tact${t}}`), "AASHTO 6.7.4.2.2");
      if (e.Hc > 0) given(`H_{c${t}}\\coloneq ${num(e.Hc, 3)}\\mathrm{kip}`, "The construction wind's reaction at the bearing line, half the end span, Strength III with the deck wet");
      e.finals.forEach((f, n) => given(`H_{f${n}${t}}\\coloneq ${num(f.H, 3)}\\mathrm{kip}`, `${f.c}: the design wind on the superstructure's depth, half the end span`));
      given(`P_{us${t}}\\coloneq ${num(e.strutForce, 3)}\\mathrm{kip}`, `Strut: the stability bracing's force (${num(e.Fstrut, 2)} kip), with ${num(e.share, 3)} of the lateral reaction`);
      given(`P_{rs${t}}\\coloneq ${num(Math.min(e.strut.Pr, e.strut.Pt), 3)}\\mathrm{kip}`, `${e.strut.name}, single angle, AASHTO 6.9.4.4 (compression) and 6.8.2.1 (tension), the smaller`);
      m(ok(`P_{us${t}}`, `P_{rs${t}}`), "AASHTO 6.7.4.2.1");
      given(`P_{ud${t}}\\coloneq ${num(e.diagForce, 3)}\\mathrm{kip}`, `Diagonal: the stability bracing's force (${num(e.Fdiag, 2)} kip), with the lateral reaction's share`);
      given(`P_{rd${t}}\\coloneq ${num(Math.min(e.diag.Pr, e.diag.Pt), 3)}\\mathrm{kip}`, `${e.diag.name}, ${num(e.diag.l, 2)} in long`);
      m(ok(`P_{ud${t}}`, `P_{rd${t}}`), "AASHTO 6.7.4.2.1");
    });
    const others = r.checks.filter((c) => /^ef(c|-sl)/.test(c.id));
    if (others.length) {
      text("Slenderness and the members' end connections (AASHTO 6.9.3, 6.13):", "note", { keepWithNext: true });
      others.forEach((c, k) => {
        const tag = `ye${k + 1}`;
        text(`${c.name}:-`, undefined, { keepWithNext: true });
        given(`f_{${tag}}\\coloneq ${num(c.demand, 3)}${unitTex(c.unit)}`);
        given(`F_{${tag}}\\coloneq ${num(c.capacity, 3)}${unitTex(c.unit)}`);
        m(ok(`f_{${tag}}`, `F_{${tag}}`), c.ref);
      });
    }
  }

  // --- Sole plates and anchor bolts (14.8) ---
  if (r.soles && r.soles.supports.length) {
    const so = i.sole;
    text("Sole plates and anchor bolts at the bearings (AASHTO 14.8)", "subheading", { newPage: true, keepWithNext: true });
    text(
      `Method:- Each bearing's sole plate is 2 in longer than the bearing (CDOT BDM 14.5.7) and at least 3/4 in at its thin edge, thick enough to carry the bearing's pressure as a cantilever past the flange, and beveled where the girder's underside slopes more than 0.01 rad under the full permanent load with the ${num(so.grade)}% grade (AASHTO 14.8.2). It's welded to the flange, and anchor bolts through it carry the horizontal forces into the seat (AASHTO 14.8.1, 14.8.3): the design wind across (Strength III, or V with the wind on the live load), braking along at the fixed bearings (AASHTO 3.6.4)${so.AS > 0 ? `, and Zone 1's connection force, ${num(connectionFactor(so.AS), 2)} of the permanent reaction (AASHTO 3.10.9.2, AS = ${num(so.AS, 3)})` : ""}. The concrete's shear breakout and pryout follow ACI 318 Chapter 17 (AASHTO 5.13).`,
      undefined,
      { keepWithNext: true },
    );
    r.soles.supports.forEach((s, q) => {
      const t = `s${q + 1}`;
      if (figures?.soles?.[q] && (q === r.soles!.supports.findIndex((x) => x.fixed === s.fixed))) lines.push({ region: figures.soles[q] });
      text(`${s.label[0].toUpperCase()}${s.label.slice(1)} (${s.fixed ? "fixed" : "expansion"}):- plate ${num(s.L)} × ${num(s.W)} in${s.tapered ? `, beveled ${num(s.tThin, 3)} to ${num(s.tThick, 3)} in` : `, ${num(s.tThin, 3)} in`}${s.n ? `; ${s.n} anchor bolts of ${num(s.d, 3)} in` : ""}.`, undefined, { keepWithNext: true });
      given(`R_{u${t}}\\coloneq ${num(s.Ru)}\\mathrm{kip}`, "Strength I reaction per bearing");
      m(`q_{${t}}\\coloneq\\frac{R_{u${t}}}{${num(so.padL)}\\mathrm{in}\\cdot ${num(so.padW)}\\mathrm{in}}=`, "The bearing's pressure", "ksi");
      m(`c_{${t}}\\coloneq ${num(s.c, 3)}\\mathrm{in}`, "The plate past the flange's edge, over the bearing");
      m(`t_{b${t}}\\coloneq\\sqrt{\\frac{4\\cdot q_{${t}}\\cdot c_{${t}}^{2}}{2\\cdot 1.0\\cdot ${num(so.Fy)}\\mathrm{ksi}}}=`, "Plate bending, φf 1.0", "in");
      m(ok(`\\max\\left(0.75\\mathrm{in},t_{b${t}}\\right)`, `${num(s.tThin, 4)}\\mathrm{in}`), "The thin edge, CDOT BDM 14.5.7");
      given(`\\theta_{${t}}\\coloneq ${num(s.slope, 4)}`, "The girder's underside slope, rad: its end rotation under the permanent load and the grade");
      if (s.tapered) m(`t_{k${t}}\\coloneq ${num(s.tThin, 4)}\\mathrm{in}+\\theta_{${t}}\\cdot ${num(s.L)}\\mathrm{in}=`, "Beveled to level the bearing, AASHTO 14.8.2", "in");
      given(`H_{${t}}\\coloneq ${num(s.H, 3)}\\mathrm{kip}`, `Horizontal: across ${num(s.across, 2)} kip${s.fixed ? `, along ${num(s.along, 2)} kip` : ""}, the larger of the wind${s.fixed ? ", braking" : ""} and the connection force each way`);
      m(`R_{w${t}}\\coloneq2\\cdot ${num(s.L)}\\mathrm{in}\\cdot 0.6\\cdot 0.80\\cdot 70\\mathrm{ksi}\\cdot 0.707\\cdot ${num(so.weld, 4)}\\mathrm{in}=`, "Two fillet welds along the flange, AASHTO Eq. 6.13.3.2.4b-1", "kip");
      m(ok(`H_{${t}}`, `R_{w${t}}`), "AASHTO 14.8.1");
      const rest = s.checks.filter((c) => /anchor|breakout|pryout|edge distance/.test(c.name));
      rest.forEach((c, k) => {
        const tag = `z${t}${k + 1}`;
        text(`${c.name}:-`, undefined, { keepWithNext: true });
        given(`f_{${tag}}\\coloneq ${num(c.demand, 3)}${unitTex(c.unit)}`);
        given(`F_{${tag}}\\coloneq ${num(c.capacity, 3)}${unitTex(c.unit)}`);
        m(ok(`f_{${tag}}`, `F_{${tag}}`), c.ref);
      });
    });
  }

  // --- Bolted field splices (6.13.6.1.3) ---
  r.splices.forEach((sp, q) => {
    const si = i.splice;
    const t = `${q + 1}`;
    const Fub = si.grade === "A490" ? 150 : 120;
    const Ks = ({ A: 0.3, B: 0.5, C: 0.3 } as const)[si.surface];
    const fullRn = (threads: "excluded" | "included") => (threads === "excluded" ? 0.56 : 0.45) * ((Math.PI * si.d ** 2) / 4) * Fub * 2;
    text(`Field splice at ${num(sp.X, 2)} ft (AASHTO 6.13.6.1.3)`, "subheading", { newPage: true, keepWithNext: true });
    text(
      `Method:- Slip-critical bolted splice, ${num(si.d, 3)} in ASTM F3125 ${si.grade} bolts in standard holes, Class ${si.surface} surfaces; each flange by an outer plate and two inner plates (double shear), the web by a plate each side. The flanges designed for the smaller design yield resistance of the flanges either side, Pfy = Fyf Ae; the web for the smaller factored shear resistance of the web, with any moment the flanges can't carry; slip checked at Service II and while the deck is cast.`,
      undefined,
      { keepWithNext: true },
    );
    if (figures?.splices?.[q]) lines.push({ region: figures.splices[q] });
    m(`d_{b${t}}\\coloneq ${num(si.d, 3)}\\mathrm{in}`, "Bolt diameter");
    m(`d_{h${t}}\\coloneq ${num(si.d + (si.d >= 1 ? 0.125 : 0.0625), 4)}\\mathrm{in}`, "Standard hole, AASHTO Table 6.13.2.4.2-1; its width in the net area, AASHTO 6.8.3");
    m(`F_{ub${t}}\\coloneq ${Fub}\\mathrm{ksi}`, "AASHTO Table 6.4.3.1.1-1");
    m(`A_{b${t}}\\coloneq\\frac{\\pi\\cdot d_{b${t}}^{2}}{4}=`, undefined, "in^2");
    for (const fl of [sp.bottom, sp.top]) {
      const g = `${fl.which === "top" ? "t" : "b"}${t}`;
      text(`${fl.which === "top" ? "Top" : "Bottom"} flange:- ${num(fl.b)} in wide, ${num(fl.t1, 3)} in thick on the thinner side${fl.t2 !== fl.t1 ? ` (${num(fl.t2, 3)} in on the other)` : ""}; ${fl.nAcross} bolts across, ${fl.rows} rows each side.`, undefined, { keepWithNext: true });
      m(`b_{f${g}}\\coloneq ${num(fl.b)}\\mathrm{in}`);
      m(`t_{f${g}}\\coloneq ${num(fl.t1, 4)}\\mathrm{in}`);
      m(`F_{uf${g}}\\coloneq ${num(fuOf(i.Fyf))}\\mathrm{ksi}`, "AASHTO Table 6.4.1-1");
      m(`A_{g${g}}\\coloneq b_{f${g}}\\cdot t_{f${g}}=`, undefined, "in^2");
      m(`A_{n${g}}\\coloneq\\left(b_{f${g}}-${fl.nAcross}\\cdot d_{h${t}}\\right)\\cdot t_{f${g}}=`, "AASHTO 6.8.3", "in^2");
      m(`A_{e${g}}\\coloneq\\min\\left(\\frac{0.80\\cdot F_{uf${g}}}{0.95\\cdot F_{yf}}\\cdot A_{n${g}},A_{g${g}}\\right)=`, "AASHTO Eq. 6.13.6.1.3b-2", "in^2");
      m(`P_{fy${g}}\\coloneq F_{yf}\\cdot A_{e${g}}=`, "AASHTO Eq. 6.13.6.1.3b-1", "kip");
      m(`R_{n${g}}\\coloneq${fl.Rn < fullRn(si.threadsFlange) - 1e-6 ? "0.83\\cdot " : ""}${si.threadsFlange === "excluded" ? "0.56" : "0.45"}\\cdot A_{b${t}}\\cdot F_{ub${t}}\\cdot 2=`, `One bolt, two shear planes, threads ${si.threadsFlange}, AASHTO Eqs. 6.13.2.7-1, -2`, "kip");
      if (fl.R < 1) {
        m(`\\gamma_{${g}}\\coloneq\\frac{${num(fl.filler, 4)}\\mathrm{in}\\cdot b_{f${g}}}{\\min\\left(A_{g${g}},${num(fl.outer.b * fl.outer.t + 2 * fl.inner.b * fl.inner.t, 4)}\\mathrm{in}^{2}\\right)}=`, `The ${num(fl.filler, 4)} in filler against the smaller of the flange and the splice plates`);
        m(`R_{${g}}\\coloneq\\frac{1+\\gamma_{${g}}}{1+2\\cdot\\gamma_{${g}}}=`, "Undeveloped fillers, AASHTO Eq. 6.13.6.1.4-1");
      } else m(`R_{${g}}\\coloneq1`, fl.filler ? "Filler under 1/4 in, AASHTO 6.13.6.1.4" : "No filler");
      m(`N_{${g}}\\coloneq ${fl.n}`, `Bolts each side: ${fl.rows} rows of ${fl.nAcross}`);
      m(ok(`P_{fy${g}}`, `0.80\\cdot R_{${g}}\\cdot R_{n${g}}\\cdot N_{${g}}`), "Bolts in shear, AASHTO 6.13.6.1.3b");
      m(`A_{sp${g}}\\coloneq ${num(fl.outer.b)}\\mathrm{in}\\cdot ${num(fl.outer.t, 4)}\\mathrm{in}+2\\cdot ${num(fl.inner.b)}\\mathrm{in}\\cdot ${num(fl.inner.t, 4)}\\mathrm{in}=`, "The outer and two inner splice plates", "in^2");
      m(ok(`P_{fy${g}}`, `0.95\\cdot ${num(si.Fy)}\\mathrm{ksi}\\cdot A_{sp${g}}`), "Splice plates, gross yielding, AASHTO 6.13.5.2");
    }
    text(`Flanges' moment resistance:- composite in positive flexure, Pfy of the bottom flange × ${num(sp.arms.pos, 2)} in to the deck's mid-thickness; otherwise the smaller Pfy × ${num(sp.arms.neg, 2)} in between the flanges' mid-thicknesses (AASHTO 6.13.6.1.3b).`, undefined, { keepWithNext: true });
    given(`M_{up${t}}\\coloneq ${num(sp.forces.MuPos)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Strength I, positive, at the splice");
    given(`M_{un${t}}\\coloneq ${num(Math.abs(sp.forces.MuNeg))}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Strength I, negative");
    m(`M_{fp${t}}\\coloneq P_{fyb${t}}\\cdot ${num(sp.arms.pos, 3)}\\mathrm{in}=`, undefined, "kip*ft");
    m(`M_{fn${t}}\\coloneq\\min\\left(P_{fyt${t}},P_{fyb${t}}\\right)\\cdot ${num(sp.arms.neg, 3)}\\mathrm{in}=`, undefined, "kip*ft");
    m(`H_{wp${t}}\\coloneq\\frac{\\max\\left(0\\mathrm{kip}\\cdot\\mathrm{ft},M_{up${t}}-M_{fp${t}}\\right)}{${num(sp.arms.webPos, 3)}\\mathrm{in}}=`, "Positive: the arm from the web's mid-depth to the deck's, AASHTO 6.13.6.1.3c", "kip");
    m(`H_{wn${t}}\\coloneq\\frac{\\max\\left(0\\mathrm{kip}\\cdot\\mathrm{ft},M_{un${t}}-M_{fn${t}}\\right)}{${num(sp.arms.webNeg, 3)}\\mathrm{in}}=`, "Negative: the arm D/4, AASHTO 6.13.6.1.3c", "kip");
    m(`H_{w${t}}\\coloneq\\max\\left(H_{wp${t}},H_{wn${t}}\\right)=`, "The web's horizontal force", "kip");
    text("Slip:- the flange bolts' nominal slip resistance times the same arms gives the moment for slip; the rest goes to the web (AASHTO 6.13.6.1.3b, c).", undefined, { keepWithNext: true });
    m(`P_{t${t}}\\coloneq ${num(sp.bottom.Rslip / (2 * Ks))}\\mathrm{kip}`, "Minimum bolt tension, AASHTO Table 6.13.2.8-1");
    m(`R_{s${t}}\\coloneq1.0\\cdot ${Ks}\\cdot 2\\cdot P_{t${t}}=`, "One bolt, two slip planes, Kh 1, AASHTO Eq. 6.13.2.8-1", "kip");
    given(`M_{sp${t}}\\coloneq ${num(sp.forces.MsPos)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Service II, positive");
    given(`M_{sn${t}}\\coloneq ${num(Math.max(Math.abs(sp.forces.MsNeg), Math.abs(sp.forces.Mdeck)))}\\mathrm{kip}\\cdot\\mathrm{ft}`, "Service II negative, or the deck's casting (1.4 DC on the steel), the larger");
    m(`M_{slp${t}}\\coloneq N_{b${t}}\\cdot R_{s${t}}\\cdot ${num(sp.arms.pos, 3)}\\mathrm{in}=`, "The flange bolts' slip resistance, positive", "kip*ft");
    m(`M_{sln${t}}\\coloneq\\min\\left(N_{t${t}},N_{b${t}}\\right)\\cdot R_{s${t}}\\cdot ${num(sp.arms.neg, 3)}\\mathrm{in}=`, "Negative, and the deck's casting", "kip*ft");
    m(`H_{wsp${t}}\\coloneq\\frac{\\max\\left(0\\mathrm{kip}\\cdot\\mathrm{ft},M_{sp${t}}-M_{slp${t}}\\right)}{${num(sp.arms.webPos, 3)}\\mathrm{in}}=`, undefined, "kip");
    m(`H_{wsn${t}}\\coloneq\\frac{\\max\\left(0\\mathrm{kip}\\cdot\\mathrm{ft},M_{sn${t}}-M_{sln${t}}\\right)}{${num(sp.arms.webNeg, 3)}\\mathrm{in}}=`, undefined, "kip");
    m(`H_{ws${t}}\\coloneq\\max\\left(H_{wsp${t}},H_{wsn${t}}\\right)=`, "The web's horizontal force for slip", "kip");
    text(`Web:- 2 plates ${num(sp.web.plate.t, 4)} × ${num(sp.web.plate.h)} in, ${sp.web.cols} lines of ${sp.web.perCol} bolts each side.`, undefined, { keepWithNext: true });
    given(`V_{r${t}}\\coloneq ${num(sp.forces.Vr)}\\mathrm{kip}`, "The smaller factored shear resistance of the web either side, AASHTO 6.10.9");
    given(`V_{s${t}}\\coloneq ${num(Math.max(sp.forces.Vs, Math.abs(sp.forces.Vdeck)))}\\mathrm{kip}`, "Service II, or the deck's casting, the larger");
    m(`N_{w${t}}\\coloneq ${sp.web.n}`, "Web bolts each side");
    m(`R_{nw${t}}\\coloneq${sp.web.Rn < fullRn(si.threadsWeb) - 1e-6 ? "0.83\\cdot " : ""}${si.threadsWeb === "excluded" ? "0.56" : "0.45"}\\cdot A_{b${t}}\\cdot F_{ub${t}}\\cdot 2=`, `Threads ${si.threadsWeb}, AASHTO Eqs. 6.13.2.7-1, -2`, "kip");
    m(ok(`\\sqrt{V_{r${t}}^{2}+H_{w${t}}^{2}}`, `0.80\\cdot ${sp.web.R < 1 ? `${num(sp.web.R, 3)}\\cdot ` : ""}R_{nw${t}}\\cdot N_{w${t}}`), "Web bolts in shear, AASHTO 6.13.6.1.3c");
    m(ok(`\\sqrt{V_{s${t}}^{2}+H_{ws${t}}^{2}}`, `R_{s${t}}\\cdot N_{w${t}}`), "Web bolts against slip, AASHTO 6.13.6.1.3c");
    const rest = sp.checks.filter((c) => !/bolts in shear|gross yielding|against slip/.test(c.name));
    text("The splice's other checks:", "note", { keepWithNext: true });
    rest.forEach((c, k) => {
      const tag = `x${t}${k + 1}`;
      text(`${c.name.replace(/^Field splice at [\d.]+ ft: /, "")}:-`, undefined, { keepWithNext: true });
      given(`f_{${tag}}\\coloneq ${num(c.demand, 3)}${unitTex(c.unit)}`);
      given(`F_{${tag}}\\coloneq ${num(c.capacity, 3)}${unitTex(c.unit)}`);
      m(ok(`f_{${tag}}`, `F_{${tag}}`), c.ref);
    });
  });

  // --- Fatigue: the governing flange detail ---
  const fats = (["fat-bot", "fat-top"] as const).map((id) => ({ id, c: check(id), s: stationOf(id) })).filter((x) => x.c && x.s);
  const fg = fats.sort((a, b) => b.c!.demand / b.c!.capacity - a.c!.demand / a.c!.capacity)[0];
  if (fg) {
    const face = fg.id === "fat-bot" ? "bot" : "top";
    const f = fg.s!.fatigue![face]!;
    const cat = FATIGUE_CATEGORIES[f.cat];
    const cycles = fg.s!.fatigue!.cycles;
    const res = fatigueResistance(cat, i.fatigue.adttSL, cycles, i.fatigue.life);
    text("Fatigue (AASHTO 6.6.1.2, 6.10.5)", "subheading", { newPage: true, keepWithNext: true });
    text(
      `Method:- The fatigue truck (AASHTO 3.6.1.4.1, 30 ft rear axles) by influence lines, one lane with its factor divided by 1.2 (3.6.1.4.3b) and IM 15%; stresses at the flange's inner face, the deck effective in negative flexure where the studs run throughout with the 6.10.1.7 bars (6.6.1.2.1). Details in net compression are not checked.`,
    );
    text(`Section:- ${where(fg.s!)}, the ${face === "bot" ? "bottom" : "top"} flange, category ${f.cat} (Table 6.6.1.2.3-1).`);
    given(`f_{fmax}\\coloneq ${num(f.fMax, 3)}\\mathrm{ksi}`, "The fatigue truck's most tension (+)");
    given(`f_{fmin}\\coloneq ${num(f.fMin, 3)}\\mathrm{ksi}`, "And its most compression (−)");
    m("\\Delta_{f}\\coloneq\\left|f_{fmax}-f_{fmin}\\right|=", "Live load stress range", "ksi");
    m(`ADTT_{SL}\\coloneq ${num(i.fatigue.adttSL)}`, "Single-lane ADTT, AASHTO 3.6.1.4.2");
    m(`n_{cyc}\\coloneq ${num(cycles, 1)}`, "Cycles per truck, AASHTO Table 6.6.1.2.5-1");
    m(`A_{cat}\\coloneq ${num(cat.A / 1e8)}\\cdot10^{8}`, "ksi³, AASHTO Table 6.6.1.2.3-1");
    m(`\\Delta_{FTH}\\coloneq ${num(cat.TH)}\\mathrm{ksi}`, "AASHTO Table 6.6.1.2.3-1");
    m(`ADTT_{inf}\\coloneq\\frac{A_{cat}}{\\left(\\frac{0.80}{1.75}\\cdot\\frac{\\Delta_{FTH}}{\\mathrm{ksi}}\\right)^{3}\\cdot365\\cdot${num(i.fatigue.life)}\\cdot n_{cyc}}=`, "Equivalent to infinite life, AASHTO Eq. C6.6.1.2.3-1");
    if (res.combo === "Fatigue I") {
      m("\\gamma_{fat}\\coloneq1.75", "Fatigue I, ADTT above the infinite-life value, AASHTO Table 3.4.1-1");
      m("\\Delta_{Fn}\\coloneq\\Delta_{FTH}=", "Infinite life, AASHTO Eq. 6.6.1.2.5-1", "ksi");
    } else {
      m("\\gamma_{fat}\\coloneq0.80", "Fatigue II, ADTT at or below the infinite-life value, AASHTO Table 3.4.1-1");
      m(`N_{fat}\\coloneq365\\cdot${num(i.fatigue.life)}\\cdot n_{cyc}\\cdot ADTT_{SL}=`, "AASHTO Eq. 6.6.1.2.5-3");
      m("\\Delta_{Fn}\\coloneq\\left(\\frac{A_{cat}}{N_{fat}}\\right)^{\\frac{1}{3}}\\cdot\\mathrm{ksi}=", "Finite life, AASHTO Eq. 6.6.1.2.5-2", "ksi");
    }
    m(ok("\\gamma_{fat}\\cdot\\Delta_{f}", "\\Delta_{Fn}"), "AASHTO Eq. 6.6.1.2.2-1");
    const other = fats.find((x) => x !== fg);
    if (other) text(`Other flange:- γ(Δf) ${num(other.c!.demand, 3)} ksi against (ΔF)n ${num(other.c!.capacity, 3)} ksi (${other.c!.note}).`);
    const fw = check("fat-web");
    if (fw) {
      given(`V_{uf}\\coloneq ${num(fw.demand)}\\mathrm{kip}`, "Unfactored permanent shear plus 1.75 times the fatigue truck's");
      given(`V_{cr}\\coloneq ${num(fw.capacity)}\\mathrm{kip}`, "C Vp of the panel, AASHTO Eq. 6.10.9.3.3-1");
      m(ok("V_{uf}", "V_{cr}"), "Web of a stiffened interior panel, AASHTO Eq. 6.10.5.3-1");
    }
  }

  // --- Shear connectors ---
  const sfat = check("stud-fat");
  const ssf = stationOf("stud-fat");
  if (sfat && ssf?.fatigue?.stud) {
    const st = studResistance(i.studs, i.fatigue.adttSL, ssf.fatigue.cycles, i.fatigue.life);
    text("Shear connectors (AASHTO 6.10.10)", "subheading", { newPage: true, keepWithNext: true });
    m(`d_{s}\\coloneq ${num(i.studs.d, 3)}\\mathrm{in}`, "Stud diameter");
    m(`n_{t}\\coloneq ${i.studs.perRow}`, "Studs across the flange");
    m(`p\\coloneq ${num(i.studs.pitch)}\\mathrm{in}`, "Pitch");
    m(`F_{us}\\coloneq ${num(i.studs.Fu)}\\mathrm{ksi}`, "AASHTO 6.4.4");
    m("A_{sc}\\coloneq\\frac{\\pi\\cdot d_{s}^{2}}{4}=", undefined, "in^2");
    text(`Fatigue:- ${where(ssf)}.`, undefined, { keepWithNext: true });
    given(`\\Delta_{Vf}\\coloneq ${num(ssf.fatigue.Vmax - ssf.fatigue.Vmin, 3)}\\mathrm{kip}`, "The fatigue truck's shear range, per girder with IM");
    given(`Q_{d}\\coloneq ${num(ssf.fatigue.stud.Q)}\\mathrm{in}^{3}`, "The deck's transformed area about the short-term neutral axis");
    given(`I_{st}\\coloneq ${num(ssf.fatigue.stud.I)}\\mathrm{in}^{4}`, "Short-term composite section");
    if (st.combo === "Fatigue I") {
      m("\\gamma_{s}\\coloneq1.75", "Fatigue I, AASHTO Table 3.4.1-1");
      m("\\Delta_{Fs}\\coloneq7\\mathrm{ksi}", "Condition 9.2 threshold, AASHTO Table 6.6.1.2.3-1");
    } else {
      m("\\gamma_{s}\\coloneq0.80", "Fatigue II, AASHTO Table 3.4.1-1");
      m(`N_{s}\\coloneq365\\cdot${num(i.fatigue.life)}\\cdot${num(ssf.fatigue.cycles, 1)}\\cdot${num(i.fatigue.adttSL)}=`, "AASHTO Eq. 6.6.1.2.5-3");
      m("\\Delta_{Fs}\\coloneq\\left(\\frac{1040\\cdot10^{8}}{N_{s}}\\right)^{\\frac{1}{5}}\\cdot\\mathrm{ksi}=", "Condition 9.2, m = 5, AASHTO Eq. 6.6.1.2.5-2", "ksi");
    }
    m("Z_{r}\\coloneq\\Delta_{Fs}\\cdot A_{sc}=", "AASHTO Eq. 6.10.10.2-1", "kip");
    m("V_{sr}\\coloneq\\frac{\\gamma_{s}\\cdot\\Delta_{Vf}\\cdot Q_{d}}{I_{st}}=", "AASHTO Eqs. 6.10.10.1.2-3, -4 (straight girder)", "kip/in");
    m("p_{max}\\coloneq\\frac{n_{t}\\cdot Z_{r}}{V_{sr}}=", "AASHTO Eq. 6.10.10.1.2-1", "in");
    m(ok("p", "p_{max}"), "AASHTO Eq. 6.10.10.1.2-1");
    const strength = r.studStrength.reduce<(typeof r.studStrength)[number] | null>((b, s) => (!b || s.required / Math.max(1, s.provided) > b.required / Math.max(1, b.provided) ? s : b), null);
    if (strength) {
      text(`Strength:- Span ${strength.span + 1}, ${strength.side === "left" ? "from its start" : "to its end"} to the point of the most positive live load moment, ${num(strength.length, 2)} ft.`, undefined, { keepWithNext: true });
      given(`P_{s}\\coloneq ${num(strength.P)}\\mathrm{kip}`, "The lesser of the deck and the steel's forces (and over a pier, plus the deck's tension), AASHTO 6.10.10.4.2");
      m("\\phi_{sc}\\coloneq1.0", "AASHTO 6.5.4.2");
      m("Q_{r}\\coloneq\\phi_{sc}\\cdot0.70\\cdot A_{sc}\\cdot F_{us}=", "AASHTO Eqs. 6.10.10.4.1-1, 6.10.10.4.3-1", "kip");
      m(`L_{s}\\coloneq ${num(strength.length, 2)}\\mathrm{ft}`);
      m("n_{prov}\\coloneq n_{t}\\cdot\\operatorname{floor}\\left(\\frac{L_{s}}{p}\\right)=", "Studs provided over the length");
      m(ok("\\frac{P_{s}}{Q_{r}}", "n_{prov}"), "AASHTO Eq. 6.10.10.4.1-2");
    }
  }

  // --- Stiffeners and bearings ---
  const brg = r.bearings.reduce<(typeof r.bearings)[number] | null>((b, x) => (!b || x.Ru / (x.stiffened?.Rr ?? x.web?.phiCrippling ?? 1) > b.Ru / (b.stiffened?.Rr ?? b.web?.phiCrippling ?? 1) ? x : b), null);
  const zone = r.stiffenerChecks.reduce<(typeof r.stiffenerChecks)[number] | null>((b, z) => (!b || z.required / z.It > b.required / b.It ? z : b), null);
  if (brg || zone) text("Stiffeners (AASHTO 6.10.11)", "subheading", { newPage: true, keepWithNext: true });
  if (zone) {
    text(`Transverse stiffeners:- the zone from ${num(zone.from)} to ${num(zone.to)} ft at ${num(zone.spacing)} in${zone.tensionField ? ", its panels using tension-field action" : ""}.`, undefined, { keepWithNext: true });
    m(`b_{t}\\coloneq ${num(i.stiffener.bt, 3)}\\mathrm{in}`);
    m(`t_{p}\\coloneq ${num(i.stiffener.tp, 3)}\\mathrm{in}`);
    m(`F_{ys}\\coloneq ${num(i.stiffener.Fys)}\\mathrm{ksi}`);
    m(`D_{s}\\coloneq ${num(zone.D)}\\mathrm{in}`, "The deepest web in the zone");
    m(`t_{ws}\\coloneq ${num(zone.tw, 4)}\\mathrm{in}`, "The thinnest web in the zone");
    m(`b_{fmax}\\coloneq ${num(zone.bfMax)}\\mathrm{in}`, "The widest flange in the zone");
    m(`d_{os}\\coloneq ${num(zone.spacing)}\\mathrm{in}`);
    m(ok("\\max\\left(2\\mathrm{in}+\\frac{D_{s}}{30},\\frac{b_{fmax}}{4}\\right)", "b_{t}"), "AASHTO Eqs. 6.10.11.1.2-1, -2");
    m(ok("b_{t}", "16\\cdot t_{p}"), "AASHTO Eq. 6.10.11.1.2-2");
    m(i.stiffener.pair ? "I_{t}\\coloneq\\frac{t_{p}\\cdot\\left(2\\cdot b_{t}+t_{ws}\\right)^{3}}{12}=" : "I_{t}\\coloneq\\frac{t_{p}\\cdot b_{t}^{3}}{3}=", i.stiffener.pair ? "A pair, about the web's mid-thickness" : "One plate, about its edge on the web", "in^4");
    m("J_{s}\\coloneq\\max\\left(\\frac{2.5}{\\left(\\frac{d_{os}}{D_{s}}\\right)^{2}}-2,0.5\\right)=", "AASHTO Eq. 6.10.11.1.3-5");
    m("I_{t1}\\coloneq\\min\\left(d_{os},D_{s}\\right)\\cdot t_{ws}^{3}\\cdot J_{s}=", "AASHTO Eq. 6.10.11.1.3-3", "in^4");
    m("F_{crs}\\coloneq\\min\\left(\\frac{0.31\\cdot E_s}{\\left(\\frac{b_{t}}{t_{p}}\\right)^{2}},F_{ys}\\right)=", "AASHTO Eq. 6.10.11.1.3-6", "ksi");
    m("\\rho_{t}\\coloneq\\max\\left(\\frac{F_{yw}}{F_{crs}},1\\right)=");
    m("I_{t2}\\coloneq\\frac{D_{s}^{4}\\cdot\\rho_{t}^{1.3}}{40}\\cdot\\left(\\frac{F_{yw}}{E_s}\\right)^{1.5}=", "AASHTO Eq. 6.10.11.1.3-4", "in^4");
    if (!zone.tensionField) m("I_{treq}\\coloneq\\min\\left(I_{t1},I_{t2}\\right)=", "No tension field, AASHTO Eqs. 6.10.11.1.3-1, -2", "in^4");
    else {
      given(`\\rho_{w}\\coloneq ${num(zone.rhoW, 3)}`, "The largest (Vu − φv Vcr)/(φv Vn − φv Vcr) in the zone");
      m("I_{treq}\\coloneq\\operatorname{if}\\left(I_{t2}>I_{t1},I_{t1}+\\left(I_{t2}-I_{t1}\\right)\\cdot\\rho_{w},I_{t2}\\right)=", "AASHTO Eqs. 6.10.11.1.3-7, -8", "in^4");
    }
    m(ok("I_{treq}", "I_{t}"), "AASHTO 6.10.11.1.3");
  }
  if (brg) {
    const p = { D: brg.D, tw: brg.tw };
    const label = brg.end ? `abutment ${brg.support === 0 ? 1 : 2}` : `pier ${brg.support}`;
    text(`Bearing:- At ${label}, the governing support.`, undefined, { keepWithNext: true });
    given(`R_{u}\\coloneq ${num(brg.Ru)}\\mathrm{kip}`, "Strength I reaction per girder: 1.25 DC + 1.5 DW + 1.75 (LL + IM)");
    if (brg.stiffened) {
      const pairs = brg.end ? i.bearing.pairsEnd : i.bearing.pairsPier;
      m(`b_{tb}\\coloneq ${num(i.bearing.bt, 3)}\\mathrm{in}`);
      m(`t_{pb}\\coloneq ${num(i.bearing.tp, 3)}\\mathrm{in}`);
      m(`F_{yb}\\coloneq ${num(i.bearing.Fys)}\\mathrm{ksi}`);
      m(`c_{b}\\coloneq ${num(i.bearing.clip, 3)}\\mathrm{in}`, "Clip for the flange-to-web weld");
      m(`n_{p}\\coloneq ${pairs}`, "Pairs of plates");
      m(`D_{b}\\coloneq ${num(p.D)}\\mathrm{in}`);
      m(`t_{wb}\\coloneq ${num(p.tw, 4)}\\mathrm{in}`);
      m(ok("b_{tb}", "0.48\\cdot t_{pb}\\cdot\\sqrt{\\frac{E_s}{F_{yb}}}"), "AASHTO Eq. 6.10.11.2.2-1");
      m("A_{pn}\\coloneq n_{p}\\cdot2\\cdot\\left(b_{tb}-c_{b}\\right)\\cdot t_{pb}=", "Projecting area outside the welds", "in^2");
      m("R_{sbr}\\coloneq1.0\\cdot1.4\\cdot A_{pn}\\cdot F_{yb}=", "AASHTO Eqs. 6.10.11.2.3-1, -2", "kip");
      m(ok("R_{u}", "R_{sbr}"), "AASHTO 6.10.11.2.3");
      if (pairs > 1) m(`g_{b}\\coloneq ${num(i.bearing.gap)}\\mathrm{in}`, "Between pairs");
      m(`A_{sb}\\coloneq n_{p}\\cdot2\\cdot b_{tb}\\cdot t_{pb}+\\left(18\\cdot t_{wb}${pairs > 1 ? "+\\left(n_{p}-1\\right)\\cdot g_{b}" : ""}\\right)\\cdot t_{wb}=`, "The plates and 9tw of web each side, AASHTO 6.10.11.2.4b", "in^2");
      m("I_{sb}\\coloneq\\frac{n_{p}\\cdot t_{pb}\\cdot\\left(2\\cdot b_{tb}+t_{wb}\\right)^{3}}{12}=", "About the web's mid-thickness", "in^4");
      m("r_{sb}\\coloneq\\sqrt{\\frac{I_{sb}}{A_{sb}}}=", undefined, "in");
      m("KL_{b}\\coloneq0.75\\cdot D_{b}=", "AASHTO 6.10.11.2.4a", "in");
      m("P_{e}\\coloneq\\frac{\\pi^{2}\\cdot E_s\\cdot A_{sb}}{\\left(\\frac{KL_{b}}{r_{sb}}\\right)^{2}}=", "AASHTO Eq. 6.9.4.1.2-1", "kip");
      m("P_{o}\\coloneq F_{yb}\\cdot A_{sb}=", "Q = 1, AASHTO 6.9.4.1.1", "kip");
      m("P_{n}\\coloneq\\operatorname{if}\\left(\\frac{P_{e}}{P_{o}}\\ge0.44,0.658^{\\frac{P_{o}}{P_{e}}}\\cdot P_{o},0.877\\cdot P_{e}\\right)=", "AASHTO Eqs. 6.9.4.1.1-1, -2", "kip");
      m("\\phi_{c}\\coloneq0.95", "AASHTO 6.5.4.2");
      m(ok("R_{u}", "\\phi_{c}\\cdot P_{n}"), "AASHTO 6.9.2.1");
    } else if (brg.web) {
      if (brg.plate) text("Bearing stiffeners:- Required at every bearing of a built-up girder (AASHTO 6.10.11.2.1); none given.");
      given(`R_{ny}\\coloneq ${num(brg.web.yielding)}\\mathrm{kip}`, `Web local yielding, ${brg.end ? "(2.5k + N)" : "(5k + N)"} Fyw tw, AASHTO D6.5.2`);
      m(ok("R_{u}", "1.0\\cdot R_{ny}"), "AASHTO Eq. D6.5.2-1");
      given(`R_{nc}\\coloneq ${num(brg.web.crippling)}\\mathrm{kip}`, "Web crippling, AASHTO D6.5.3");
      m(ok("R_{u}", "0.80\\cdot R_{nc}"), "AASHTO Eq. D6.5.3-1");
    }
  }

  if (r.camber.length) {
    text("Camber (AASHTO 6.7.2)", "subheading", { newPage: true, keepWithNext: true });
    text(`Method:- Downward deflections of the dead loads on the sections that carry them: the steel's weight and the deck (DC1) on the steel, DC2 and DW on the long-term composite section; ${i.pours.length ? "the deck pour by pour on the girder as it then is" : "one deck pour"}. The camber to detail is the total plus the vertical profile's own ordinates.`, undefined, { keepWithNext: true });
    if (figures?.camber) lines.push({ region: figures.camber });
    if (figures?.screed) {
      text("Screed camber:- The deck's and DC2's deflection, still to come once the steel is erected; it sets the screed.", undefined, { keepWithNext: true });
      lines.push({ region: figures.screed });
    }
    for (const c of r.camber.filter((x) => [0.2, 0.4, 0.5, 0.6, 0.8].some((t) => Math.abs(x.at - t) < 1e-6)))
      text(`Span ${c.span + 1} at ${num(c.at, 1)}L:- steel ${num(c.steel, 3)} in, deck ${num(c.deck, 3)} in, DC2 ${num(c.dc2, 3)} in; total ${num(c.total, 3)} in (DW ${num(c.dw, 3)} in more).`);
  }

  text("Proportions (AASHTO 6.10.2)", "subheading", { newPage: true, keepWithNext: true });
  i.segments.forEach((s, k) => {
    const p = plates(s);
    const t = `${k + 1}`;
    text(`Section ${t}:- ${p.name}.`, undefined, { keepWithNext: true });
    m(`D_{${t}}\\coloneq ${num(p.D)}\\mathrm{in}`);
    m(`t_{w${t}}\\coloneq ${num(p.tw)}\\mathrm{in}`);
    m(`b_{t${t}}\\coloneq ${num(p.top.b)}\\mathrm{in}`);
    m(`t_{t${t}}\\coloneq ${num(p.top.t)}\\mathrm{in}`);
    m(`b_{b${t}}\\coloneq ${num(p.bottom.b)}\\mathrm{in}`);
    m(`t_{b${t}}\\coloneq ${num(p.bottom.t)}\\mathrm{in}`);
    m(ok(`\\frac{D_{${t}}}{t_{w${t}}}`, "150"), "AASHTO Eq. 6.10.2.1.1-1");
    m(ok(`\\max\\left(\\frac{b_{t${t}}}{2\\cdot t_{t${t}}},\\frac{b_{b${t}}}{2\\cdot t_{b${t}}}\\right)`, "12"), "AASHTO Eq. 6.10.2.2-1");
    m(ok(`\\frac{D_{${t}}}{6}`, `\\min\\left(b_{t${t}},b_{b${t}}\\right)`), "AASHTO Eq. 6.10.2.2-2");
    m(ok(`1.1\\cdot t_{w${t}}`, `\\min\\left(t_{t${t}},t_{b${t}}\\right)`), "AASHTO Eq. 6.10.2.2-3");
    m(ok("0.1", `\\min\\left(\\frac{t_{t${t}}\\cdot b_{t${t}}^{3}}{t_{b${t}}\\cdot b_{b${t}}^{3}},\\frac{t_{b${t}}\\cdot b_{b${t}}^{3}}{t_{t${t}}\\cdot b_{t${t}}^{3}}\\right)`), "AASHTO Eq. 6.10.2.2-4");
  });
  if (r.spans.length > 1) {
    m(`\\rho_{d}\\coloneq ${num(i.bars.pct)}`, "The deck's longitudinal bars over the piers, % of the deck");
    m(ok("1", "\\rho_{d}"), "AASHTO 6.10.1.7");
  }
  if (r.deflections.length) {
    text("Live load deflection (AASHTO 2.5.2.6.2)", "subheading", { keepWithNext: true });
    text("Method:- All design lanes loaded with their multiple presence factor, the girders deflecting equally; the design truck, or 25% of it with the lane load, IM on the truck (AASHTO 3.6.1.3.2).");
    r.deflections.forEach((d) => {
      const t = `${d.span + 1}`;
      given(`\\Delta_{${t}}\\coloneq ${num(d.deflection)}\\mathrm{in}`, `Span ${t}, from the girder line`);
      m(`L_{${t}}\\coloneq ${num(r.spans[d.span])}\\mathrm{ft}`);
      m(ok(`\\Delta_{${t}}`, `\\frac{L_{${t}}}{${num(i.deflection.limit)}}`), "AASHTO 2.5.2.6.2");
    });
  }
  lines.push(
    ...checksSummary([
      { title: "Strength I", checks: r.checks.filter((c) => /^(flex|ductility|shear)/.test(c.id)) },
      { title: "Constructibility", checks: r.checks.filter((c) => c.id.startsWith("con-")) },
      { title: "Wind during construction", checks: r.checks.filter((c) => c.id.startsWith("cw-")) },
      { title: "Service II", checks: r.checks.filter((c) => c.id.startsWith("svc-")) },
      { title: "Proportions", checks: r.checks.filter((c) => c.id.startsWith("prop-") || c.id === "deck-bars") },
      { title: "Live load deflection", checks: r.checks.filter((c) => c.id.startsWith("defl-")) },
      { title: "Fatigue", checks: r.checks.filter((c) => c.id.startsWith("fat-")) },
      { title: "Shear connectors", checks: r.checks.filter((c) => c.id.startsWith("stud-")) },
      { title: "Stiffeners and bearings", checks: r.checks.filter((c) => c.id.startsWith("stf-") || c.id.startsWith("brg-")) },
      { title: "Deck placement, pour by pour", checks: r.checks.filter((c) => c.id.startsWith("pour-")) },
      { title: "Strength III and V (wind on the bottom flange)", checks: r.checks.filter((c) => /^s[35]-/.test(c.id)) },
      { title: "Horizontal curvature", checks: r.checks.filter((c) => c.id.startsWith("curve-")) },
      { title: "Moment redistribution (Appendix B6)", checks: r.checks.filter((c) => c.id.startsWith("b6-") || c.id.startsWith("b6r-")) },
      { title: "Cross-frames", checks: r.checks.filter((c) => c.id.startsWith("cf-")) },
      { title: "Cross-frame connections", checks: r.checks.filter((c) => c.id.startsWith("cfc-")) },
    ]),
  );
  text(
    r.grid ? "Not covered:- The grid's deflection and camber (the line girder's are given), and the bearings' reactions (the line girder's)." : `Not covered:- The cross-frames' live load forces, which need the grid (refined analysis; their fatigue is checked when a force range is given)${r.windConstruction ? "" : "; the wind during construction (give its speed)"}${r.curved ? "; the V-loads' effect on the girders' vertical moments, which AASHTO 4.6.1.2.4b lets a girder within its limits ignore" : ""}; a curved bridge outside those limits needs the grid.`,
    "note",
  );
  return lines;
}

import type { Line } from "@/lib/calcs/library/templates";
import { checksSummary } from "../checks-summary";
import { COLOR_NOTE, INPUT_COLOR, info, isInput, num } from "../calc-style";
import type { Figure } from "../figures";
import { ftIn } from "../rebar/bars";
import { SIGN_DEFAULTS } from "../signs/cantilever";
import { shaftTakeoff } from "../takeoff/tools";
import type { DetailView, Takeoff } from "../takeoff/types";
import { designSignal, poleHeight, signalPieces, type SignalInputs } from "./foundation";
import { signalStandard } from "./standards";

// A traffic signal support's schematic (the standard pole, its arms and attachments, on its caisson), its take-off
// (the caisson, Item 503) and its calc package.

type Pt = [number, number];
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** A tapered member from (x0, y0) to (x1, y1), d0 and d1 its widths (ft). */
const taper = (x0: number, y0: number, x1: number, y1: number, d0: number, d1: number): Pt[] => {
  const L = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / L;
  const ny = (x1 - x0) / L;
  return [[x0 + (nx * d0) / 2, y0 + (ny * d0) / 2], [x1 + (nx * d1) / 2, y1 + (ny * d1) / 2], [x1 - (nx * d1) / 2, y1 - (ny * d1) / 2], [x0 - (nx * d0) / 2, y0 - (ny * d0) / 2]];
};

/** The elevation (looking square to the primary arm) and, for two arms, the plan; feet, the ground at 0. */
export function signalViews(i: SignalInputs): DetailView[] {
  const s = signalStandard(i.standard);
  const D = i.shaftD / 12;
  const v: DetailView = { title: `Elevation: ${s.label}, on a ${ftIn(i.shaftD)} caisson ${num(i.shaftLength, 2)} ft deep`, polys: [], lines: [], dots: [], labels: [] };
  // The caisson and the ground.
  v.polys.push({ pts: rect(-Math.max(4, D * 1.6), -i.shaftLength - 1.5, Math.max(4, D * 1.6) + (s.kind === "mast-arm" ? s.L : 6), 0), style: "earth" });
  v.polys.push({ pts: rect(-D / 2, -i.shaftLength, D / 2, 0.2), style: "concrete" });
  if (s.kind === "pedestal") {
    // A 6 in (or 4 in) pipe about 12 to 15 ft tall, the heads on its top.
    const d = s.id === "44-signal" ? 6.625 / 12 : 4.5 / 12;
    const h = s.id === "44-signal" ? 15 : 12;
    v.polys.push({ pts: rect(-d / 2, 0.2, d / 2, h), style: "void" });
    v.polys.push({ pts: rect(-0.6, h - 4.5, 0.6, h), style: "dashed" });
    v.labels!.push({ x: 1, y: h - 2, text: "Signal heads", anchor: "start" });
    v.labels!.push({ x: D / 2 + 0.5, y: -i.shaftLength / 2, text: `Caisson ⌀${ftIn(i.shaftD)}, ${num(i.shaftLength, 2)} ft; ${i.bars} #${i.bar}, #${i.spiral} spiral @ ${i.pitch} in`, anchor: "start" });
    return [v];
  }
  const { attachments } = signalPieces(i);
  const H = poleHeight(s, i.luminaire);
  const pb = s.poleBase!;
  const pe = s.poleEnd!;
  const splice = 1.5 * (pe.trunk / 12);
  v.polys.push({ pts: taper(0, 0.2, 0, pb.length, pb.trunk / 12, pb.tip / 12), style: "void" });
  v.polys.push({ pts: taper(0, pb.length - splice, 0, H, pe.trunk / 12, (i.luminaire ? pe.tip : pe.trunk - 0.84) / 12), style: "void" });
  // The primary arm (rising 3°), its base and end sections.
  const rise = Math.tan((3 * Math.PI) / 180);
  const ab = s.armBase!;
  const ae = s.armEnd;
  const zA = i.armHeight;
  const bEnd = ae ? Math.min(ab.length, s.L - ae.length + 1.5 * (ae.trunk / 12)) : Math.min(ab.length, s.L);
  v.polys.push({ pts: taper(0, zA, bEnd, zA + bEnd * rise, ab.trunk / 12, ab.tip / 12), style: "void" });
  if (ae) v.polys.push({ pts: taper(s.L - ae.length, zA + (s.L - ae.length) * rise, s.L, zA + s.L * rise, ae.trunk / 12, ae.tip / 12), style: "void" });
  // The attachments hanging from the arm: heads 1.2 ft wide, signs by their area at 2.5 ft high.
  for (const a of attachments) {
    const y = zA + a.at * rise;
    if (a.plate) {
      const w = a.area / 2.5;
      v.polys.push({ pts: rect(a.at - w / 2, y - 0.6 - 2.5, a.at + w / 2, y - 0.6), style: "dashed" });
    } else {
      const h = a.area > 10 ? 4.5 : 3.6;
      v.polys.push({ pts: rect(a.at - 0.6, y - 0.4 - h, a.at + 0.6, y - 0.4), style: "dashed" });
    }
  }
  if (i.luminaire) {
    v.polys.push({ pts: taper(0, H, i.luminaireArm, H + 1.5, (2.796 + 0.14 * i.luminaireArm) / 12, 2.796 / 12), style: "void" });
    v.polys.push({ pts: rect(i.luminaireArm - 1, H + 1.1, i.luminaireArm + 0.6, H + 1.6), style: "dashed" });
  }
  if (i.poleSignal) v.polys.push({ pts: rect(pb.trunk / 24, 10.5, pb.trunk / 24 + 1.2, 14.5), style: "dashed" });
  v.labels!.push({ x: s.L / 2, y: zA + (s.L / 2) * rise + 1.5, text: `Arm ${s.L} ft (${s.heads} heads${i.attachments ? ", as entered" : ", CDOT's loading"})${s.arms === 2 && i.arms === 2 ? `; a second arm at ${i.secondAngle}°` : ""}`, anchor: "middle" });
  v.labels!.push({ x: -1, y: H, text: `Pole ${num(H, 1)} ft`, anchor: "end" });
  v.labels!.push({ x: D / 2 + 0.5, y: -i.shaftLength / 2, text: `Caisson ⌀${ftIn(i.shaftD)}, ${num(i.shaftLength, 2)} ft; ${i.bars} #${i.bar}, #${i.spiral} spiral @ ${i.pitch} in`, anchor: "start" });
  const views = [v];
  if (s.arms === 2 && i.arms === 2) {
    const p: DetailView = { title: "Plan: the arms", polys: [], lines: [], dots: [], labels: [] };
    const a2 = (i.secondAngle * Math.PI) / 180;
    p.polys.push({ pts: taper(0, 0, s.L, 0, ab.trunk / 12, (ae ?? ab).tip / 12), style: "void" });
    p.polys.push({ pts: taper(0, 0, s.L * Math.cos(a2), s.L * Math.sin(a2), ab.trunk / 12, (ae ?? ab).tip / 12), style: "void" });
    p.polys.push({ pts: rect(-pb.trunk / 24, -pb.trunk / 24, pb.trunk / 24, pb.trunk / 24), style: "concrete" });
    p.labels!.push({ x: s.L / 2, y: -2, text: "Primary arm", anchor: "middle" });
    p.labels!.push({ x: (s.L / 2) * Math.cos(a2) - 1, y: (s.L / 2) * Math.sin(a2), text: `Second arm, ${i.secondAngle}°`, anchor: "end" });
    views.push(p);
  }
  return views;
}

/** The take-off: the caisson (Item 503, paid by the foot) and its bars. */
export function signalTakeoff(i: SignalInputs): Takeoff {
  const s = signalStandard(i.standard);
  const t = shaftTakeoff({ ...SIGN_DEFAULTS, shaftD: i.shaftD, shaftLength: i.shaftLength, cover: i.cover, bars: i.bars, bar: i.bar, tieBar: i.spiral, tieSpacing: i.pitch, fc: i.fc, fy: i.fy, pyMoment: 0, pyShear: 0 });
  const pay = Math.ceil(i.shaftLength * 2 - 1e-9) / 2;
  return {
    ...t,
    what: "traffic signal caisson",
    quantities: { shaft: { value: pay, basis: `one caisson, ${ftIn(i.shaftD)} diameter, ${num(i.shaftLength, 2)} ft deep (pay length ${num(pay, 1)} ft)`, math: `${num(pay, 1)}\\mathrm{ft}`, ref: "Drilled shaft (caisson), pay length" } },
    views: [...signalViews(i), ...t.views],
    notes: [...t.notes, `The pole, arms and their hardware are the standard's (${s.sheet}), paid under the traffic signal items (614); this take-off is the caisson.`],
    length: { label: "Caissons", value: 1, unit: "EA" },
  };
}

const ok = (demand: string, capacity: string) => `\\operatorname{if}\\left(${demand}\\le ${capacity},\\text{OK},\\text{NG}\\right)=`;

export function signalCalcLines(i: SignalInputs, title: string, figures?: Figure[]): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note") => lines.push({ text: t, ...(style ? { style } : {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}), ...(isInput(math) ? { color: INPUT_COLOR } : {}) });
  const r = designSignal(i);
  const s = r.standard;
  text(title.toUpperCase(), "heading");
  text(
    `The caisson under CDOT's standard traffic signal support ${s.sheet}: ${s.label}. ${s.kind === "mast-arm" ? `The standard is designed for its longest arm (${s.L} ft, used for ${s.covers} arms) with the sheet's worst-case loading.` : "The sheet gives the pole's service moment and shear."} Loads by the AASHTO LRFD Specifications for Structural Supports for Highway Signs, Luminaires, and Traffic Signals (LRFD-LTS), 1st Edition (2015); the caisson by its Section 13 and the AASHTO LRFD Bridge Design Specifications.`,
  );
  text(COLOR_NOTE, "note");
  for (const f of figures ?? []) lines.push({ region: f });

  text("Wind (LTS 3.8)", "subheading");
  m(`V\\coloneq ${num(i.V)}`, "mph, basic wind speed for the MRI (3.8.2)");
  if (s.kind === "mast-arm") {
    m(`z\\coloneq ${num(i.armHeight)}`, "ft, the arm's height");
    m("K_z\\coloneq 2.0\\cdot\\left(\\frac{\\max\\left(z,16\\right)}{900}\\right)^{\\frac{2}{9.5}}=", "Eq. 3.8.4-1, exposure C");
    m(`K_d\\coloneq ${num(i.Kd)}`, "Table 3.8.5-1");
    m(`G\\coloneq ${num(i.G)}`, "3.8.6");
    m("C_d\\coloneq 1.2", "Signal heads and signs, Table 3.8.7-1");
    m("P_z\\coloneq 0.00256\\cdot K_z\\cdot K_d\\cdot G\\cdot V^{2}\\cdot C_d=", "psf on a signal head at the arm, Eq. 3.8.1-1");
    text(
      `Each piece is loaded at its own height (Kz): the pole and arm tubes in 1 ft pieces by the crossflow principle (round members' Cd by CvVd), the signs on their faces, the signal heads, luminaire and camera by their full area from any direction. The wind is turned round the pole in 5° steps and the worst direction kept for each effect. Dead load ${num(r.loads.W, 2)} kip, its eccentric moment ${num(r.loads.Md, 1)} kip·ft.`,
    );
  } else {
    text(`S-614-44 gives the pole's service moment ${num(s.service!.M, 2)} kip·ft and shear ${num(s.service!.V, 2)} kip for ${s.service!.V0} mph; they are scaled here by (V/${s.service!.V0})²·Kd = ${num(r.loads.scaled, 3)}.`);
  }

  text("At the top of the caisson (Table 3.4-1, Extreme I)", "subheading");
  m(`M_F\\coloneq ${num(r.extreme.M, 2)}\\mathrm{kip}\\cdot\\mathrm{ft}`, `The largest moment (wind from ${r.extreme.deg}°, ${r.extreme.name})`);
  m(`V_F\\coloneq ${num(r.Vu, 2)}\\mathrm{kip}`, "The largest shear");
  if (s.kind === "mast-arm") m(`T_F\\coloneq ${num(r.Tu, 2)}\\mathrm{kip}\\cdot\\mathrm{ft}`, "The largest torsion");

  text("Embedment (Broms, LTS 13.6.1.1)", "subheading");
  m(`D\\coloneq ${num(i.shaftD)}\\mathrm{in}`, "Caisson diameter");
  m(`L\\coloneq ${num(i.shaftLength, 3)}\\mathrm{ft}`, "Embedded length");
  m(`\\phi_{l}\\coloneq ${num(i.phiLateral, 2)}`, "Soil resistance, extreme event (AASHTO 10.5.5.3.3)");
  m("H\\coloneq\\frac{M_F}{V_F}=", "Eq. C13.6.1.1-2", "ft");
  if (i.soil === "cohesive") {
    m(`c\\coloneq ${num(i.c)}\\mathrm{psf}`, "Undrained shear strength");
    m("q\\coloneq\\frac{V_F}{9\\cdot\\phi_{l}\\cdot c\\cdot D}=", "Eq. C13.6.1.1-3", "ft");
    m("L_{req}\\coloneq 1.5\\cdot D+q\\cdot\\left(1+\\sqrt{2+\\frac{4\\cdot H+6\\cdot D}{q}}\\right)=", "Eq. C13.6.1.1-1", "ft");
    m("M_{u}\\coloneq V_F\\cdot\\left(H+1.5\\cdot D+0.5\\cdot q\\right)=", "The largest moment in the caisson, Eq. C13.6.1.1-4", "kip·ft");
  } else {
    m(`\\gamma\\coloneq ${num(i.gamma)}\\mathrm{pcf}`, "Effective unit weight");
    m(`\\phi_{s}\\coloneq ${num(i.phi)}\\mathrm{deg}`, "Friction angle");
    m("K_p\\coloneq\\tan\\left(45\\mathrm{deg}+\\frac{\\phi_{s}}{2}\\right)^{2}=", "Eq. C13.6.1.1-6");
    m(`L_{req}\\coloneq ${num(r.broms.L, 3)}\\mathrm{ft}`, "The root of Eq. C13.6.1.1-5");
    m("L_{req}^{3}-\\frac{2\\cdot V_F\\cdot L_{req}}{\\phi_{l}\\cdot\\gamma\\cdot K_p\\cdot D}-\\frac{2\\cdot M_F}{\\phi_{l}\\cdot\\gamma\\cdot K_p\\cdot D}=", "Eq. C13.6.1.1-5: zero at the root", "ft^3");
    m("M_{u}\\coloneq V_F\\cdot\\left(H+0.54\\cdot\\sqrt{\\frac{V_F}{\\phi_{l}\\cdot\\gamma\\cdot D\\cdot K_p}}\\right)=", "The largest moment in the caisson, Eq. C13.6.1.1-7", "kip·ft");
  }
  m(ok("L_{req}", "L"), "Embedment");

  if (s.kind === "mast-arm") {
    text("Torsion in the soil", "subheading");
    m(`\\phi_{t}\\coloneq ${num(i.phiTorsion, 2)}`, "Side resistance in torsion, taken as for uplift (AASHTO 10.5.5.3.3)");
    if (i.torsionMethod === "cdot") text("Side resistance as CDOT's standard caissons need it: the sheets don't state their method; this one carries every S-614-40 and 40A caisson on the sheets' own basis. (AASHTO's current side resistance is the other choice.)", "note");
    if (i.soil === "cohesive") {
      if (i.torsionMethod === "cdot") m("q_{s}\\coloneq c=", "The full cohesion", "ksf");
      else m("q_{s}\\coloneq 0.55\\cdot c=", "α-method, AASHTO 10.8.3.5.1b", "ksf");
      m("T_n\\coloneq q_{s}\\cdot\\pi\\cdot D\\cdot L\\cdot\\frac{D}{2}=", "Side resistance round the caisson, at D/2", "kip·ft");
    } else if (i.torsionMethod === "cdot") {
      text(`O'Neill and Reese's β = 1.5 − 0.135√z (z in ft, 0.25 to 1.2${i.N60 < 15 ? `, × N60/15 = ${num(i.N60 / 15, 3)}` : ""}; AASHTO LRFD 7th Ed. Eq. 10.8.3.5.2b-2), integrated down the caisson: Tn = γ·π·D·(D/2)·∫β·z dz.`);
      m(`\\beta_{avg}\\coloneq ${num(r.torsionSoil.beta, 4)}`, "β averaged over the length, weighted by depth");
      m("T_n\\coloneq\\beta_{avg}\\cdot\\gamma\\cdot\\pi\\cdot D\\cdot\\frac{L^{2}}{2}\\cdot\\frac{D}{2}=", "β·σ′v round the caisson, at D/2", "kip·ft");
    } else {
      m("\\beta\\coloneq\\left(1-\\sin\\left(\\phi_{s}\\right)\\right)\\cdot\\tan\\left(\\phi_{s}\\right)=", "β-method, normally consolidated, AASHTO 10.8.3.5.2b");
      m("T_n\\coloneq\\beta\\cdot\\gamma\\cdot\\pi\\cdot D\\cdot\\frac{L^{2}}{2}\\cdot\\frac{D}{2}=", "β·σ′v round the caisson, at D/2", "kip·ft");
    }
    m(ok("T_F", "\\phi_{t}\\cdot T_n"), "Torsion");
  }

  text("The caisson as a concrete member (LTS 13.6.2, AASHTO 5.6, 5.7)", "subheading");
  const sh = r.shaft;
  text(
    `${i.bars} #${i.bar} bars, #${i.spiral} spiral at ${i.pitch} in, f′c ${num(i.fc)} ksi: at the smallest axial load φMn = ${num(i.phiM * sh.Mn, 1)} kip·ft for Mu = ${num(sh.Mu, 1)} kip·ft (Broms' largest moment); shear φVn = ${num(0.9 * sh.Vn, 1)} kip for Vu = ${num(sh.Vu, 2)} kip. ${r.torsion ? `Torsion exceeds a quarter of the cracking torque (φTcr = ${num((0.9 * sh.Tcr) / 12, 1)} kip·ft), so the spiral and bars are checked for it (5.7.3.6).` : "Torsion is under a quarter of the cracking torque and may be neglected (5.7.2.1)."}`,
  );

  if (r.cdot) {
    text("On the standard's own basis (advisory)", "subheading");
    text(
      `${s.sheet}'s Design Data: the 2001 Standard Specifications for Structural Supports, ${r.cdot.V} mph, soil factors of safety ${r.cdot.sf.flexure} in flexure and ${r.cdot.sf.torsion} in torsion. Unfactored at ${r.cdot.V} mph (Kd 1): ${num(r.cdot.M, 1)} kip·ft, ${num(r.cdot.F, 2)} kip${s.kind === "mast-arm" ? `, ${num(r.cdot.T, 1)} kip·ft of torsion` : ""}. Broms with the loads × ${r.cdot.sf.flexure} needs ${num(r.cdot.L, 2)} ft (the standard's caisson: ${num(r.stdCaisson.shaftLength, 2)} ft).`,
    );
    m(info(`${num(r.cdot.L, 3)}\\mathrm{ft}`, "L"), "Embedment on the standard's basis");
  }
  lines.push(...checksSummary([{ checks: r.checks }]));
  return lines;
}

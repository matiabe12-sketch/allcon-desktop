import type { Line } from "@/lib/calcs/library/templates";
import { checksSummary } from "../checks-summary";
import { COLOR_NOTE, INPUT_COLOR, isInput, num } from "../calc-style";
import type { Figure } from "../figures";
import { ftIn } from "../rebar/bars";
import { shaftTakeoff } from "../takeoff/tools";
import type { DetailView, Takeoff } from "../takeoff/types";
import { designSignBridge, type SignBridgeInputs } from "./bridge";
import { SIGN_DEFAULTS } from "./cantilever";
import { signCd } from "./structure";

// A sign bridge's elevation (looking along the road), its take-off (the two shafts) and its calc package.

/** The elevation: the shafts, the posts, the span and the signs, dimensioned (ft). */
export function signBridgeViews(i: SignBridgeInputs): DetailView[] {
  const v: DetailView = { title: `Elevation: ${i.span} ft span, ${i.height} ft to its centerline`, polys: [], lines: [], dots: [], labels: [] };
  const r = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as [number, number][];
  const pd = i.postD / 12;
  const bd = i.beamD / 12;
  const sd = i.shaftD / 12;
  for (const x of [0, i.span]) {
    v.polys.push({ pts: r(x - sd / 2, -i.shaftLength, x + sd / 2, 0), style: "concrete" });
    v.polys.push({ pts: r(x - pd / 2, 0, x + pd / 2, i.height + bd / 2), style: "void" });
  }
  v.polys.push({ pts: r(-sd, -i.shaftLength - 1, i.span + sd, 0), style: "earth" });
  v.polys.push({ pts: r(-pd / 2, i.height - bd / 2, i.span + pd / 2, i.height + bd / 2), style: "void" });
  for (const s of i.signs) v.polys.push({ pts: r(s.at - s.length / 2, i.height - s.height / 2, s.at + s.length / 2, i.height + s.height / 2), style: "dashed" });
  v.labels!.push({ x: i.span / 2, y: i.height + bd / 2 + 2, text: `Span ⌀${ftIn(i.beamD)} × ${ftIn(i.beamWall)}; posts ⌀${ftIn(i.postD)} × ${ftIn(i.postWall)}`, anchor: "middle" });
  v.labels!.push({ x: i.span / 2, y: -i.shaftLength - 3, text: `Shafts ⌀${ftIn(i.shaftD)}, ${i.shaftLength} ft; ${i.signs.length} sign${i.signs.length === 1 ? "" : "s"}`, anchor: "middle" });
  return [v];
}

/** The take-off: the two shafts (B-503-1), the structure's steel noted. */
export function signBridgeTakeoff(i: SignBridgeInputs): Takeoff {
  const t = shaftTakeoff({ ...SIGN_DEFAULTS, ...i, pyMoment: 0, pyShear: 0 });
  const r = designSignBridge(i);
  const steel = (r.post.A * 2 * i.height + r.beam.A * i.span) * (0.49 / 144) * 1000; // lb
  return {
    ...t,
    what: "sign bridge drilled shafts (two)",
    quantities: { shaft: { value: 2 * i.shaftLength, basis: `two shafts, ${ftIn(i.shaftD)} diameter, ${i.shaftLength} ft each`, math: `2\\cdot ${num(i.shaftLength)}\\mathrm{ft}`, ref: "Drilled shaft, both posts" } },
    views: [...signBridgeViews(i), ...t.views],
    notes: [...t.notes, `The structure's steel (about ${Math.round(steel).toLocaleString()} lb in the tubes) is paid with the sign structure (614); the bars here are each shaft's, for both.`],
    length: { label: "Shafts", value: 2, unit: "EA" },
  };
}

const ok = (demand: string, capacity: string) => `\\operatorname{if}\\left(${demand}\\le ${capacity},\\text{OK},\\text{NG}\\right)=`;

export function signBridgeCalcLines(i: SignBridgeInputs, title: string, figures?: Figure[]): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note") => lines.push({ text: t, ...(style ? { style } : {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}), ...(isInput(math) ? { color: INPUT_COLOR } : {}) });
  const r = designSignBridge(i);
  text(title.toUpperCase(), "heading");
  text("A monotube sign bridge (CDOT S-614-50): a round steel span on two round posts bolted into a portal frame, each post on a drilled shaft. AASHTO LRFD Specifications for Structural Supports for Highway Signs, Luminaires, and Traffic Signals, 1st Edition (2015).");
  text(COLOR_NOTE, "note");
  for (const f of figures ?? []) lines.push({ region: f });

  text("Wind (3.8)", "subheading");
  m(`V\\coloneq ${num(i.V)}`, "mph, for the structure's MRI");
  m(`z\\coloneq ${num(i.height)}`, "ft, the span's height");
  m("K_z\\coloneq 2.0\\cdot\\left(\\frac{\\max\\left(z,16\\right)}{900}\\right)^{\\frac{2}{9.5}}=", "Eq. 3.8.4-1, exposure C");
  m(`K_d\\coloneq ${num(i.Kd)}`, "Table 3.8.5-1");
  m(`G\\coloneq ${num(i.G)}`, "3.8.6");
  const s0 = i.signs[0] ?? { length: 1, height: 1 };
  m(`C_d\\coloneq ${num(signCd(Math.max(s0.length, s0.height) / Math.min(s0.length, s0.height)), 3)}`, "The first sign, by its aspect, Table 3.8.7-1 (each sign by its own)");
  m("P_s\\coloneq 0.00256\\cdot K_z\\cdot K_d\\cdot G\\cdot V^{2}\\cdot C_d=", "psf on a sign, Eq. 3.8.1-1");
  text(`Wind on the signs: ${r.wind.signs.map((F) => `${num(F, 2)} kip`).join(", ")}; on the span ${num(r.wind.wWindBeam * 1000, 1)} plf, on each post ${num(r.wind.wWindPost * 1000, 1)} plf.`);

  text("Across the frame: the span simply supported on the posts, each post a cantilever", "subheading");
  m(`R_w\\coloneq ${num(r.wind.Rw, 3)}\\mathrm{kip}`, "The span's larger reaction");
  m(`H\\coloneq ${num(i.height)}\\mathrm{ft}`);
  m(`w_p\\coloneq ${num(r.wind.wWindPost, 4)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, "Wind on a post");
  m("M_{w}\\coloneq R_w\\cdot H+\\frac{w_p\\cdot H^{2}}{2}=", "At the post's base", "kip·ft");

  text("In the frame's plane: gravity on the portal", "subheading");
  text(`From the plane frame (posts fixed at the shafts, rigid knees): the span's sagging moment at midspan ${num(r.frame.gravity.Mmid, 1)} kip·ft, at the knees ${num(r.frame.knee, 1)} kip·ft; each post's base ${num(r.frame.postBase.M, 1)} kip·ft and ${num(r.frame.postBase.P, 2)} kip.`);

  text("Members (Section 5)", "subheading");
  const p = r.post;
  m(`D_p\\coloneq ${num(i.postD)}\\mathrm{in}`);
  m(`t_p\\coloneq ${num(i.postWall, 4)}\\mathrm{in}`);
  m(`F_y\\coloneq ${num(i.Fy)}\\mathrm{ksi}`);
  m("Z_p\\coloneq\\frac{D_p^{3}-\\left(D_p-2\\cdot t_p\\right)^{3}}{6}=", undefined, "in^3");
  m(`M_{n}\\coloneq ${p.cls === "compact" ? "F_y\\cdot Z_p" : `F_y\\cdot Z_p\\cdot ${num(p.Mn / p.Mp, 4)}`}=`, `Table 5.8.2-1, ${p.cls}`, "kip·in");
  const g = r.combos.posts[1];
  m(`M_u\\coloneq ${num(g.M * 12, 1)}\\mathrm{kip}\\cdot\\mathrm{in}`, "Extreme I, in and across the frame (Eq. 5.12.1-4)");
  m(`P_u\\coloneq ${num(g.P, 3)}\\mathrm{kip}`);
  m(`P_n\\coloneq ${num(p.Pn, 1)}\\mathrm{kip}`, "5.10.2");
  m(ok("\\frac{P_u}{2\\cdot0.90\\cdot P_n}+\\frac{M_u}{0.90\\cdot M_n}", "1"), "Eq. 5.12.1-3 (torsion under 0.2 Tr)");

  text("Deflection (10.4.1)", "subheading");
  m(ok(`${num(r.deflection, 3)}\\mathrm{in}`, `\\frac{${num(i.span * 12, 1)}\\mathrm{in}}{150}`), "The span's vertical under Service I");
  lines.push(...checksSummary([{ checks: r.checks }]));
  return lines;
}

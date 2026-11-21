import type { Line } from "@/lib/calcs/library/templates";
import { checksSummary } from "../checks-summary";
import { COLOR_NOTE, INPUT_COLOR, isInput, num } from "../calc-style";
import type { Figure } from "../figures";
import { ftIn } from "../rebar/bars";
import { PIPE_SIZES } from "../rebar/cdot-items";
import { countAt, runGroups, type PreGroup } from "../rebar/runs";
import { markGroups, schedule, type ConcreteItem } from "../rebar/schedule";
import { ftT, inT, plus18T } from "../takeoff/tex";
import type { DetailView, Takeoff } from "../takeoff/types";
import { BARS } from "../walls/cip";
import { CSP_SECTIONS, designPipe, GAUGE, RCP_CLASSES, type PipeInputs } from "./pipe";
import { designThreeSided, type ThreeSidedInputs } from "./three-sided";

// The pipe and three-sided culverts' drawings, take-offs and calc packages.
// Pipe: the standard installation's zones (AASHTO Figure 12.10.2.1-1, Table 12.10.2.1-1) or a steel pipe's structure
// backfill; the pipe's wall (RCP cages, or the corrugation's profile); the profile along the pipe with its end sections.
// Three-sided: the section with its fill, the precast unit, its bars and the footings; the corner's bars; the footing
// with its keyway.

type Pt = [number, number];
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const circle = (cx: number, cy: number, r: number, n = 48): Pt[] => Array.from({ length: n }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n)] as Pt);
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 24): Pt[] => Array.from({ length: n + 1 }, (_, k) => {
  const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt;
});
/** A number for a drawing's label: plain, no exponent. */
const n2 = (v: number, d = 2) => String(+v.toFixed(d));
const ok = (demand: string, capacity: string) => `\\operatorname{if}\\left(${demand}\\le ${capacity},\\text{OK},\\text{NG}\\right)=`;
const CLASS_NAME: Record<number, string> = { 2: "II", 3: "III", 4: "IV", 5: "V" };

// Table 12.10.2.1-1: the haunch and outer bedding, and the lower side, by installation type (Standard Proctor).
const ZONES: Record<number, { haunch: string; side: string; bedding: string }> = {
  1: { haunch: "95% SW", side: "90% SW, 95% ML or 100% CL", bedding: "Do/24 (at least 3 in.)" },
  2: { haunch: "90% SW or 95% ML", side: "85% SW, 90% ML or 95% CL", bedding: "Do/24 (at least 3 in.)" },
  3: { haunch: "85% SW, 90% ML or 95% CL", side: "85% SW, 90% ML or 95% CL", bedding: "Do/24 (at least 3 in.)" },
  4: { haunch: "no compaction required, except if CL, 85% CL", side: "no compaction required, except if CL, 85% CL", bedding: "none required in soil (Do/12, at least 6 in., on rock)" },
};

/** The pipe's outside diameter (ft) and its wall (in). */
function pipeOutside(i: PipeInputs) {
  if (i.material === "rcp") {
    const t = i.wall > 0 ? i.wall : i.D / 12 + 1;
    return { Do: (i.D + 2 * t) / 12, t };
  }
  const depth = i.corrugation === "2-2/3x1/2" ? 0.5 : 1;
  return { Do: (i.D + 2 * depth) / 12, t: i.thickness };
}

export function pipeViews(i: PipeInputs, lengthFt = 60): DetailView[] {
  const r = designPipe(i);
  const views: DetailView[] = [];
  const { Do, t } = pipeOutside(i);
  const H = i.minFill;
  const rcp = i.material === "rcp";

  // --- the installation (ft): the pipe on its bedding, the zones, the fill to the least cover -----------------------
  const tb = rcp ? (i.installation === 4 ? 0 : Math.max(3 / 12, Do / 24)) : Math.max(3 / 12, Do / 24);
  const yc = Do / 2; // the pipe's center, the invert's outside at 0
  const half = Do / 2 + Math.max(Do / 2, 1.5); // the zones' half width
  const top = Do + H;
  const sec: DetailView = {
    title: rcp
      ? `Standard installation Type ${i.installation}: ${i.D} in. Class ${CLASS_NAME[i.rcpClass]} RCP under ${n2(H)} to ${n2(i.maxFill)} ft of fill`
      : `Corrugated steel pipe, ${i.D} in. ${i.corrugation.replace("x", " x ")} in., ${i.thickness} in. (${GAUGE[i.thickness] ?? "-"} ga), under ${n2(H)} to ${n2(i.maxFill)} ft of fill`,
    polys: [],
    lines: [],
    dots: [],
    labels: [],
  };
  const xs = [-half - 2, half + 2];
  sec.polys.push({ pts: rect(xs[0], -tb - 1.5, xs[1], -tb), style: "earth" }); // the foundation
  if (tb > 0) sec.polys.push({ pts: rect(-half, -tb, half, 0), style: "dashed" }); // the bedding
  if (rcp) {
    // haunch and outer bedding to the springline, beside the pipe; the lower side beyond; the overfill above.
    sec.polys.push({ pts: rect(-half, 0, -Do / 2 - Do / 6, yc), style: "dashed" });
    sec.polys.push({ pts: rect(Do / 2 + Do / 6, 0, half, yc), style: "dashed" });
    sec.polys.push({ pts: rect(xs[0], yc, xs[1], top), style: "earth" });
    sec.polys.push({ pts: rect(xs[0], -tb, -half, yc), style: "earth" });
    sec.polys.push({ pts: rect(half, -tb, xs[1], yc), style: "earth" });
    // the middle bedding, loosely placed, Do/3 wide under the invert
    if (tb > 0) sec.lines.push({ pts: [[-Do / 6, -tb], [-Do / 6, 0]], mark: "", kind: "secondary" }, { pts: [[Do / 6, -tb], [Do / 6, 0]], mark: "", kind: "secondary" });
  } else {
    // structure backfill around the pipe to 1 ft over its crown, the fill above
    const yb = Math.min(top, Do + 1);
    sec.polys.push({ pts: rect(-half, 0, half, yb), style: "dashed" });
    sec.polys.push({ pts: rect(xs[0], yb, xs[1], top), style: "earth" });
    sec.polys.push({ pts: rect(xs[0], -tb, -half, yb), style: "earth" });
    sec.polys.push({ pts: rect(half, -tb, xs[1], yb), style: "earth" });
  }
  // The pipe: the wall as a ring (outside and inside), RCP in concrete.
  if (rcp) {
    sec.polys.push({ pts: circle(0, yc, Do / 2), style: "concrete" });
    sec.polys.push({ pts: circle(0, yc, i.D / 24), style: "void" });
  } else {
    sec.lines.push({ pts: [...circle(0, yc, i.D / 24 + 0.02), circle(0, yc, i.D / 24 + 0.02)[0]], mark: "", kind: "main" });
    sec.polys.push({ pts: circle(0, yc, i.D / 24), style: "void" });
  }
  // The road, and the cover dimension.
  sec.lines.push({ pts: [[xs[0], top], [xs[1], top]], mark: "", kind: "main" });
  const xd = half + 1.2;
  sec.lines.push({ pts: [[xd, Do], [xd, top]], mark: "", kind: "secondary" }, { pts: [[xd - 0.25, Do], [xd + 0.25, Do]], mark: "", kind: "secondary" }, { pts: [[xd - 0.25, top], [xd + 0.25, top]], mark: "", kind: "secondary" });
  sec.labels!.push({ x: xd - 0.3, y: (Do + top) / 2 - 0.2, text: `H ${n2(H)} ft (least)`, anchor: "end" });
  sec.labels!.push({ x: 0, y: top + 0.5, text: i.pavement === "none" ? "Finished grade" : `${i.pavement === "rigid" ? "Rigid" : "Flexible"} pavement${i.traffic ? ", HL-93" : ""}`, anchor: "middle" });
  sec.labels!.push({ x: 0, y: yc + 0.15, text: `${i.D} in.`, anchor: "middle" });
  sec.lines.push({ pts: [[-i.D / 24, yc], [i.D / 24, yc]], mark: "", kind: "secondary" });
  // The zones' notes, under the section.
  const z = ZONES[rcp ? i.installation : 1];
  const leg = rcp
    ? [
        `Overfill above the springline; haunch and outer bedding (Do/6 beside the pipe) ${z.haunch}; lower side ${z.side}`,
        `Bedding ${z.bedding}; middle bedding Do/3 wide under the invert, loosely placed, uncompacted (Table 12.10.2.1-1)`,
        `Do = ${n2(Do * 12, 1)} in., wall ${n2(t, 2)} in.${i.wall > 0 ? "" : " (Wall B)"}; fill ${i.gamma} pcf; ${r.rcp ? `D-load needed ${Math.round(r.rcp.gov.D01)} lb/ft/ft at ${n2(r.rcp.gov.H)} ft against ${RCP_CLASSES[i.rcpClass]}` : ""}`,
      ]
    : [
        "Structure backfill to 1 ft over the crown, in 8 in. lifts, compacted to 90% (AASHTO LRFD Construction Specifications 26.5)",
        `Bedding shaped to the pipe, ${n2(tb * 12, 1)} in. of uncompacted material under the invert; the fill ${i.gamma} pcf`,
        r.csp ? `Thrust ${n2(r.csp.gov.TL)} kip/ft at ${n2(r.csp.gov.H)} ft against ${n2(r.csp.fWall * r.csp.sec.A)}; FF ${n2(r.csp.FF, 1)} in/kip (limit ${r.csp.FFlim})` : "",
      ];
  leg.forEach((s, k) => sec.labels!.push({ x: xs[0], y: -tb - 2.6 - 0.8 * k, text: s, anchor: "start" }));
  if (rcp) {
    sec.labels!.push({ x: (-half - Do / 2 - Do / 6) / 2, y: yc / 2 - 0.1, text: "Lower side", anchor: "middle" });
    sec.labels!.push({ x: (half + Do / 2 + Do / 6) / 2, y: yc / 2 - 0.1, text: "Lower side", anchor: "middle" });
    // the haunch and the bedding by leaders to labels under the foundation line
    sec.lines.push({ pts: [[-Do / 2 - Do / 12, yc / 3], [-Do / 2 - 0.2, -tb - 0.9]], mark: "", kind: "secondary" });
    sec.labels!.push({ x: -Do / 2 - 0.3, y: -tb - 1.1, text: "Haunch and outer bedding", anchor: "end" });
    if (tb > 0) {
      sec.lines.push({ pts: [[0, -tb / 2], [0.3, -tb - 0.9]], mark: "", kind: "secondary" });
      sec.labels!.push({ x: 0.4, y: -tb - 1.1, text: "Middle bedding Do/3, uncompacted", anchor: "start" });
    }
  } else sec.labels!.push({ x: -half + 0.1, y: Do / 2 - 0.15, text: "Structure backfill", anchor: "start" });
  sec.labels!.push({ x: xs[0] + 0.2, y: top - 0.7, text: rcp ? "Overfill" : "Fill", anchor: "start" });
  views.push(sec);

  // --- the wall (in) ---------------------------------------------------------------------------------------------
  if (rcp) {
    const ri = i.D / 2;
    const ro = ri + t;
    const wd: DetailView = { title: `Pipe wall at the crown: ${i.D} in., ${n2(t, 2)} in. wall, Class ${CLASS_NAME[i.rcpClass]} (inches)`, polys: [], lines: [], dots: [], labels: [] };
    wd.polys.push({ pts: [...arc(0, 0, ro, 60, 120), ...arc(0, 0, ri, 120, 60)], style: "concrete" });
    const cages = i.D >= 36 ? [ri + 1, ro - 1] : [ri + t / 2];
    for (const rr of cages) wd.lines.push({ pts: arc(0, 0, rr, 62, 118), mark: "", kind: "main" });
    wd.labels!.push({ x: 0, y: ro + 1, text: `Circular reinforcement by ASTM C76 / AASHTO M 170 for Class ${CLASS_NAME[i.rcpClass]}${i.D >= 36 ? ", inner and outer cages" : ", one cage"}, 1 in. cover`, anchor: "middle" });
    wd.labels!.push({ x: 0, y: ri - 2, text: `Inside diameter ${i.D} in.; D0.01 ${RCP_CLASSES[i.rcpClass]} lb/ft/ft (three-edge bearing)`, anchor: "middle" });
    const a = (66 * Math.PI) / 180;
    wd.lines.push({ pts: [[ri * Math.cos(a), ri * Math.sin(a)], [ro * Math.cos(a), ro * Math.sin(a)]], mark: "", kind: "secondary" });
    wd.labels!.push({ x: ((ri + ro) / 2) * Math.cos(a) + 0.6, y: ((ri + ro) / 2) * Math.sin(a) - 0.3, text: `${n2(t, 2)} in. wall`, anchor: "start" });
    views.push(wd);
  } else {
    const [pitch, depth] = i.corrugation === "2-2/3x1/2" ? [2.667, 0.5] : i.corrugation === "3x1" ? [3, 1] : [5, 1];
    const sec2 = CSP_SECTIONS[i.corrugation].find((s) => Math.abs(s.t - i.thickness) < 1e-6);
    const wv: DetailView = { title: `Corrugation: ${n2(pitch, 3)} x ${depth} in., ${i.thickness} in. (${GAUGE[i.thickness] ?? "-"} ga), helical lock seam (inches)`, polys: [], lines: [], dots: [], labels: [] };
    const prof: Pt[] = [];
    for (let k = 0; k <= 120; k++) {
      const x = (3 * pitch * k) / 120;
      prof.push([x, (depth / 2) * Math.sin((2 * Math.PI * x) / pitch)]);
    }
    wv.lines.push({ pts: prof, mark: "", kind: "main" });
    wv.lines.push({ pts: [[0, -depth / 2 - 0.4], [pitch, -depth / 2 - 0.4]], mark: "", kind: "secondary" });
    wv.labels!.push({ x: pitch / 2, y: -depth / 2 - 0.9, text: `pitch ${n2(pitch, 3)} in.`, anchor: "middle" });
    wv.lines.push({ pts: [[3 * pitch + 0.4, -depth / 2], [3 * pitch + 0.4, depth / 2]], mark: "", kind: "secondary" });
    wv.labels!.push({ x: 3 * pitch + 0.4, y: -depth / 2 - 0.9, text: `depth ${depth} in.`, anchor: "end" });
    if (sec2) wv.labels!.push({ x: 0, y: depth / 2 + 0.8, text: `A ${sec2.A} in2/ft, r ${sec2.r} in., I ${n2(sec2.I * 1000, 3)}E-3 in4/in (Table A12-1); Fy ${i.Fy} ksi, Fu ${i.Fu} ksi (AASHTO M 36)`, anchor: "start" });
    views.push(wv);
  }

  // --- the profile along the pipe (ft), with its end sections ---------------------------------------------------
  const pr: DetailView = { title: `Profile: ${n2(lengthFt, 1)} ft of pipe with end sections (CDOT M-603-10)`, polys: [], lines: [], dots: [], labels: [] };
  const hRoad = Do + H;
  const slope = 2; // 2:1 fill slopes to the ends
  const crest = Math.max(4, lengthFt - 2 * slope * hRoad);
  const x0 = (lengthFt - crest) / 2;
  pr.polys.push({ pts: [[-4, 0], [0, 0], [x0, hRoad], [x0 + crest, hRoad], [lengthFt, 0], [lengthFt + 4, 0], [lengthFt + 4, -1.5], [-4, -1.5]], style: "earth" });
  pr.polys.push({ pts: rect(0, 0, lengthFt, Do), style: "concrete" });
  pr.polys.push({ pts: rect(0, (Do - i.D / 12) / 2, lengthFt, (Do + i.D / 12) / 2), style: "void" });
  const es = Math.max(3, Math.min(8, Do * 1.5)); // an end section's length, about
  pr.polys.push({ pts: [[-es, 0], [0, 0], [0, Do], [-es, Do * 0.35]], style: rcp ? "concrete" : "dashed" });
  pr.polys.push({ pts: [[lengthFt, 0], [lengthFt + es, 0], [lengthFt + es, Do * 0.35], [lengthFt, Do]], style: rcp ? "concrete" : "dashed" });
  pr.lines.push({ pts: [[x0, hRoad], [x0 + crest, hRoad]], mark: "", kind: "main" });
  pr.labels!.push({ x: lengthFt / 2, y: hRoad + 0.6, text: `Roadway, ${n2(H)} ft least cover; 2:1 slopes to the end sections`, anchor: "middle" });
  pr.labels!.push({ x: lengthFt / 2, y: -1.2, text: `${i.D} in. ${rcp ? "RCP" : "CSP"}, ${n2(lengthFt, 1)} ft between the end sections, on its bedding`, anchor: "middle" });
  pr.labels!.push({ x: -es, y: Do + 0.8, text: "End section", anchor: "start" });
  pr.labels!.push({ x: lengthFt + es, y: Do + 0.8, text: "End section", anchor: "end" });
  views.push(pr);
  return views;
}

/** The pipe's pay item by its diameter, where CDOT has one (12 to 96 in.). */
export function pipePayItem(i: PipeInputs, role: "pipe" | "end-section") {
  const d = Math.round(i.D);
  if (!PIPE_SIZES.includes(d)) return undefined;
  const dd = String(d).padStart(2, "0");
  if (role === "pipe") return `603-${i.material === "rcp" ? "01" : "10"}${dd}0`;
  return `603-${i.material === "rcp" ? "05" : "02"}0${dd}`;
}

export function pipeTakeoff(i: PipeInputs, lengthFt = 60): Takeoff {
  const name = i.material === "rcp" ? `${i.D} in. Class ${CLASS_NAME[i.rcpClass]} reinforced concrete pipe` : `${i.D} in. corrugated steel pipe (${i.thickness} in.)`;
  return {
    what: i.material === "rcp" ? "reinforced concrete pipe" : "corrugated steel pipe",
    schedule: schedule([], []),
    quantities: {
      pipe: { value: lengthFt, basis: `${name}, ${num(lengthFt, 1)} ft between the end sections`, math: `${num(lengthFt, 1)}\\mathrm{ft}`, ref: "Pipe: its length, by the foot" },
      "end-section": { value: 2, basis: `an end section at each end, ${i.D} in.`, math: "2", ref: "End sections, each (CDOT M-603-10)" },
    },
    views: pipeViews(i, lengthFt),
    notes: [
      `${name}${i.material === "rcp" ? `, standard installation Type ${i.installation}` : ", helical lock seam"}. The excavation, bedding and backfill are included in the pipe's item (CDOT Standard Specifications 603).`,
      "End sections by CDOT M-603-10; cutoff walls and riprap at the outlet as the hydraulics require.",
    ],
    length: { label: "Pipe length", value: lengthFt, unit: "ft" },
  };
}

export function pipeCalcLines(i: PipeInputs, title: string, figures?: Figure[]): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note") => lines.push({ text: t, ...(style ? { style } : {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}), ...(isInput(math) ? { color: INPUT_COLOR } : {}) });
  const r = designPipe(i);
  text(title.toUpperCase(), "heading");
  text(
    i.material === "rcp"
      ? `A ${i.D} in. reinforced concrete pipe, Class ${CLASS_NAME[i.rcpClass]}, under ${i.minFill} to ${i.maxFill} ft of fill, by the indirect design method of AASHTO LRFD 12.10.4.3 on standard installation Type ${i.installation}.`
      : `A ${i.D} in. corrugated steel pipe, ${i.corrugation.replace("x", " x ")} in. corrugations, ${i.thickness} in. thick, helical lock seam, under ${i.minFill} to ${i.maxFill} ft of fill, by AASHTO LRFD 12.7.`,
  );
  text(COLOR_NOTE, "note");
  for (const fg of figures ?? []) lines.push({ region: fg });

  if (r.rcp) {
    const p = r.rcp;
    text("Earth, fluid and live loads (12.10.2)", "subheading");
    m(`D_{i}\\coloneq ${num(i.D)}\\mathrm{in}`, "Inside diameter");
    m(`t\\coloneq ${num(p.t, 3)}\\mathrm{in}`, i.wall > 0 ? "Wall" : "Wall B: D/12 + 1 in.");
    m("B_{c}\\coloneq D_{i}+2\\cdot t=", "Outside diameter", "ft");
    m(`w\\coloneq ${num(p.w * 1000)}\\frac{\\mathrm{lbf}}{\\mathrm{ft}^{3}}`, "Fill, at least 110 pcf (12.10.2.1)");
    m(`F_{e}\\coloneq ${num(p.Fe, 2)}`, `VAF, Type ${i.installation} (Table 12.10.2.1-3)`);
    if (p.WF > 0) m(`W_{F}\\coloneq 62.4\\frac{\\mathrm{lbf}}{\\mathrm{ft}^{3}}\\cdot\\frac{\\pi\\cdot D_{i}^{2}}{4}=`, "Fluid, the pipe full (12.10.2.2)", "lbf/ft");
    for (const c of p.cases) {
      text(`At ${num(c.H, 2)} ft of fill:`, "note");
      m(`W_{E}\\coloneq F_{e}\\cdot w\\cdot B_{c}\\cdot ${num(c.H, 3)}\\mathrm{ft}=`, "Eq. 12.10.2.1-1", "lbf/ft");
      text(i.traffic ? `Live load (12.10.2.3, 3.6.1.2.6): ${c.ll.vehicle}, IM ${num(c.ll.IM * 100, 1)}%, m 1.2, spread over ${num(c.ll.W, 2)} ft × ${num(c.ll.L, 2)} ft: ${num(c.ll.p * 1000, 1)} psf; WL = p·min(L, Bc) = ${num(c.WL * 1000, 0)} lb/ft.` : "No live load.");
      text(`Bedding factors: BFE = ${num(c.BFe, 2)} (Table 12.10.4.3.2a-1), BFLL = ${num(c.BFll, 2)} (Table 12.10.4.3.2c-1).`);
      m(`D_{0.01}\\coloneq\\frac{12}{${num(i.D)}}\\cdot\\left(\\frac{${num(c.WE * 1000, 1)}+${num(p.WF * 1000, 1)}}{${num(c.BFe, 2)}}+\\frac{${num(c.WL * 1000, 1)}}{${num(c.BFll, 2)}}\\right)${i.installation === 1 ? "\\cdot 1.10" : ""}=`, "Eq. 12.10.4.3.1-1, lb/ft/ft");
      m(ok("D_{0.01}", `${RCP_CLASSES[i.rcpClass]}`), `Class ${CLASS_NAME[i.rcpClass]} (AASHTO M 170)`);
    }
    text(`The least class that carries ${Math.round(p.gov.D01)} lb/ft/ft: ${p.needClass ? `Class ${CLASS_NAME[p.needClass]}` : "none of the standard classes; a special design (12.10.4.2)"}.`);
  }
  if (r.csp) {
    const c = r.csp;
    text("Thrust (12.7.2.2)", "subheading");
    m(`S\\coloneq ${num(i.D)}\\mathrm{in}`, "Span (diameter)");
    m(`A\\coloneq ${num(c.sec.A, 3)}\\frac{\\mathrm{in}^{2}}{\\mathrm{ft}}`, "Table A12-1");
    m(`r\\coloneq ${num(c.sec.r, 4)}\\mathrm{in}`, "Table A12-1");
    m(`I\\coloneq ${num(c.sec.I * 1000, 3)}\\cdot 10^{-3}\\frac{\\mathrm{in}^{4}}{\\mathrm{in}}`, "Table A12-1");
    for (const k of c.cases) {
      text(`At ${num(k.H, 2)} ft of fill: PFD = 1.95·γ·H = ${num(k.PFD, 3)} ksf (EV, flexible buried structure, Table 3.4.1-2); ${i.traffic ? `PFL = 1.75·p = ${num(k.PFL, 3)} ksf (${k.ll.vehicle}, IM and m 1.2), CL = ${num(k.CL, 2)} ft, F1 = ${num(k.F1, 3)}` : "no live load"}.`);
      m(`T_{L}\\coloneq\\frac{${num(k.PFD, 3)}\\cdot ${num(c.S, 3)}}{2}+\\frac{${num(k.PFL, 3)}\\cdot ${num(k.CL, 3)}\\cdot ${num(k.F1, 3)}}{2}=`, "Eq. 12.7.2.2-1, kip/ft");
    }
    text("Wall area and buckling (12.7.2.3, 12.7.2.4)", "subheading");
    m(`\\frac{r}{0.22}\\cdot\\sqrt{\\frac{24\\cdot 29000}{${num(i.Fu)}}}=`, "The limit on S (in)", "in");
    m(`f_{cr}\\coloneq ${num(c.fcr, 3)}\\mathrm{ksi}`, i.D < c.lim ? "Eq. 12.7.2.4-1: Fu − (Fu²/48E)(kS/r)²" : "Eq. 12.7.2.4-2: 12E/(kS/r)²");
    m(ok(`${num(c.gov.TL, 3)}`, `1.0\\cdot ${num(c.fWall, 3)}\\cdot ${num(c.sec.A, 3)}`), "Wall area, φ 1.0 (kip/ft)");
    text("Handling and installation (12.7.2.6)", "subheading");
    m("FF\\coloneq\\frac{S^{2}}{29000\\mathrm{ksi}\\cdot I}=", "Flexibility factor", "in/kip");
    m(ok("FF", `${c.FFlim}\\frac{\\mathrm{in}}{\\mathrm{kip}}`), "Table 12.5.6.1-1");
  }
  text(`Minimum cover (Table 12.6.6.3-1): ${i.material === "rcp" ? (i.pavement === "rigid" ? "9 in. under rigid pavement" : "Bc/8, at least 12 in.") : "S/8, at least 12 in."}`);
  lines.push(...checksSummary([{ checks: r.checks }]));
  return lines;
}

// --- three-sided culvert ---------------------------------------------------------------------------------------

export function threeSidedViews(i: ThreeSidedInputs): DetailView[] {
  const r = designThreeSided(i);
  const views: DetailView[] = [];
  const tw = i.tw / 12;
  const ts = i.ts / 12;
  const cv = i.cover / 12;
  const fT = i.footT / 12;
  const top = i.rise + ts + i.fill;
  const bed = i.footDepth - fT; // the stream bed above the footings' tops
  const xL = -tw;
  const xR = i.span + tw;
  const ext = i.footW / 2 + 6;
  const sec: DetailView = { title: `Section: ${n2(i.span)} ft span x ${n2(i.rise)} ft rise precast three-sided unit, ${n2(i.fill)} ft of fill, on cast-in-place footings`, polys: [], lines: [], dots: [], labels: [] };
  // The ground: the fill over the top and beside the legs, down to the footings' base; the stream bed inside.
  sec.polys.push({ pts: [[xL - ext, -fT - 1], [xR + ext, -fT - 1], [xR + ext, top], [xL - ext, top]], style: "earth" });
  sec.polys.push({ pts: rect(0, bed, i.span, i.rise), style: "void" });
  // The unit: legs and the top slab, the corners with a 45° haunch on the inside (about 6 in.).
  const hc = Math.min(0.5, i.span / 20);
  sec.polys.push({ pts: [[xL, 0], [0, 0], [0, i.rise - hc], [hc, i.rise], [i.span - hc, i.rise], [i.span, i.rise - hc], [i.span, 0], [xR, 0], [xR, i.rise + ts], [xL, i.rise + ts]], style: "concrete" });
  // The footings, centered under the legs, with the keyway.
  const fcL = xL / 2;
  const fcR = i.span + tw / 2;
  for (const c of [fcL, fcR]) sec.polys.push({ pts: rect(c - i.footW / 2, -fT, c + i.footW / 2, 0), style: "concrete" });
  // Bars: the slab's inside face, the outside face around the corners and down the legs, the legs' inside face.
  const yIn = i.rise + cv;
  const yOut = i.rise + ts - cv;
  sec.lines.push({ pts: [[xL + cv + 0.3, yIn], [xR - cv - 0.3, yIn]], mark: "", kind: "main" });
  sec.lines.push({ pts: [[xL + cv, 0.25], [xL + cv, yOut], [xR - cv, yOut], [xR - cv, 0.25]], mark: "", kind: "main" });
  for (const x of [-cv, i.span + cv]) sec.lines.push({ pts: [[x, 0.25], [x, i.rise + ts / 2]], mark: "", kind: "secondary" });
  for (const c of [fcL, fcR]) sec.lines.push({ pts: [[c - i.footW / 2 + 0.25, -fT + 0.25], [c + i.footW / 2 - 0.25, -fT + 0.25]], mark: "", kind: "main" });
  // Dimensions: span, rise, fill.
  const yS = bed + 0.6;
  sec.lines.push({ pts: [[0, yS], [i.span, yS]], mark: "", kind: "secondary" });
  sec.labels!.push({ x: i.span / 2, y: yS + 0.3, text: `Span ${n2(i.span)} ft (clear)`, anchor: "middle" });
  sec.lines.push({ pts: [[i.span * 0.8, 0], [i.span * 0.8, i.rise]], mark: "", kind: "secondary" });
  sec.labels!.push({ x: i.span * 0.8 + 0.3, y: (bed + i.rise) / 2, text: `Rise ${n2(i.rise)} ft`, anchor: "start" });
  const xf = xR + i.footW / 2 + 1;
  sec.lines.push({ pts: [[xf, i.rise + ts], [xf, top]], mark: "", kind: "secondary" }, { pts: [[xf - 0.25, top], [xf + 0.25, top]], mark: "", kind: "secondary" }, { pts: [[xf - 0.25, i.rise + ts], [xf + 0.25, i.rise + ts]], mark: "", kind: "secondary" });
  sec.labels!.push({ x: xf + 0.4, y: (i.rise + ts + top) / 2 - 0.2, text: `Fill ${n2(i.fill)} ft`, anchor: "start" });
  sec.lines.push({ pts: [[xL - ext, top], [xR + ext, top]], mark: "", kind: "main" });
  sec.labels!.push({ x: i.span / 2, y: top + 0.5, text: i.traffic ? "Roadway, HL-93" : "Finished grade", anchor: "middle" });
  sec.labels!.push({ x: 0.3, y: bed + 0.15, text: "Stream bed", anchor: "start" });
  // Notes below.
  const note = [
    `Top slab ${i.ts} in.: inside face #${i.slabBottom.bar} @ ${i.slabBottom.spacing} in.; outside face #${i.slabTop.bar} @ ${i.slabTop.spacing} in. around the corners; legs ${i.tw} in.: outside #${i.legOut.bar} @ ${i.legOut.spacing} in., inside #${i.legIn.bar} @ ${i.legIn.spacing} in.; ${i.cover} in. cover`,
    `Footings ${n2(i.footW)} ft x ${i.footT} in., #${i.footBars.bar} @ ${i.footBars.spacing} in. bottom, base ${n2(i.footDepth)} ft below the stream bed; legs ${i.base === "fixed" ? "fixed in" : "seated in a grouted keyway (pinned)"}`,
    `f'c ${i.fc} ksi, fy ${i.fy} ksi; backfill ${i.gamma} pcf, phi ${i.phi} deg, at-rest k0 ${n2(r.geometry.k0, 3)}; Mu midspan ${n2(r.Mu.slabMid, 1)}, corner ${n2(r.Mu.slabCorner, 1)} kip-ft/ft`,
  ];
  note.forEach((s, k) => sec.labels!.push({ x: xL - ext, y: -fT - 2 - 0.9 * k, text: s, anchor: "start" }));
  views.push(sec);

  // --- the corner (in) -------------------------------------------------------------------------------------------
  const T = i.ts;
  const W = i.tw;
  const cr: DetailView = { title: "Corner detail (inches)", polys: [], lines: [], dots: [], labels: [] };
  const run = 36;
  const hcI = hc * 12;
  cr.polys.push({ pts: [[-W, -run], [0, -run], [0, -hcI], [hcI, 0], [run, 0], [run, T], [-W, T]], style: "concrete" });
  const c = i.cover;
  const db = (b: number) => BARS[b]?.dia ?? 0.75;
  // the outside bar, bent around the corner
  cr.lines.push({ pts: [[-W + c, -run], [-W + c, T - c - 2], ...arc(-W + c + 2, T - c - 2, 2, 180, 90, 6), [run, T - c]], mark: "", kind: "main" });
  // the slab's inside bar, into the leg with a hook
  cr.lines.push({ pts: [[run, c], [-W + c + db(i.legOut.bar) + 1, c], [-W + c + db(i.legOut.bar) + 1, c - 12]], mark: "", kind: "main" });
  // the leg's inside bar
  cr.lines.push({ pts: [[-c, -run], [-c, T / 2]], mark: "", kind: "secondary" });
  // distribution bars end-on
  for (let x = 6; x < run; x += 12) cr.dots.push({ x, y: T - c - db(i.slabTop.bar), d: 0.625, mark: "" }, { x, y: c + db(i.slabBottom.bar), d: 0.625, mark: "" });
  for (let y = -run + 6; y < -3; y += 12) cr.dots.push({ x: -W + c + db(i.legOut.bar), y, d: 0.625, mark: "" });
  cr.labels!.push({ x: run + 1, y: T - c - 0.3, text: `#${i.slabTop.bar} @ ${i.slabTop.spacing} outside face, continuous around the corner`, anchor: "start" });
  cr.labels!.push({ x: run + 1, y: c - 0.3, text: `#${i.slabBottom.bar} @ ${i.slabBottom.spacing} inside face, hooked into the leg`, anchor: "start" });
  cr.lines.push({ pts: [[-c, -run / 2], [run + 0.5, -run / 2 + 0.3]], mark: "", kind: "secondary" });
  cr.labels!.push({ x: run + 1, y: -run / 2, text: `Leg: #${i.legOut.bar} @ ${i.legOut.spacing} outside, #${i.legIn.bar} @ ${i.legIn.spacing} inside`, anchor: "start" });
  cr.labels!.push({ x: run + 1, y: -run / 2 - 3, text: `${c} in. cover; ${i.ts} in. slab, ${i.tw} in. leg; distribution bars #5 @ 12`, anchor: "start" });
  views.push(cr);

  // --- the footing (in) ------------------------------------------------------------------------------------------
  const B = i.footW * 12;
  const ft: DetailView = { title: `Footing: ${n2(i.footW)} ft x ${i.footT} in. with the leg's keyway (inches)`, polys: [], lines: [], dots: [], labels: [] };
  const key = { w: W + 4, d: Math.min(6, i.footT / 3) };
  ft.polys.push({ pts: [[-B / 2, -i.footT], [B / 2, -i.footT], [B / 2, 0], [key.w / 2, 0], [key.w / 2, -key.d], [-key.w / 2, -key.d], [-key.w / 2, 0], [-B / 2, 0]], style: "concrete" });
  ft.polys.push({ pts: rect(-key.w / 2, -key.d, key.w / 2, -key.d + 1), style: "dashed" });
  ft.polys.push({ pts: rect(-W / 2, -key.d + 1, W / 2, 24), style: "concrete" });
  ft.lines.push({ pts: [[-B / 2 + 3, -i.footT + 3], [B / 2 - 3, -i.footT + 3]], mark: "", kind: "main" });
  for (let x = -B / 2 + 6; x < B / 2 - 3; x += 12) ft.dots.push({ x, y: -i.footT + 3 + db(i.footBars.bar), d: 0.625, mark: "" });
  ft.lines.push({ pts: [[-B / 2 + 3, -3], [-key.w / 2 - 2, -3]], mark: "", kind: "secondary" }, { pts: [[key.w / 2 + 2, -3], [B / 2 - 3, -3]], mark: "", kind: "secondary" });
  ft.labels!.push({ x: -B / 2, y: -i.footT - 6, text: `Bottom: #${i.footBars.bar} @ ${i.footBars.spacing} transverse, #5 @ 12 longitudinal, 3 in. cover; top: #4 @ 12 each way, stopped 2 in. from the keyway`, anchor: "start" });
  ft.labels!.push({ x: W / 2 + 2, y: 12, text: `Precast leg ${i.tw} in., in a ${key.w} x ${n2(key.d, 1)} in. keyway, grouted`, anchor: "start" });
  ft.labels!.push({ x: -B / 2, y: -i.footT - 9, text: `Bearing ${n2(r.footing.qu, 2)} ksf on B' ${n2(r.footing.Beff, 2)} ft against ${n2(0.45 * i.qn, 2)} (0.45 qn)`, anchor: "start" });
  views.push(ft);
  return views;
}

export function threeSidedTakeoff(i: ThreeSidedInputs, lengthFt = 40): Takeoff {
  const pre: PreGroup[] = [];
  const Li = lengthFt * 12;
  const B = i.footW * 12;
  for (let side = 0; side < 2; side++) {
    const lap = { fy: i.fy, fc: i.fc, clearCover: 3, clearSpacing: Math.max(0.5, i.footBars.spacing - BARS[i.footBars.bar].dia), coating: "uncoated" as const };
    pre.push(...runGroups({ size: i.footBars.bar, count: countAt(Li - 6, i.footBars.spacing), straight: B - 6, use: "Footing, bottom, transverse", callout: `#${i.footBars.bar} @ ${ftIn(i.footBars.spacing)} (footing bottom)`, lap }).groups);
    pre.push(...runGroups({ size: 5, count: countAt(B - 6, 12), straight: Li - 6, use: "Footing, bottom, longitudinal", callout: "#5 @ 1'-0\" (footing bottom, longitudinal)", lap: { ...lap, clearSpacing: 11 } }).groups);
    pre.push(...runGroups({ size: 4, count: countAt(Li - 6, 12), straight: B - 6, use: "Footing, top, transverse", callout: "#4 @ 1'-0\" (footing top)", lap: { ...lap, clearSpacing: 11 } }).groups);
    pre.push(...runGroups({ size: 4, count: countAt(B - 6, 12), straight: Li - 6, use: "Footing, top, longitudinal", callout: "#4 @ 1'-0\" (footing top, longitudinal)", lap: { ...lap, clearSpacing: 11 } }).groups);
  }
  const groups = markGroups(pre);
  const cy = (2 * i.footW * (i.footT / 12) * lengthFt) / 27;
  const concrete: ConcreteItem[] = [{ label: "Footings (2)", cy, basis: `2 × ${num(i.footW, 2)} ft × ${i.footT} in × ${num(lengthFt, 1)} ft`, math: `2\\cdot ${ftT(i.footW)}\\cdot ${inT(i.footT)}\\cdot ${ftT(lengthFt)}`, ref: "Footings: 2 × B × thickness × length" }];
  const ex = (2 * (i.footW + 3) * i.footDepth * lengthFt) / 27;
  const exT = `2\\cdot ${plus18T(ftT(i.footW))}\\cdot ${ftT(i.footDepth)}\\cdot ${ftT(lengthFt)}`;
  const units = Math.ceil(lengthFt / 8 - 1e-9);
  return {
    what: "three-sided culvert",
    schedule: schedule(groups, concrete),
    quantities: {
      excavation: { value: ex, basis: `two footings, (${num(i.footW, 2)} + 3) ft × ${num(i.footDepth, 2)} ft deep × ${num(lengthFt, 1)} ft, M-206-1's 18 in beyond the concrete`, math: exT, ref: "CDOT M-206-1" },
      ...(ex - cy > 0 ? { backfill: { value: ex - cy, basis: "the excavation less the footings", terms: [exT, `-${num(cy)}\\mathrm{yd}^{3}`], ref: "CDOT M-206-1" } } : {}),
    },
    views: threeSidedViews(i),
    notes: [
      `About ${units} precast units of 8 ft over ${num(lengthFt, 1)} ft: ${i.span} ft span × ${i.rise} ft rise, ${i.ts} in top slab, ${i.tw} in legs; the units are furnished by the precaster to these bars and paid as the contract's precast structure item.`,
      "The units seat in a grouted keyway on the footings; joints between units sealed with a preformed joint sealant and wrapped with an external joint wrap (geotextile).",
      "Footing bars: the design's bottom transverse bars; #5 @ 12 in. longitudinal and #4 @ 12 in. top each way as distribution and temperature bars (AASHTO 5.10.6).",
    ],
    length: { label: "Culvert length", value: lengthFt, unit: "ft" },
  };
}

export function threeSidedCalcLines(i: ThreeSidedInputs, title: string, figures?: Figure[]): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note") => lines.push({ text: t, ...(style ? { style } : {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}), ...(isInput(math) ? { color: INPUT_COLOR } : {}) });
  const r = designThreeSided(i);
  const g = r.geometry;
  text(title.toUpperCase(), "heading");
  text(`A precast three-sided culvert, ${i.span} ft span by ${i.rise} ft rise, with ${i.ts} in top slab and ${i.tw} in legs, under ${i.fill} ft of fill, on cast-in-place footings, by AASHTO LRFD 12.14, per foot of length.`);
  text(COLOR_NOTE, "note");
  for (const fg of figures ?? []) lines.push({ region: fg });

  text("Loads (3.5, 3.11, 3.6; 12.11.2)", "subheading");
  m(`L\\coloneq ${num(g.L, 3)}\\mathrm{ft}`, "Centerline span");
  m(`h\\coloneq ${num(g.h, 3)}\\mathrm{ft}`, "Centerline height, the footings' top to the slab's middle");
  m(`F_{e}\\coloneq\\min\\left(1+0.20\\cdot\\frac{${num(i.fill, 3)}}{${num(g.Bc, 3)}},1.15\\right)=`, "Soil–structure interaction, Eq. 12.11.2.2.1-2");
  m(`W_{E}\\coloneq F_{e}\\cdot ${num(i.gamma)}\\frac{\\mathrm{lbf}}{\\mathrm{ft}^{3}}\\cdot ${num(i.fill, 3)}\\mathrm{ft}=`, "EV on the top slab", "psf");
  m(`k_{0}\\coloneq 1-\\sin\\left(${num(i.phi)}\\mathrm{deg}\\right)=`, "At-rest, Eq. 3.11.5.2-1");
  text(`EH on the legs: k0·γ·z from ${num(g.k0 * i.gamma * g.zTop, 1)} psf at the slab's middle to ${num(g.k0 * i.gamma * (g.zTop + g.h), 1)} psf at the footings; at its maximum ×1.35 and, where it relieves, 50% of it (3.11.7). LS: heq ${num(g.heq, 2)} ft (Table 3.11.6.4-1).`);
  if (i.traffic)
    text(r.live.shallow
      ? `Live load on the top slab (less than 2 ft of fill, 4.6.2.10): the wheels on a strip E = 96 + 1.44·S in.; IM ${num(r.live.IM * 100, 1)}%; m 1.2.`
      : `Live load through ${i.fill} ft of fill (3.6.1.2.6): patches ${num(r.live.Lp, 2)} ft along the span by ${num(r.live.Wp, 2)} ft across (LLDF ${i.lldf}), merged where they overlap; IM ${num(r.live.IM * 100, 1)}% (Eq. 3.6.2.2-1); m 1.2; the lane ${num(r.live.laneW * 1000, 1)} psf on the slab. The truck and tandem moved across in 1 ft steps (${r.live.runs} positions).`);
  else text("No live load.");

  text("Analysis", "subheading");
  text(`The frame on its centerlines by the stiffness method, legs ${i.base === "fixed" ? "fixed" : "pinned"} at the footings. Unfactored moments (kip·ft/ft): midspan DC ${num(r.unit.DC.mid, 2)}, EV ${num(r.unit.EV.mid, 2)}, EH ${num(r.unit.EH.mid, 2)}, LL+IM ${num(r.ll.mid.max, 2)}; corner DC ${num(r.unit.DC.corner, 2)}, EV ${num(r.unit.EV.corner, 2)}, EH ${num(r.unit.EH.corner, 2)}, LL+IM ${num(r.ll.corner.min, 2)}.`);
  text("Strength I (Table 3.4.1-1, -2): 1.25 DC, 1.35 EV (rigid frame), 1.35 EH (or 0.5 × 0.90 where it relieves), 1.75 LS, 1.75 (LL + IM); minima 0.90 where a load relieves.");
  text("Flexure and cracking (5.6.3, 5.6.7; φ 0.95, Table 12.5.5-1)", "subheading");
  for (const s of r.sections) {
    text(`${s.name}: As ${num(s.A, 3)} in²/ft, d ${num(s.d, 2)} in, φMn ${num(0.95 * s.Mn, 2)} kip·ft/ft; Mu ${num(s.Mu, 2)}, Ms ${num(s.Ms, 2)}; fss ${num(s.fss, 1)} ksi, smax ${num(s.smax, 2)} in.`);
    m(ok(`${num(Math.max(0, s.Mu), 3)}`, `0.95\\cdot ${num(s.Mn, 3)}`), "Flexure (kip·ft/ft)");
    m(ok(`${num(s.b.spacing, 3)}\\mathrm{in}`, `${num(s.smax, 3)}\\mathrm{in}`), "Crack control, γe 1.0");
  }
  text("Shear (5.12.8.6 or 5.7.3.3; φ 0.90)", "subheading");
  m(`V_{u}\\coloneq ${num(r.Vu, 3)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, "At d from the legs' face");
  m(`V_{c}\\coloneq ${num(r.Vc, 3)}\\frac{\\mathrm{kip}}{\\mathrm{ft}}`, i.fill >= 2 ? "Eq. 5.12.8.6.2-1" : "Eq. 5.7.3.3-3, β = 2");
  m(ok("V_{u}", "0.90\\cdot V_{c}"), "Shear");
  text("Deflection (12.14.5.9, 2.5.2.6.2)", "subheading");
  m(`\\Delta_{LL}\\coloneq ${num(r.deflection, 3)}\\mathrm{in}`, "Live load at midspan, gross section");
  m(ok("\\Delta_{LL}", `\\frac{${num(i.span * 12)}\\mathrm{in}}{800}`), "L/800");
  text("Footings (12.14.5.10, 10.6.3)", "subheading");
  const f = r.footing;
  text(`Per foot: Nu ${num(f.Nu, 2)} kip, Hu ${num(f.Hu, 2)} kip, e ${num(f.e, 3)} ft, B′ = B − 2e = ${num(f.Beff, 2)} ft.`);
  m(ok(`${num(f.qu, 3)}\\mathrm{ksf}`, `0.45\\cdot ${num(i.qn, 3)}\\mathrm{ksf}`), "Bearing, φb 0.45 (Table 10.5.5.2.2-1)");
  m(ok(`${num(f.MuF, 3)}`, `${num(r.checks.find((c) => c.id === "footing-flexure")!.capacity, 3)}`), `Flexure at the leg's face, ${num(f.proj, 2)} ft projection`);
  lines.push(...checksSummary([{ checks: r.checks }]));
  return lines;
}

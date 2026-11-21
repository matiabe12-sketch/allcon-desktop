import type { Line } from "@/lib/calcs/library/templates";
import { checksSummary } from "../checks-summary";
import { COLOR_NOTE, INPUT_COLOR, isInput, num } from "../calc-style";
import type { Figure } from "../figures";
import { schedule, type ConcreteItem } from "../rebar/schedule";
import { ftT } from "../takeoff/tex";
import type { DetailView, Takeoff } from "../takeoff/types";
import { designGrs, type GrsInputs } from "./abutment";

// A GRS abutment's drawings (after the Guide's Figure 13 and CDOT BDM Figures 11-7 to 11-10), take-off and calc package:
// - the section: the RSF, the reinforced mass with its primary layers and the bearing bed under the seat, the CMU facing,
//   the clear space, the beam seat and the superstructure, the approach with its road base, the retained soil and the
//   global stability circle;
// - the seat: the beam seat on the bearing bed, the setback, the clear space over the top block, the foam board behind
//   the back wall and the wrapped (burrito) layers.

type Pt = [number, number];
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const n2 = (v: number, d = 2) => String(+v.toFixed(d));
const ok = (demand: string, capacity: string) => `\\operatorname{if}\\left(${demand}\\le ${capacity},\\text{OK},\\text{NG}\\right)=`;
/** The beam seat's depth (ft): it fills the clear space between the facing's top and the girders, at least 1 ft. */
const seatT = (i: GrsInputs) => Math.max(1, i.de);

export function grsViews(i: GrsInputs): DetailView[] {
  const r = designGrs(i);
  const L = r.layout;
  const views: DetailView[] = [];
  const sv = i.Sv / 12;
  const xBack = L.Btot; // the reinforced mass's back
  const reach = xBack + Math.max(8, 0.6 * L.Htop);
  const front = L.xRSF - 6;
  const yTopGrs = i.H - i.de; // the facing's top and the GRS mass's top
  const sec: DetailView = { title: `Section: GRS abutment, ${n2(i.H)} ft to the girders, ${n2(L.Btot)} ft base, seat ${n2(i.b)} ft`, polys: [], lines: [], dots: [], labels: [] };
  // The ground: foundation soil below, the retained soil behind, the RSF and the reinforced mass.
  sec.polys.push({ pts: rect(front, -L.DRSF - 5, reach, 0), style: "earth" });
  sec.polys.push({ pts: rect(xBack, 0, reach, L.Htop), style: "earth" });
  sec.polys.push({ pts: rect(L.xRSF, -L.DRSF, L.xRSF + L.BRSF, 0), style: "dashed" });
  sec.polys.push({ pts: rect(i.tf, 0, xBack, yTopGrs), style: "dashed" });
  sec.polys.push({ pts: rect(0, 0, i.tf, yTopGrs), style: "concrete" }); // the CMU facing
  // Facing courses (8 in. blocks).
  for (let y = 8 / 12; y < yTopGrs - 1e-9; y += 8 / 12) sec.lines.push({ pts: [[0, y], [i.tf, y]], mark: "", kind: "secondary" });
  // Primary layers, and the bearing bed's layers between them under the seat.
  for (let y = sv; y < yTopGrs - 1e-9; y += sv) sec.lines.push({ pts: [[0.05, y], [xBack, y]], mark: "", kind: "main" });
  const xs0 = i.tf + i.ab;
  const xs1 = xs0 + i.b;
  // the bearing bed: layers between the primaries, from the top down to its depth, 2·ab + b long at least
  for (let y = sv / 2; y < yTopGrs - 1e-9; y += sv) if (yTopGrs - y <= r.reinf.bedDepth + 1e-9) sec.lines.push({ pts: [[0.05, y], [Math.min(xBack, xs1 + i.ab), y]], mark: "", kind: "secondary" });
  for (let y = 0.25; y < L.DRSF; y += sv) sec.lines.push({ pts: [[L.xRSF + 0.1, -y], [L.xRSF + L.BRSF - 0.1, -y]], mark: "", kind: "main" });
  // The seat and the superstructure.
  const ST = seatT(i);
  sec.polys.push({ pts: rect(xs1 + 0.8, yTopGrs, xBack, L.Htop), style: "earth" }); // the integration zone over the mass
  sec.polys.push({ pts: rect(xs0, yTopGrs, xs1, yTopGrs + ST), style: "concrete" });
  sec.polys.push({ pts: rect(-3, yTopGrs + ST, xs1 - 0.3, L.Htop), style: "concrete" });
  sec.polys.push({ pts: rect(xs1 - 0.3, yTopGrs + ST, xs1 + 0.8, L.Htop), style: "concrete" }); // the back wall
  // The approach: road base over the GRS and beyond.
  sec.lines.push({ pts: [[xs1 + 0.8, L.Htop], [reach, L.Htop]], mark: "", kind: "main" });
  // Dimensions.
  const xd = front + 1;
  sec.lines.push({ pts: [[xd, 0], [xd, i.H]], mark: "", kind: "secondary" });
  sec.labels!.push({ x: xd + 0.3, y: i.H / 2, text: `H ${n2(i.H)} ft`, anchor: "start" });
  sec.labels!.push({ x: L.xRSF - 0.3, y: -L.DRSF / 2 - 0.2, text: `RSF ${n2(L.BRSF)} x ${n2(L.DRSF)} ft`, anchor: "end" });
  sec.labels!.push({ x: xs0 + i.b / 2, y: L.Htop + 0.5, text: `Seat ${n2(i.b)} ft, setback ${n2(i.ab * 12, 1)} in., clear space ${n2(i.de * 12, 1)} in.`, anchor: "middle" });
  sec.labels!.push({ x: reach - 0.2, y: L.Htop + 0.5, text: "Approach: road base, no approach slab", anchor: "end" });
  sec.labels!.push({ x: xBack + 0.4, y: yTopGrs / 2, text: "Retained soil", anchor: "start" });
  sec.labels!.push({ x: front + 0.3, y: -L.DRSF - 3.5, text: "Foundation soil", anchor: "start" });
  // The critical global circle, where it runs in the drawing.
  const c = r.global.c;
  if (Number.isFinite(r.global.FS)) {
    const pts: Pt[] = [];
    for (let k = 0; k <= 80; k++) {
      const x = c.xc - c.R + (2 * c.R * k) / 80;
      const y = c.yc - Math.sqrt(Math.max(0, c.R * c.R - (x - c.xc) ** 2));
      if (x >= front && x <= reach && y <= (x < 0 ? 0 : x <= xBack ? i.H : L.Htop) && y >= -L.DRSF - 5) pts.push([x, y]);
    }
    if (pts.length > 1) {
      sec.lines.push({ pts, mark: "", kind: "secondary" });
      const end = pts[pts.length - 1];
      sec.labels!.push({ x: end[0] - 0.4, y: end[1] - 0.2, text: `Global FS ${n2(r.global.FS)}`, anchor: "end" });
    }
  }
  const leg = [
    `Btotal ${n2(L.Btot)} ft (B ${n2(i.B)} ft + facing); reinforcement Tf ${i.Tf} lb/ft at ${i.Sv} in.; bearing bed ${r.reinf.bedLayers} layers at ${i.Sv / 2} in. to ${n2(r.reinf.bedDepth)} ft under the seat, ${n2(2 * i.ab + i.b)} ft long at least`,
    `Fill: well-graded or open-graded aggregate, phi ${i.phir} deg, dmax ${i.dmax} in., compacted to 95% (AASHTO T 99); the top layers wrapped (burrito) into the integration zone`,
    `Seat bearing ${i.qb + i.qLL} psf; vertical strain ${n2(r.deform.ev, 2)}%, settlement ${n2(r.deform.Dv * 12, 2)} in., face bulge ${n2(r.deform.DL * 12, 2)} in.`,
  ];
  leg.forEach((t, k) => sec.labels!.push({ x: front, y: -L.DRSF - 5.8 - 0.9 * k, text: t, anchor: "start" }));
  views.push(sec);

  // --- the seat (in) ---------------------------------------------------------------------------------------------
  const sd: DetailView = { title: "Beam seat detail (inches)", polys: [], lines: [], dots: [], labels: [] };
  const tfI = i.tf * 12;
  const ab = i.ab * 12;
  const bI = i.b * 12;
  const de = i.de * 12;
  const seat = seatT(i) * 12;
  const grsTop = 0;
  sd.polys.push({ pts: rect(tfI, -40, tfI + ab + bI + 36, grsTop), style: "dashed" });
  sd.polys.push({ pts: rect(0, -40, tfI, grsTop), style: "concrete" });
  for (let y = -8; y > -40; y -= 8) sd.lines.push({ pts: [[0, y], [tfI, y]], mark: "", kind: "secondary" });
  sd.polys.push({ pts: rect(tfI + ab, grsTop, tfI + ab + bI, grsTop + seat), style: "concrete" });
  sd.polys.push({ pts: rect(tfI + ab + bI - 12, grsTop + seat, tfI + ab + bI, grsTop + seat + 30), style: "concrete" });
  sd.polys.push({ pts: rect(-24, grsTop + de, tfI + ab + bI - 15, grsTop + de + 24), style: "concrete" }); // the girder end
  sd.polys.push({ pts: rect(tfI, grsTop, tfI + ab, grsTop + 4), style: "void" }); // foam board, the setback
  sd.polys.push({ pts: rect(tfI + ab + bI, grsTop + seat, tfI + ab + bI + 3, grsTop + seat + 30), style: "void" }); // 3 in. foam behind the back wall
  const bed = r.reinf.bedDepth * 12;
  for (let y = -i.Sv / 2; y > -40; y -= -y < bed - 1e-6 ? i.Sv / 2 : i.Sv) sd.lines.push({ pts: [[tfI + 1, y], [-y <= bed + 1e-6 ? tfI + 2 * ab + bI : tfI + ab + bI + 30, y]], mark: "", kind: -y <= bed + 1e-6 ? "main" : "secondary" });
  const notes: [Pt, string][] = [
    [[tfI + ab + bI / 2, grsTop + seat / 2], `Reinforced concrete beam seat ${n2(i.b, 1)} ft wide (BDM 11.3.5.5d)`],
    [[tfI + ab / 2, grsTop + 2], `Setback ${n2(ab, 1)} in., foam board, wrapped`],
    [[tfI / 2, grsTop + de / 2], `Clear space ${n2(de, 1)} in. over the top block (2 ft, BDM 11.3.5.5f)`],
    [[tfI + ab + bI + 1.5, grsTop + seat + 15], "3 in. low-density polystyrene behind the back wall (BDM 11.3.5.5i)"],
    [[tfI + ab + bI / 2, -10], `Bearing bed: ${r.reinf.bedLayers} layers at ${i.Sv / 2} in. under the seat`],
  ];
  notes.sort((p, q) => q[0][1] - p[0][1] || p[0][0] - q[0][0]);
  const xl = tfI + ab + bI + 42;
  notes.forEach(([p, t], k) => {
    const y = grsTop + seat + 26 - k * 14;
    sd.lines.push({ pts: [p, [xl - 1, y]], mark: "", kind: "secondary" });
    sd.labels!.push({ x: xl, y: y - 0.5, text: t, anchor: "start" });
  });
  sd.labels!.push({ x: xl + 62, y: grsTop + seat + 26, text: " ", anchor: "start" }); // room for the notes
  sd.labels!.push({ x: 0, y: -46, text: `CMU facing ${n2(tfI, 2)} in., top courses grouted and pinned; primary layers at ${i.Sv} in. between every course`, anchor: "start" });
  views.push(sd);
  return views;
}

/** The take-off over the abutment's length: the reinforced soil, the facing, the RSF, the excavation and the seat. */
export function grsTakeoff(i: GrsInputs, lengthFt = 40): Takeoff {
  const r = designGrs(i);
  const L = r.layout;
  const yTop = i.H - i.de;
  const reinf = (i.B * yTop * lengthFt) / 27;
  const rsf = (L.BRSF * L.DRSF * lengthFt) / 27;
  const ex = ((L.BRSF + 3) * L.DRSF * lengthFt) / 27;
  const layers = Math.floor(yTop / (i.Sv / 12) + 1e-9) + r.reinf.bedLayers + Math.ceil(L.DRSF / (i.Sv / 12));
  const sy = (layers * i.B * lengthFt) / 9;
  const concrete: ConcreteItem[] = [{ label: "Beam seat", cy: (i.b * seatT(i) * lengthFt) / 27, basis: `${n2(i.b)} ft × ${seatT(i)} ft × ${num(lengthFt, 1)} ft`, math: `${ftT(i.b)}\\cdot ${ftT(seatT(i))}\\cdot ${ftT(lengthFt)}`, ref: "Seat: width × depth × length" }];
  return {
    what: "GRS abutment",
    schedule: schedule([], concrete),
    quantities: {
      "soil-reinforcement": { value: reinf, basis: `${n2(i.B)} ft × ${n2(yTop)} ft × ${num(lengthFt, 1)} ft of reinforced fill`, math: `${ftT(i.B)}\\cdot ${ftT(+yTop.toFixed(3))}\\cdot ${ftT(lengthFt)}`, ref: "Reinforced soil: B × height × length" },
      facing: { value: yTop * lengthFt, basis: `CMU facing ${n2(yTop)} ft high by ${num(lengthFt, 1)} ft`, math: `${ftT(+yTop.toFixed(3))}\\cdot ${ftT(lengthFt)}`, ref: "Block facing: its area" },
      backfill: { value: rsf, basis: `the RSF, ${n2(L.BRSF)} ft × ${n2(L.DRSF)} ft × ${num(lengthFt, 1)} ft, wrapped in geotextile`, math: `${ftT(L.BRSF)}\\cdot ${ftT(L.DRSF)}\\cdot ${ftT(lengthFt)}`, ref: "Reinforced soil foundation" },
      excavation: { value: ex, basis: `the RSF's excavation, 18 in. beyond it each side (M-206-1)`, math: `\\left(${ftT(L.BRSF)}+3\\mathrm{ft}\\right)\\cdot ${ftT(L.DRSF)}\\cdot ${ftT(lengthFt)}`, ref: "CDOT M-206-1" },
    },
    views: grsViews(i),
    notes: [
      `About ${layers} layers of geosynthetic (Tf ${i.Tf} lb/ft, ${num(sy, 0)} SY over ${num(lengthFt, 1)} ft), the bearing bed's included; the integration zone's wrapped layers and the wingwalls are extra.`,
      "The seat's bars are detailed with the seat; settlement monitoring by a project special provision (BDM 11.3.5.3).",
    ],
    length: { label: "Abutment length", value: lengthFt, unit: "ft" },
  };
}

export function grsCalcLines(i: GrsInputs, title: string, figures?: Figure[]): Line[] {
  const lines: Line[] = [];
  const text = (t: string, style?: "heading" | "subheading" | "note") => lines.push({ text: t, ...(style ? { style } : {}) });
  const m = (math: string, ref?: string, unit?: string) => lines.push({ math, ...(ref ? { ref } : {}), ...(unit ? { unit } : {}), ...(isInput(math) ? { color: INPUT_COLOR } : {}) });
  const r = designGrs(i);
  const L = r.layout;
  text(title.toUpperCase(), "heading");
  text(`A geosynthetic reinforced soil abutment, ${i.H} ft high to the girders, carrying a ${i.span} ft span on a ${i.b} ft beam seat, by FHWA-HRT-11-026 (GRS-IBS Interim Implementation Guide) Appendix C, LRFD, as CDOT BDM 11.3.5.2 requires, with BDM 11.3.5.5's rules. Per foot of abutment; lb and ft.`);
  text(COLOR_NOTE, "note");
  for (const fg of figures ?? []) lines.push({ region: fg });

  text("Layout (Guide 4.3.4; BDM 11.3.5.5)", "subheading");
  text(`Btotal = B + facing = ${num(L.Btot, 3)} ft; the RSF ${num(L.BRSF, 3)} ft wide (1.25·Btotal) and ${num(L.DRSF, 3)} ft deep (0.25·Btotal); DH = ${num(L.DH, 2)} ft from the leveling pad to the roadway; road base over the mass behind the seat ${num(L.brb, 3)} ft.`);
  text(`Ka of the retained soil ${num(r.K.Kab, 3)}, Ka and Kp of the reinforced fill ${num(r.K.Kar, 3)} and ${num(r.K.Kpr, 3)} (φr ${i.phir}°).`);

  text("Direct sliding (Guide C.2.1.1)", "subheading");
  const s = r.sliding;
  m(`F_{b}\\coloneq\\frac{1}{2}\\cdot ${num(i.gb)}\\cdot ${num(r.K.Kab, 3)}\\cdot ${num(i.H, 3)}^{2}=`, "Eq. 94, lb/ft");
  m(`F_{rb}\\coloneq ${num(i.qrb)}\\cdot ${num(r.K.Kab, 3)}\\cdot ${num(i.H, 3)}=`, "Eq. 95, lb/ft");
  m(`F_{t}\\coloneq ${num(i.qt)}\\cdot ${num(r.K.Kab, 3)}\\cdot ${num(i.H, 3)}=`, "Eq. 96, lb/ft");
  m("F_{R}\\coloneq 1.5\\cdot F_{b}+1.5\\cdot F_{rb}+1.75\\cdot F_{t}=", "Eq. 70, lb/ft");
  m(`W_{t,R}\\coloneq 1.0\\cdot ${num(s.W, 1)}+0.9\\cdot ${num(i.qb)}\\cdot ${num(i.b, 3)}+0.75\\cdot ${num(i.qrb)}\\cdot ${num(L.brb, 3)}=`, "Eq. 72: the mass, the bridge's DL, the road base", "lb/ft");
  m(`R_{R}\\coloneq 1.0\\cdot W_{t,R}\\cdot\\tan\\left(${num(i.delta)}\\mathrm{deg}\\right)=`, "Eq. 71, φτ 1.0", "lb/ft");
  m(ok("F_{R}", "R_{R}"), "Eq. 73");

  text("Bearing under the RSF (Guide C.2.1.2)", "subheading");
  const b = r.bearing;
  text(`Factored loads (Eq. 75): ΣVR = ${num(b.VR, 0)} lb/ft; moments about the RSF's base center: driving ${num(b.MD, 0)}, resisting ${num(b.MR, 0)} lb·ft/ft; eB = (ΣMD − ΣMR)/ΣVR = ${num(b.eB, 3)} ft (Eq. 76).`);
  m(`\\sigma_{v}\\coloneq\\frac{${num(b.VR, 1)}}{${num(L.BRSF, 3)}-2\\cdot ${num(Math.max(0, b.eB), 3)}}=`, "Eq. 74, psf");
  m(`q_{n}\\coloneq ${num(i.cf)}\\cdot ${num(b.Nc, 3)}+\\frac{1}{2}\\cdot ${num(b.Beff, 3)}\\cdot ${num(i.gf)}\\cdot ${num(b.Ng, 3)}+${num(i.gf)}\\cdot ${num(L.DRSF, 3)}\\cdot ${num(b.Nq, 3)}=`, "Eq. 77, psf");
  m(ok("\\sigma_{v}", "0.65\\cdot q_{n}"), "Eq. 78, φbc 0.65");
  text(`Global stability (C.2.1.3): Bishop's method over circles passing under the RSF, Service I, the seat's and the approach's loads on top: FS = ${num(r.global.FS, 3)} against 1/0.65 = 1.538.`);

  text("Vertical capacity (Guide C.2.2.1)", "subheading");
  m(`V_{applied,f}\\coloneq 1.25\\cdot ${num(i.qb)}+1.75\\cdot ${num(i.qLL)}=`, "Eqs. 79, 82, psf");
  m(`q_{n,an}\\coloneq 0.7^{\\frac{${num(i.Sv)}}{6\\cdot ${num(i.dmax, 3)}}}\\cdot\\frac{${num(i.Tf)}}{${num(i.Sv / 12, 4)}}\\cdot ${num(r.K.Kpr, 3)}=`, "Eq. 81, psf");
  if (i.qTest > 0) m(`q_{n,emp}\\coloneq ${num(i.qTest)}`, "From the performance test (5% strain)", "psf");
  m(`q_{n}\\coloneq ${num(r.capacity.qnUse, 1)}`, `${i.qTest > 0 ? "The test's" : "The analytical"} nominal, at most 14,000 psf (BDM 11.3.5.5b)`, "psf");
  m(ok("V_{applied,f}", "0.45\\cdot q_{n}"), "Eq. 83, φcap 0.45");

  text("Deformations (Guide 4.3.7.2)", "subheading");
  const d = r.deform;
  text(`Vertical strain under the bridge's dead load ${num(i.qb)} psf: ${num(d.ev, 3)}% (${i.strain > 0 ? "the project's performance test" : "the Guide's Figure 20 design envelope"}), ≤ 0.5%.`);
  m(`D_{v}\\coloneq\\frac{${num(d.ev, 3)}}{100}\\cdot ${num(i.H, 3)}\\mathrm{ft}=`, "Eq. 59", "in");
  m(`D_{L}\\coloneq\\frac{2\\cdot ${num(d.bqvol, 3)}\\mathrm{ft}\\cdot D_{v}}{${num(i.H, 3)}\\mathrm{ft}}=`, "Eq. 29, bq,vol = b + ab", "in");
  text(`Lateral strain εL = 2·εv = ${num(d.eL, 3)}%, ≤ 1% (Eq. 30).`);

  text("Required reinforcement strength (Guide C.2.2.3)", "subheading");
  const rf = r.reinf;
  text(`At each layer under the seat's centerline: σh,f = σh,bridge,f + σh,rb,f + σh,t,f + σh,W,f (Eqs. 86–92), the bridge's load reduced by the approach's (C.3.7.3); Treq,f = σh,f/0.7^(Sv/6dmax)·Sv (Eq. 84); Tf,f = 0.9·Tf/2.25 = ${num(rf.TfF, 0)} lb/ft (Eq. 93, errata); unfactored Treq against T at 2% = ${i.T2} lb/ft.`);
  const rows = rf.layers.filter((_, k) => k < 6 || k === rf.layers.length - 1);
  for (const l of rows) text(`z = ${num(l.z, 2)} ft: σh,bridge ${num(l.hBridge, 0)}, σh,rb ${num(l.hRb, 0)}, σh,t ${num(l.hT, 0)}, σh,W ${num(l.hW, 0)}; σh,f ${num(l.hF, 0)} psf, σh ${num(l.h, 0)} psf; at ${i.Sv} in.: Treq,f ${num(l.Treqf, 0)}, Treq ${num(l.Treq, 0)} lb/ft.`);
  text(`Bearing bed: ${rf.bedLayers} layers at ${i.Sv / 2} in. under the seat to ${num(rf.bedDepth, 2)} ft (the deepest layer failing at ${i.Sv} in., at least five layers, Guide 4.3.4 step 6).`);
  m(ok(`${num(rf.TreqfDesign, 1)}`, `${num(rf.TfF, 1)}`), "Treq,f ≤ Tf,f, lb/ft");
  m(ok(`${num(rf.TreqDesign, 1)}`, `${num(i.T2, 1)}`), "Treq ≤ T at 2% strain, lb/ft");
  text("Details (BDM 11.3.5.5): the reinforcement under the seat connected to the facing; a reinforced concrete seat and back wall; the slope face wrapped and anchored behind the abutment and wingwalls; a concrete leveling pad; a geomembrane over the reinforced zone or an internal drain; 3 in. of low-density polystyrene behind the back wall; 3 in. clear between the facing's back and the seat's toe; the reinforcement extended into the embankment as a transition zone (1H:1V in cut, 2H:1V in fill).");
  lines.push(...checksSummary([{ checks: r.checks }]));
  return lines;
}

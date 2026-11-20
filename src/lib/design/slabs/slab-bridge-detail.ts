import { bar } from "../stm/aashto";
import type { Pt } from "../stm/geometry";
import { ftIn } from "../rebar/bars";
import { countAt, runGroups, type PreGroup, type RunOptions } from "../rebar/runs";
import { markGroups, schedule, type ConcreteItem } from "../rebar/schedule";
import { ASPHALT_TON_PER_SY_IN, ftT, inT } from "../takeoff/tex";
import { num } from "../calc-style";
import type { DetailView, Takeoff } from "../takeoff/types";
import type { SlabBridgeInputs } from "./slab-bridge";

// A cast-in-place slab bridge's bars and quantities: the bottom main bars the bridge's length (lapped where they're
// longer than stock, Class B), the top main bars over each pier (each way to the adjacent spans' quarter points plus
// their development, a quarter span either side, the usual practice), the top longitudinal temperature bars elsewhere,
// the bottom distribution and top transverse bars across, and the edge beams' added bars. Clear to the edges and ends
// 2 in. Bars epoxy coated (CDOT BDM 5.4.5). The deck concrete, waterproofing and overlay as CDOT pays them.

const C = 2; // in

export function slabBridgeTakeoff(i: SlabBridgeInputs): Takeoff {
  const spans = i.spans.filter((L) => L > 0);
  const total = spans.reduce((t, L) => t + L, 0); // ft, along the roadway (support to support; the ends to the abutments' backwalls are the abutments')
  const cos = Math.cos((i.skew * Math.PI) / 180);
  const Lin = total * 12;
  const Wn = i.W * 12;
  const Wsk = Wn / cos;
  const pre: PreGroup[] = [];
  const run = (o: Omit<RunOptions, "lap"> & { cover: number; spacing: number }) => {
    const r = runGroups({ ...o, lap: { fy: i.fy, fc: i.fc, clearCover: o.cover, clearSpacing: Math.max(0.5, o.spacing - bar(o.size).db), coating: "epoxy" } });
    pre.push(...r.groups);
    return r;
  };
  const call = (b: { bar: number; spacing: number }, what: string) => `#${b.bar} @ ${ftIn(b.spacing)} (${what})`;
  const continuous = i.continuous && spans.length > 1;

  run({ size: i.bottom.bar, count: countAt(Wn - 2 * C, i.bottom.spacing), straight: Lin - 2 * C, use: "Main bars, bottom", callout: call(i.bottom, "bottom, along the roadway"), cover: i.coverBot, spacing: i.bottom.spacing });
  // Over each pier: a quarter of each adjacent span either side (the usual cut-off, at least the negative moment region with its development).
  if (continuous)
    for (let k = 1; k < spans.length; k++) {
      const len = (spans[k - 1] / 4 + spans[k] / 4) * 12;
      run({ size: i.top.bar, count: countAt(Wn - 2 * C, i.top.spacing), straight: len, use: `Main bars, top over pier ${k}`, callout: call(i.top, `top over pier ${k}, ${ftIn(len)} long`), cover: i.coverTop, spacing: i.top.spacing });
    }
  run({ size: i.topLong.bar, count: countAt(Wn - 2 * C, i.topLong.spacing), straight: Lin - 2 * C, use: "Longitudinal, top", callout: call(i.topLong, "top, along the roadway"), cover: i.coverTop, spacing: i.topLong.spacing });
  run({ size: i.dist.bar, count: countAt(Lin - 2 * C, i.dist.spacing), straight: Wsk - 2 * C, use: "Transverse, bottom", callout: call(i.dist, "bottom, distribution, parallel to the supports"), cover: i.coverBot, spacing: i.dist.spacing });
  run({ size: i.topTrans.bar, count: countAt(Lin - 2 * C, i.topTrans.spacing), straight: Wsk - 2 * C, use: "Transverse, top", callout: call(i.topTrans, "top, parallel to the supports"), cover: i.coverTop, spacing: i.topTrans.spacing });
  if (i.edgeBars && i.edgeBars.count > 0) {
    run({ size: i.edgeBars.bar, count: 2 * i.edgeBars.count, straight: Lin - 2 * C, use: "Edge beams, bottom", callout: `${i.edgeBars.count} #${i.edgeBars.bar} each edge (edge beam, bottom)`, cover: i.coverBot, spacing: 6 });
    if (continuous)
      for (let k = 1; k < spans.length; k++) {
        const len = (spans[k - 1] / 4 + spans[k] / 4) * 12;
        run({ size: i.edgeBars.bar, count: 2 * i.edgeBars.count, straight: len, use: `Edge beams, top over pier ${k}`, callout: `${i.edgeBars.count} #${i.edgeBars.bar} each edge (edge beam, top over pier ${k})`, cover: i.coverTop, spacing: 6 });
      }
  }

  const cy = (total * i.W * (i.t / 12)) / 27;
  const concrete: ConcreteItem[] = [{ label: "Slab", cy, basis: `${num(total)} ft along the roadway (support to support) by ${num(i.W)} ft by ${num(i.t)} in`, math: `${ftT(total)}\\cdot ${ftT(i.W)}\\cdot ${inT(i.t)}`, ref: "Slab: length × width × depth" }];
  const groups = markGroups(pre);
  const sch = schedule(groups, concrete);
  const markOf = (use: string) => groups.find((g) => g.use === use)?.mark ?? "";
  const roadway = i.W - 2 * i.barrierWidth;
  const quantities: Takeoff["quantities"] = {};
  if (i.wearing > 0) {
    quantities.waterproofing = { value: (total * roadway) / 9, basis: `the slab's top under the overlay, ${num(total)} ft by ${num(roadway)} ft curb to curb`, math: `\\frac{${ftT(total)}\\cdot ${ftT(roadway)}}{9}`, ref: "the slab's top under the overlay (SY)" };
    quantities.asphalt = { value: ((total * roadway) / 9) * i.wearing * ASPHALT_TON_PER_SY_IN, basis: `${num(total)} ft by ${num(roadway)} ft, ${i.wearing} in at 0.055 ton per SY-in`, math: `\\frac{${ftT(total)}\\cdot ${ftT(roadway)}}{9}\\cdot ${num(i.wearing)}\\cdot 0.055`, ref: "the overlay's area (SY) × thickness (in) × 0.055 ton per SY-in" };
  }

  // --- views (inches, y up): the elevation along the roadway, and the section across ------------------------------------------
  const t = i.t;
  const yB = i.coverBot + bar(i.bottom.bar).db / 2;
  const yT = t - i.coverTop - bar(i.top.bar).db / 2;
  const elev: DetailView = {
    title: "Longitudinal section",
    polys: [{ pts: [[0, 0], [Lin, 0], [Lin, t], [0, t]] as Pt[], style: "concrete" }],
    lines: [{ pts: [[C, yB], [Lin - C, yB]] as Pt[], mark: markOf("Main bars, bottom"), kind: "main" }],
    dots: [],
    labels: [],
  };
  let x = 0;
  spans.forEach((L, k) => {
    elev.labels!.push({ x: x + (L * 12) / 2, y: t + 14, text: `Span ${k + 1}: ${ftIn(L * 12)}`, anchor: "middle" });
    x += L * 12;
    if (continuous && k < spans.length - 1) {
      const half = ((spans[k] / 4) * 12 + (spans[k + 1] / 4) * 12) / 2;
      elev.lines.push({ pts: [[x - (spans[k] / 4) * 12, yT], [x + (spans[k + 1] / 4) * 12, yT]] as Pt[], mark: markOf(`Main bars, top over pier ${k + 1}`), kind: "main" });
      void half;
    }
  });
  const sec: DetailView = {
    title: "Section across",
    polys: [
      { pts: [[0, 0], [Wn, 0], [Wn, t], [0, t]] as Pt[], style: "concrete" },
      { pts: [[0, t], [i.barrierWidth * 12, t], [i.barrierWidth * 12, t + 32], [0, t + 32]] as Pt[], style: "dashed" },
      { pts: [[Wn - i.barrierWidth * 12, t], [Wn, t], [Wn, t + 32], [Wn - i.barrierWidth * 12, t + 32]] as Pt[], style: "dashed" },
    ],
    lines: [{ pts: [[C, yB + 1], [Wn - C, yB + 1]] as Pt[], mark: markOf("Transverse, bottom"), kind: "secondary" }],
    dots: Array.from({ length: Math.min(80, countAt(Wn - 2 * C, i.bottom.spacing)) }, (_, k) => ({ x: C + k * i.bottom.spacing, y: yB, d: bar(i.bottom.bar).db, mark: markOf("Main bars, bottom") })).filter((d) => d.x <= Wn - C),
    labels: [{ x: Wn / 2, y: -10, text: `${call(i.bottom, "bottom main")}; ${call(i.dist, "distribution")}`, anchor: "middle" }],
  };
  const notes = [
    "The top main bars over each pier run a quarter of each adjacent span either side (the usual cut-off); confirm against the negative moment region with its development.",
    "The slab's length is support centerline to centerline; the ends over the abutments are taken with the abutments.",
  ];
  return { what: "slab bridge", schedule: sch, quantities, views: [elev, sec], notes };
}

import type { BridgeDefinition } from "./definition";
import { generate, type Generated, type Member } from "./generate";
import type { Dof6, LoadType } from "./model";
import { COMPONENTS, type LiveLoad } from "./moving";
import { analyze, type Analysis, type SectionForces } from "./solver";

// A bridge analyzed: its two stages solved, their load cases side by side, the AASHTO LRFD load
// combinations of them (Table 3.4.1-1), and each member's forces and deflections along its length.
// The moving load analysis (moving.ts) runs after and is passed in where results are asked for:
// with it, a combination's results are an envelope (the permanent loads, plus the live load's
// largest and smallest effect).

export type CaseRef = { name: string; type: LoadType; stage: 1 | 2; description?: string; index: number; group?: "TU" | "TG" | "wind"; signed?: boolean };
/** A combination: each load type's factor, the vehicle its live load is (HL-93, the fatigue truck, or the Strength II
 * permit vehicles), and the wind's pressure as a fraction of the model's (Strength III's) wind case. */
export type Vehicle = "hl93" | "fatigue" | "permit";
export type Combination = { name: string; description: string; factors: Record<LoadType, number>; vehicle?: Vehicle };

const F = (o: Partial<Record<LoadType, number>>): Record<LoadType, number> => ({ DC: 0, DW: 0, LL: 0, PL: o.LL ?? 0, TU: 0, TG: 0, WS: 0, WL: 0, USER: 1, ...o });
/** AASHTO LRFD 10th Table 3.4.1-1 (the permanent loads at their maximum factors, Table 3.4.1-2; TU at 0.50 for force effects; TG, when the Bridge considers it, at 0.50 in Service I and III with live load and 0.0 in
 * Strength, C3.4.1): the wind at each combination's own speed (Table 3.8.1.1.2-1: Strength III and Service IV the site's,
 * Strength V 80 mph and Service I 70 mph, Kz = G = 1), `scale` those as fractions of Strength III's. */
export function combinationsFor(scale = { strengthV: 0.484, serviceI: 0.371 }): Combination[] {
  const sV = +scale.strengthV.toFixed(4);
  const sI = +scale.serviceI.toFixed(4);
  return [
    { name: "Service I", description: `1.0 DC + 1.0 DW + 1.0 (LL+IM) + 1.0 TU + 0.50 TG + WS at 70 mph (${sI} × Strength III's) + 1.0 WL`, factors: F({ DC: 1, DW: 1, LL: 1, TU: 1, TG: 0.5, WS: sI, WL: 1 }) },
    { name: "Service II", description: "1.0 DC + 1.0 DW + 1.3 (LL+IM): steel girders' permanent deflection", factors: F({ DC: 1, DW: 1, LL: 1.3 }) },
    { name: "Service III", description: "1.0 DC + 1.0 DW + 0.8 (LL+IM) + 1.0 TU + 0.50 TG", factors: F({ DC: 1, DW: 1, LL: 0.8, TU: 1, TG: 0.5 }) },
    { name: "Service IV", description: "1.0 DC + 1.0 DW + 1.0 TU + 1.0 WS", factors: F({ DC: 1, DW: 1, TU: 1, WS: 1 }) },
    { name: "Strength I", description: "1.25 DC + 1.5 DW + 1.75 (LL+IM) + 0.5 TU", factors: F({ DC: 1.25, DW: 1.5, LL: 1.75, TU: 0.5 }) },
    { name: "Strength II", description: "1.25 DC + 1.5 DW + 1.35 (permit vehicle + IM, CDOT BDM 3.6) + 0.5 TU", factors: F({ DC: 1.25, DW: 1.5, LL: 1.35, TU: 0.5 }), vehicle: "permit" },
    { name: "Strength III", description: "1.25 DC + 1.5 DW + 1.0 WS + 0.5 TU", factors: F({ DC: 1.25, DW: 1.5, TU: 0.5, WS: 1 }) },
    { name: "Strength IV", description: "1.5 DC + 1.5 DW + 0.5 TU", factors: F({ DC: 1.5, DW: 1.5, TU: 0.5 }) },
    { name: "Strength V", description: `1.25 DC + 1.5 DW + 1.35 (LL+IM) + WS at 80 mph (${sV} × Strength III's) + 1.0 WL + 0.5 TU`, factors: F({ DC: 1.25, DW: 1.5, LL: 1.35, TU: 0.5, WS: sV, WL: 1 }) },
    { name: "Fatigue I", description: "1.75 (fatigue truck + IM), one lane", factors: F({ LL: 1.75, PL: 0, USER: 0 }), vehicle: "fatigue" },
    { name: "Fatigue II", description: "0.80 (fatigue truck + IM), one lane", factors: F({ LL: 0.8, PL: 0, USER: 0 }), vehicle: "fatigue" },
  ];
}
/** The combinations at the default wind (for lists before a bridge is analyzed). */
export const COMBINATIONS: Combination[] = combinationsFor();

/** What to show results for: one load case, the live load alone, or a combination. */
export type Selection = { kind: "case"; name: string } | { kind: "live" } | { kind: "combination"; name: string };

export type MemberStation = {
  x: number; // along the member, ft
  p: [number, number, number]; // where that is in the model
  forces: SectionForces; // the permanent loads (and for a case, the case)
  dz: number; // deflection (down −), ft, without live load
  /** With live load: each force's largest and smallest value (an envelope, not one loading). */
  max?: SectionForces;
  min?: SectionForces;
};
export type Check = { name: string; applied: number; reactions: number; ok: boolean }; // vertical equilibrium, kip
/** A bearing's forces (permanent loads), and with live load or the alternatives (temperature, wind) the vertical's envelope and the largest across and along. */
export type BearingResult = { support: number; girder: number; link: number; vertical: number; transverse: number; longitudinal: number; max?: number; min?: number; transverseMax?: number; longitudinalMax?: number };

export type BridgeAnalysis = {
  generated: Generated;
  cases: CaseRef[];
  combinations: Combination[];
  checks: Check[];
  ok: boolean;
  /** The factor on live load in a selection (0: none). */
  liveFactor: (selection: Selection) => number;
  /** The vehicle a selection's live load is: HL-93, the fatigue truck or the permit vehicles. */
  vehicleOf: (selection: Selection) => Vehicle;
  /** HL-93's live load deflection in each span (the most of any girder, ft, down +) against L/800 (2.5.2.6.2). */
  liveDeflections: (live: LiveLoad) => { span: number; L: number; delta: number; limit: number; girder: number }[];
  /** A member's stations (each element's ends, and points between for the diagram's curve). */
  member: (member: Member, selection: Selection, perElement?: number, live?: LiveLoad | null) => MemberStation[];
  /** Reactions at the supports: forces and moments, global (permanent loads; live load is on the members and bearings). */
  reactions: (selection: Selection) => { node: number; R: Dof6<number> }[];
  /** Each bearing's forces: vertical (compression +), across and along the bridge. */
  bearings: (selection: Selection, live?: LiveLoad | null) => BearingResult[];
  /** Node displacements (global), for the deflected shape. */
  displacements: (selection: Selection) => Map<number, Dof6<number>>;
  /** The member an element belongs to. */
  memberOf: (elementId: number) => Member | undefined;
  stage: (stage: 1 | 2) => Analysis;
};

const ZERO = (): SectionForces => ({ N: 0, Vy: 0, Vz: 0, T: 0, My: 0, Mz: 0 });

export function analyzeBridge(definition: BridgeDefinition): BridgeAnalysis {
  const generated = generate(definition);
  const a1 = analyze(generated.stage1);
  const a2 = analyze(generated.stage2);
  const stageOf = (s: 1 | 2) => (s === 1 ? a1 : a2);
  const cases: CaseRef[] = [
    ...generated.stage1.loadCases.map((c, index) => ({ ...c, stage: 1 as const, index })),
    ...generated.stage2.loadCases.map((c, index) => ({ ...c, stage: 2 as const, index })),
  ];
  const combinations = combinationsFor(generated.wind.scale);
  const comboOf = (sel: Selection) => (sel.kind === "combination" ? combinations.find((c) => c.name === sel.name) : undefined);
  /** A selection's permanent load cases with their factors (a case picked alone counts as it is). */
  const terms = (sel: Selection): { ref: CaseRef; factor: number }[] => {
    if (sel.kind === "live") return [];
    if (sel.kind === "case") return cases.filter((c) => c.name === sel.name).map((ref) => ({ ref, factor: 1 }));
    const combo = comboOf(sel);
    return combo ? cases.filter((ref) => !ref.group).map((ref) => ({ ref, factor: combo.factors[ref.type] })).filter((t) => t.factor !== 0) : [];
  };
  /** A combination's alternatives: for each group, its options (the temperature rising or falling; the wind from
   * either side, its signed cases reversed together); the worst option counts, in the envelope. */
  type Term = { ref: CaseRef; factor: number };
  const groupsOf = (sel: Selection): Term[][][] => {
    const combo = comboOf(sel);
    if (!combo) return [];
    const out: Term[][][] = [];
    for (const g of ["TU", "TG"] as const) {
      const alt = cases.filter((c) => c.group === g && combo.factors[c.type]);
      if (alt.length) out.push(alt.map((ref) => [{ ref, factor: combo.factors[ref.type] }]));
    }
    const wind = cases.filter((c) => c.group === "wind" && combo.factors[c.type]);
    if (wind.length) out.push([1, -1].map((side) => wind.map((ref) => ({ ref, factor: combo.factors[ref.type] * (ref.signed ? side : 1) }))));
    return out;
  };
  const liveFactor = (sel: Selection) => (sel.kind === "live" ? 1 : (comboOf(sel)?.factors.LL ?? 0));
  const vehicleOf = (sel: Selection): Vehicle => comboOf(sel)?.vehicle ?? "hl93";
  const index = { 1: new Map(generated.stage1.elements.map((e, i) => [e.id, i])), 2: new Map(generated.stage2.elements.map((e, i) => [e.id, i])) };
  const nodeIndex = new Map(generated.stage1.nodes.map((n, i) => [n.id, i])); // the same nodes in both stages
  const nodes = generated.stage1.nodes;
  const elementNodes = new Map(generated.stage2.elements.map((e) => [e.id, [e.n1, e.n2] as const]));
  const owner = new Map<number, Member>();
  for (const m of generated.members) for (const id of m.elements) owner.set(id, m);

  const member = (m: Member, sel: Selection, perElement = 4, live?: LiveLoad | null): MemberStation[] => {
    const ts = terms(sel);
    const groups = groupsOf(sel);
    const gamma = live ? liveFactor(sel) : 0;
    const out: MemberStation[] = [];
    let x0 = 0;
    for (const id of m.elements) {
      const k2 = index[2].get(id)!;
      const L = a2.lengthOf(k2);
      const [n1, n2] = elementNodes.get(id)!;
      const A = nodes[nodeIndex.get(n1)!];
      const B = nodes[nodeIndex.get(n2)!];
      // Live load at the element's two ends, per force (null where it isn't followed).
      const ends = gamma ? COMPONENTS.map((c) => [live!.at(id, 0, c), live!.at(id, 1, c)] as const) : null;
      for (let p = 0; p <= perElement; p++) {
        const t = p / perElement;
        const forces = ZERO();
        let dz = 0;
        for (const { ref, factor } of ts) {
          const a = stageOf(ref.stage);
          const k = index[ref.stage].get(id);
          if (k === undefined) continue;
          const f = a.forcesAt(ref.index, k, t);
          for (const c of COMPONENTS) forces[c] += factor * f[c];
          const u = a.cases[ref.index].displacements;
          dz += factor * ((1 - t) * u[nodeIndex.get(n1)!][2] + t * u[nodeIndex.get(n2)!][2]);
        }
        const station: MemberStation = { x: x0 + t * L, p: [A.x + t * (B.x - A.x), A.y + t * (B.y - A.y), A.z + t * (B.z - A.z)], forces, dz };
        if (ends || groups.length) {
          station.max = { ...forces };
          station.min = { ...forces };
          for (const options of groups) {
            const values = options.map((opt) => {
              const f = ZERO();
              for (const { ref, factor } of opt) {
                const k = index[ref.stage].get(id);
                if (k === undefined) continue;
                const r = stageOf(ref.stage).forcesAt(ref.index, k, t);
                for (const c of COMPONENTS) f[c] += factor * r[c];
              }
              return f;
            });
            for (const c of COMPONENTS) {
              station.max[c] += Math.max(...values.map((v) => v[c]));
              station.min[c] += Math.min(...values.map((v) => v[c]));
            }
          }
        }
        if (ends) {
          COMPONENTS.forEach((c, ci) => {
            const [e0, e1] = ends[ci];
            if (!e0 || !e1) return;
            station.max![c] += gamma * ((1 - t) * e0.max.value + t * e1.max.value);
            station.min![c] += gamma * ((1 - t) * e0.min.value + t * e1.min.value);
          });
        }
        out.push(station);
      }
      x0 += L;
    }
    return out;
  };

  const sumDof = (sel: Selection, pick: (a: Analysis, c: number) => { node: number; R: Dof6<number> }[]) => {
    const total = new Map<number, Dof6<number>>();
    for (const { ref, factor } of terms(sel))
      for (const r of pick(stageOf(ref.stage), ref.index)) {
        const cur = total.get(r.node) ?? ([0, 0, 0, 0, 0, 0] as Dof6<number>);
        r.R.forEach((v, d) => (cur[d] += factor * v));
        total.set(r.node, cur);
      }
    return total;
  };
  const reactions = (sel: Selection) => [...sumDof(sel, (a, c) => a.cases[c].reactions)].map(([node, R]) => ({ node, R }));
  const displacements = (sel: Selection) => sumDof(sel, (a, c) => a.cases[c].displacements.map((R, i) => ({ node: a.model.nodes[i].id, R })));
  const linkIndex = new Map(generated.stage1.links.map((l, i) => [l.id, i]));
  const bearings = (sel: Selection, live?: LiveLoad | null): BearingResult[] => {
    const gamma = live ? liveFactor(sel) : 0;
    const groups = groupsOf(sel);
    return generated.bearings.map((b) => {
      const f = [0, 0, 0];
      const li = linkIndex.get(b.link)!;
      for (const { ref, factor } of terms(sel)) {
        const lf = stageOf(ref.stage).cases[ref.index].linkForces[li];
        for (let d = 0; d < 3; d++) f[d] += factor * lf[d];
      }
      // The alternatives: the worst option of each group, for each force.
      const hi = [0, 0, 0];
      const lo = [0, 0, 0];
      for (const options of groups) {
        const values = options.map((opt) => {
          const v = [0, 0, 0];
          for (const { ref, factor } of opt) {
            const lf = stageOf(ref.stage).cases[ref.index].linkForces[li];
            for (let d = 0; d < 3; d++) v[d] += factor * lf[d];
          }
          return v;
        });
        for (let d = 0; d < 3; d++) {
          hi[d] += Math.max(...values.map((v) => v[d]));
          lo[d] += Math.min(...values.map((v) => v[d]));
        }
      }
      const ll = gamma ? live!.bearing(b.link) : null;
      const envelope = ll || groups.length ? { max: -f[0] - lo[0] + gamma * (ll?.max ?? 0), min: -f[0] - hi[0] + gamma * (ll?.min ?? 0) } : {};
      const side = groups.length ? { transverseMax: Math.max(Math.abs(f[1] + hi[1]), Math.abs(f[1] + lo[1])), longitudinalMax: Math.max(Math.abs(f[2] + hi[2]), Math.abs(f[2] + lo[2])) } : {};
      return { support: b.support, girder: b.girder, link: b.link, vertical: -f[0], transverse: f[1], longitudinal: f[2], ...envelope, ...side };
    });
  };

  const checks: Check[] = cases.map((c) => {
    const e = stageOf(c.stage).cases[c.index].equilibrium;
    const scale = Math.max(1, Math.abs(e.applied[2]));
    return { name: c.name, applied: -e.applied[2], reactions: e.reactions[2], ok: Math.abs(e.applied[2] + e.reactions[2]) < 1e-6 * scale && e.residual < 1e-5 * scale };
  });
  const liveDeflections = (live: LiveLoad) => {
    const spans = new Map<number, { span: number; L: number; delta: number; limit: number; girder: number }>();
    for (const m of generated.members) {
      if (m.kind !== "girder" || !m.span) continue;
      const L = definition.spans[m.span - 1];
      const cur = spans.get(m.span) ?? { span: m.span, L, delta: 0, limit: L / 800, girder: m.girder ?? 0 };
      for (const id of m.elements) {
        const ends = elementNodes.get(id);
        if (!ends) continue;
        for (const n of ends) {
          const v = -live.deflection(n);
          if (v > cur.delta) Object.assign(cur, { delta: v, girder: m.girder ?? 0 });
        }
      }
      spans.set(m.span, cur);
    }
    return [...spans.values()].sort((x, y) => x.span - y.span);
  };
  return { generated, cases, combinations, liveDeflections, checks, ok: checks.every((c) => c.ok), liveFactor, vehicleOf, member, reactions, bearings, displacements, memberOf: (id) => owner.get(id), stage: stageOf };
}

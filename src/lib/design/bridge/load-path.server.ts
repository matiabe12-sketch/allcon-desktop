import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { designApproachSlab } from "../approach/approach-slab";
import { designBearing } from "../bearings/elastomeric";
import { designDeck } from "../decks/deck";
import { abutmentInputs, footingInputs, pileFoundationInputs, shaftInputs } from "../foundations/kinds";
import { runFoundation } from "../foundations/run";
import type { GirderInputs } from "../girders/prestressed";
import { approachSlabInputs, bearingInputs, deckInputs, designInputs, girderInputs, kindInfo, slabBridgeInputs, stripSealInputs, wingwallInputs } from "../kinds";
import { designStripSeal } from "../joints/strip-seal";
import { columnInputs, designColumn } from "../piers/column";
import { columnLinkFrom } from "../piers/column-link";
import { nodeLpSolver } from "../stm/lp-node";
import { designStm, stmInputs } from "../stm/strut-tie";
import { designWingwall } from "../walls/wingwall";
import { BRIDGE_GIRDER_BASE, girderInputsFor, runBridge, spanGroups, type BridgeInputs } from "./bridge";
import { abutmentFromBridge, approachSlabFromBridge, bearingFromBridge, bearingLineForce, capFromBridge, changedKeys, columnFromBridge, columnLongitudinal, deckFromBridge, footingFromColumn, integralStiffness, jointFromBridge, longitudinalShares, thermalReactions, approachOnAbutment, windAlong, padLineStiffness, pierStiffness, pilesFromColumn, shaftCageOf, shaftFromColumn, wingwallFromBridge, type LongStiffness } from "./loadpath";

// A bridge's load path through its linked designs (docs/bridge-model.md): each linked design's inputs
// brought up to date from the bridge, top to bottom (girders, deck, bearings; abutments, approach slabs
// and wingwalls; pier caps, columns and foundations), the missing ones created when asked, and a report
// of what changed and each one's verdict. Shared by the Bridge design and the Bridge section, which
// names each part by its design target's key (girders, deck, bearing-k, abutment-k, approach-k,
// wingwall-k, cap-k, column-k, foundation-k; a second group of girders across a joint girders-1, …).

export type SyncRow = { key: string; component: string; kind: string; designId: string | null; name: string; action: "created" | "updated" | "unchanged" | "missing" | "error"; changes: string[]; verdict: string };

export const verdictOf = (checks: { ok: boolean; advisory?: boolean }[]) => {
  const fail = checks.filter((c) => !c.ok && !c.advisory).length;
  return fail ? `${fail} of ${checks.filter((c) => !c.advisory).length} checks fail` : `all ${checks.filter((c) => !c.advisory).length} checks pass`;
};

export const girderKey = (gi: number) => (gi === 0 ? "girders" : `girders-${gi}`);

export async function runLoadPath(o: {
  orgId: string;
  userId: string;
  projectId: string | null;
  /** New designs' names start with it (the bridge's name). */
  prefix: string;
  b: BridgeInputs;
  /** Create the designs not linked yet. */
  create: boolean;
  /** Only these parts are saved, created and reported (the rest are still worked out, for the parts that take loads from them). */
  only?: Set<string>;
  /** A new girder design starts from it (the agency's criteria). */
  girderBase?: GirderInputs;
}): Promise<{ rows: SyncRow[]; b: BridgeInputs }> {
  const { b, create, prefix } = o;
  const rows: SyncRow[] = [];
  const wanted = (key: string) => !o.only || o.only.has(key);
  const load = async (id: string | null | undefined, kind: string) => (id && /^[0-9a-f-]{36}$/i.test(id) ? db.design.findFirst({ where: { id, orgId: o.orgId, kind }, select: { id: true, name: true, inputs: true } }) : null);
  // Both sides as the design's own parser reads them back (as saved), so what's reported is what changed, not its form.
  const norm = (kind: string, x: object) => JSON.parse(JSON.stringify(designInputs(kind, JSON.parse(JSON.stringify(x))))) as object;
  const save = async (kind: string, id: string, stored: unknown, after: object) => {
    const [b0, a0] = [norm(kind, (stored ?? {}) as object), norm(kind, after)];
    const changes = changedKeys(b0, a0);
    if (changes.length) await db.design.update({ where: { id }, data: { inputs: a0 as unknown as Prisma.InputJsonValue } });
    return changes;
  };
  const make = async (kind: string, name: string, inputs: object) => {
    const info = kindInfo(kind)!;
    const d = await db.design.create({ data: { orgId: o.orgId, projectId: o.projectId, kind, name: `${name} (${info.name})`.slice(0, 200), inputs: designInputs(kind, inputs) as unknown as Prisma.InputJsonValue, createdById: o.userId } });
    return d.id;
  };
  /** A part brought up to date: saved if linked, created if missing and asked to, else reported missing. Returns its id. */
  // `before` is the design as read (for the bridge's update); what changed is against it as stored.
  const upsert = async (key: string, label: string, kind: string, existing: { id: string; name: string; inputs?: unknown } | null, before: object, next: object, verdict: string, newName: string) => {
    if (!wanted(key)) return existing?.id ?? null;
    if (existing) {
      const changes = await save(kind, existing.id, existing.inputs ?? before, next);
      rows.push({ key, component: label, kind, designId: existing.id, name: existing.name, action: changes.length ? "updated" : "unchanged", changes, verdict });
      return existing.id;
    }
    if (create) {
      const id = await make(kind, newName, next);
      rows.push({ key, component: label, kind, designId: id, name: `${newName} (${kindInfo(kind)!.name})`, action: "created", changes: [], verdict });
      return id;
    }
    rows.push({ key, component: label, kind, designId: null, name: "", action: "missing", changes: [], verdict });
    return null;
  };
  const verdictTry = (f: () => { ok: boolean; advisory?: boolean }[]) => {
    try {
      return verdictOf(f());
    } catch (e) {
      return e instanceof Error ? e.message : "can't be worked out";
    }
  };

  // --- girders: one design per group of spans (none for a slab bridge: its slab design below) -------------------------
  const isSlab = b.superstructure === "slab";
  const groups = isSlab ? [] : spanGroups(b);
  const girderIds: (string | null)[] = isSlab ? [] : groups.map((_, gi) => b.girderDesignIds[gi] ?? null);
  const bases: (GirderInputs | null)[] = [];
  const names: string[] = [];
  const girderRows: { id: string; name: string; inputs: unknown }[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const d = await load(girderIds[gi], "lrfd-girder-check");
    bases.push(d ? girderInputs(d.inputs) : (o.girderBase ?? null));
    names.push(d?.name ?? "");
    if (d) girderRows[gi] = { id: d.id, name: d.name, inputs: d.inputs };
    else girderIds[gi] = null;
  }
  const sd0 = isSlab ? await load(b.slabDesignId, "slab-bridge") : null;
  const slabBefore = slabBridgeInputs(sd0?.inputs ?? {});
  const run = runBridge(b, bases, isSlab ? slabBefore : null);
  let slabId: string | null = null;
  let slabName = "";
  if (isSlab && run.slab) {
    const next = run.slab.inputs;
    slabId = await upsert("slab", "Slab", "slab-bridge", sd0, slabBefore, next, verdictOf(run.slab.result.checks), `${prefix}, slab`);
    slabName = sd0?.name ?? `${prefix}, slab (${kindInfo("slab-bridge")!.name})`;
  }
  for (let gi = 0; gi < groups.length; gi++) {
    const label = `Girders, span${groups[gi].length > 1 ? "s" : ""} ${groups[gi].map((j) => j + 1).join("–")}`;
    const next = girderInputsFor(b, run.layout, groups[gi], bases[gi] ?? undefined);
    const verdict = run.groups[gi].result.ok ? "all checks pass" : "some checks fail";
    const newName = `${prefix}, ${label.toLowerCase()}`;
    const id = await upsert(girderKey(gi), label, "lrfd-girder-check", girderRows[gi] ?? null, girderRows[gi] ? (bases[gi] ?? {}) : {}, next, verdict, newName);
    if (id && !girderIds[gi]) names[gi] = `${newName} (${kindInfo("lrfd-girder-check")!.name})`;
    girderIds[gi] = id;
  }
  const girders = new Map<string, GirderInputs>();
  for (let gi = 0; gi < groups.length; gi++) if (girderIds[gi]) girders.set(girderIds[gi]!, run.groups[gi].inputs);
  // A slab bridge: its spans and width for the columns' braking and wind along the bridge (column-link.ts reads them from a
  // girder design): a stand-in with the slab's spans; its depth for the wind the girder section's and the slab's (conservative).
  if (isSlab && slabId && run.slab) {
    const sp = run.slab.inputs.spans;
    girders.set(slabId, { ...BRIDGE_GIRDER_BASE, shape: b.shape, L: sp[0], extraSpans: sp.slice(1).map((L) => ({ L, strands: null, harped: null })), nGirders: b.nGirders, S: b.spacing, overhang: run.layout.overhang, barrierWidth: b.barrierWidth, deckT: b.deckT });
  }

  // --- the deck slab (the deck between the girders, the overhang and the rail) ----------------------------------------
  const dd = isSlab ? null : await load(b.deckDesignId, "deck-slab");
  const dBefore = deckInputs(dd?.inputs ?? {});
  const dNext = deckFromBridge(b, run, dBefore, girderIds[0] ? { id: girderIds[0], name: names[0] || `${prefix}, girders` } : null);
  const deckId = isSlab ? (b.deckDesignId ?? null) : await upsert("deck", "Deck, overhang and rail", "deck-slab", dd, dBefore, dNext, verdictTry(() => designDeck(dNext).checks), `${prefix}, deck`);
  // The rail's end-zone collision values, for the approach slabs it carries on along.
  let railEnd: { Mc: number; T: number } | null = null;
  try {
    const e = designDeck(dNext).endCase1;
    railEnd = e ? { Mc: e.Mc, T: e.T } : null;
  } catch {
    railEnd = null;
  }

  // --- each support's parts -------------------------------------------------------------------------------------------
  const comps = b.supports.map((_, i) => ({ support: i, ...(b.components.find((c) => c.support === i) ?? {}) }));
  // The bridge's longitudinal forces shared once among its supports by their stiffness along the bridge (loadpath.ts
  // longitudinalShares): each support's bearings (as linked) in series with its columns, or an integral abutment's
  // piles at the movement (their p–y secant stiffness).
  const stiff: LongStiffness[] = [];
  const padPre: number[] = [];
  for (const c of comps) {
    const s = b.supports[c.support];
    const bd0 = await load(c.bearingId, "elastomeric-bearing");
    const pad = bearingInputs(bd0?.inputs ?? {});
    const cast = s.type === "integral-abutment" || s.type === "continuous-pier";
    // A sliding bearing sticks until friction's overcome: its pad's stiffness below that.
    const kBear = cast || s.bearing === "fixed" ? Infinity : padLineStiffness(pad, b.nGirders);
    let kSub = Infinity;
    const a0 = s.type.endsWith("abutment") ? await load(c.abutmentId, "abutment") : null;
    const aIn = a0 || s.type.endsWith("abutment") ? abutmentFromBridge(b, run, c.support, abutmentInputs(a0?.inputs ?? {}), { braking: 0 }) : null;
    if (s.type === "integral-abutment" && aIn) kSub = integralStiffness(aIn);
    else if (s.pier && run.layout.piers[c.support]) {
      const col0 = await load(c.columnId, "pier-column");
      kSub = pierStiffness(s.pier, run.layout.piers[c.support]!.columnHeight, columnInputs(col0?.inputs ?? {}).fc);
    }
    stiff.push({ kSub, kBear });
    let f = 0;
    try {
      const bi = bearingFromBridge(b, run, c.support, pad, aIn);
      f = bearingLineForce(bi, designBearing(bi), b.nGirders);
    } catch {
      f = 0;
    }
    padPre.push(f);
  }
  const shares = longitudinalShares(b, stiff);
  // The temperature force each support takes along the bridge: its pads' shear where they slide; where it's fixed,
  // the other supports' pads' reaction (the superstructure in equilibrium).
  const tuForce = thermalReactions(b, stiff, padPre);
  for (const c of comps) {
    const s = b.supports[c.support];
    const k = c.support;
    const bd = await load(c.bearingId, "elastomeric-bearing");
    const bBefore = bearingInputs(bd?.inputs ?? {});
    // An abutment's design first: a semi-integral abutment's end diaphragm rides on the bearings.
    const abut = s.type.endsWith("abutment") ? await load(c.abutmentId, "abutment") : null;
    const abutBefore = abut ? abutmentInputs(abut.inputs) : abutmentInputs({});
    const abutNext = s.type.endsWith("abutment") ? abutmentFromBridge(b, run, k, abutBefore, { braking: shares[k].braking, windLong: windAlong(run, shares[k]) }) : null;
    // Its wingwalls, where the Bridge has them: their geometry and bars, so their Section B forces reach the abutment.
    const wdPre = abutNext ? await load(c.wingwallId, "cantilever-wingwall") : null;
    if (abutNext && wdPre) {
      const wi = wingwallInputs(wdPre.inputs);
      abutNext.wing = { L: wi.L, h: wi.h, t: wi.t, count: abutBefore.wing?.count ?? 2, heq: wi.heq, bars: wi.bars, ...(wi.cornerBars ? { cornerBars: wi.cornerBars } : {}) };
    }
    const bNext = bearingFromBridge(b, run, k, bBefore, abutNext);
    c.bearingId = await upsert(`bearing-${k}`, `${s.name}, bearings`, "elastomeric-bearing", bd, bBefore, bNext, verdictTry(() => designBearing(bNext).checks), `${prefix}, ${s.name} bearings`);
    // The force the bearings pass along the bridge as it expands and contracts (unfactored): the pads' shear, or a
    // sliding bearing's friction; none where cast in or fixed.
    let padTU = 0;
    try {
      padTU = bearingLineForce(bNext, designBearing(bNext), b.nGirders);
    } catch {
      padTU = 0;
    }
    if (Number.isFinite(stiff[k].kBear)) tuForce[k] = padTU;
    if (abutNext && abutNext.type !== "integral-piles" && abutNext.type !== "integral-shafts" && abutNext.type !== "integral-micropiles") abutNext.bearingShear = Math.round((tuForce[k] / abutNext.length) * 1000) / 1000;
    if (s.type.endsWith("abutment") && abutNext) {
      const d = abut;
      const before = abutBefore;
      // The approach slab first: its weight, wearing surface and lane load rest half on the abutment.
      const sd = await load(c.approachSlabId, "approach-slab");
      const sBefore = approachSlabInputs(sd?.inputs ?? {});
      const sNext = approachSlabFromBridge(b, k, sBefore, railEnd);
      const next = { ...abutNext, ...approachOnAbutment(b, sNext, abutNext.length, run.groups[0]?.inputs.barrierWeight ?? 0) };
      c.abutmentId = await upsert(`abutment-${k}`, s.name, "abutment", d, before, next, verdictTry(() => runFoundation("abutment", next).checks), `${prefix}, ${s.name}`);
      c.approachSlabId = await upsert(`approach-${k}`, `${s.name}, approach slab`, "approach-slab", sd, sBefore, sNext, verdictTry(() => designApproachSlab(sNext).checks), `${prefix}, ${s.name} approach slab`);
      const wd = await load(c.wingwallId, "cantilever-wingwall");
      const wBefore = wingwallInputs(wd?.inputs ?? {});
      const wNext = wingwallFromBridge(b, k, next, wBefore);
      c.wingwallId = await upsert(`wingwall-${k}`, `${s.name}, wingwall`, "cantilever-wingwall", wd, wBefore, wNext, verdictTry(() => designWingwall(wNext).checks), `${prefix}, ${s.name} wingwall`);
      const jd = await load(c.jointId, "strip-seal-joint");
      const jBefore = stripSealInputs(jd?.inputs ?? {});
      const jNext = jointFromBridge(b, k, sNext.L, jBefore);
      c.jointId = await upsert(`joint-${k}`, `${s.name}, expansion device`, "strip-seal-joint", jd, jBefore, jNext, verdictTry(() => designStripSeal(jNext).checks), `${prefix}, ${s.name} expansion device`);
      continue;
    }
    // A pier: its cap (strut-and-tie from a standard pier cap), column and foundation, from the bridge's pier.
    if (!s.pier) {
      if (wanted(`cap-${k}`)) rows.push({ key: `cap-${k}`, component: `${s.name}`, kind: "stm-d-region", designId: null, name: "", action: "missing", changes: [], verdict: "describe the pier (cap, columns, foundation) in the supports" });
      continue;
    }
    const cap = await load(c.capId, "stm-d-region");
    const capBefore = cap ? stmInputs(cap.inputs) : stmInputs({});
    let capNext = capBefore;
    let capVerdict = "";
    try {
      capNext = capFromBridge(b, run, k, capBefore, girderIds, names, slabId, slabName);
      // Its force along the bridge at the bearings, its share (the stiffness split): the governing of Strength I's
      // braking, V's braking with the wind and III's wind, with the bearings' temperature force at γTU 0.50.
      if (capNext.girders) {
        const wa = windAlong(run, shares[k]);
        const br = shares[k].braking;
        const F = Math.max(1.75 * br, wa ? 1.35 * br + wa.WS5 + wa.WL : 0, wa ? wa.WS3 : 0) + 0.5 * tuForce[k];
        capNext = { ...capNext, girders: { ...capNext.girders, along: F > 0 ? { F: Math.round(F * 10) / 10, basis: `${(shares[k].share * 100).toFixed(0)}% of the braking and wind along, ${tuForce[k].toFixed(1)} kip temperature` } : null } };
      }
      capVerdict = verdictOf((await designStm(capNext, nodeLpSolver)).checks);
    } catch (e) {
      capVerdict = e instanceof Error ? e.message : "the cap couldn't be built";
    }
    c.capId = await upsert(`cap-${k}`, `${s.name}, cap`, "stm-d-region", cap, capBefore, capNext, capVerdict, `${prefix}, ${s.name} cap`);
    const capName = cap?.name ?? `${prefix}, ${s.name} cap (${kindInfo("stm-d-region")!.name})`;
    const col = await load(c.columnId, "pier-column");
    const colBefore = columnInputs(col?.inputs ?? {});
    // The linked drilled shaft's cage, for the column-to-shaft connection (CDOT BDM Figure 11-13).
    const shaftNow = s.pier.foundation === "drilled-shaft" && c.foundationKind === "drilled-shaft" ? await load(c.foundationId, "drilled-shaft") : null;
    let colNext = colBefore;
    let colResult: ReturnType<typeof designColumn> | null = null;
    let colVerdict = "";
    try {
      // The column takes its loads from the cap's strut-and-tie model (linked when the cap has a design).
      colNext = columnFromBridge(b, run, k, colBefore, columnLinkFrom(c.capId ?? "", capName, capNext, girders));
      if (colNext.base === "shaft") colNext = { ...colNext, shaftCage: shaftNow ? shaftCageOf(shaftInputs(shaftNow.inputs)) : null };
      colNext = { ...colNext, longitudinal: columnLongitudinal(b, k, colNext, shares[k].braking, stiff[k], tuForce[k]) };
      // The link's refresh time stays when its loads are the same (it isn't a change of the column).
      const [was, now] = [colBefore.link, colNext.link] as ({ refreshed?: string } | null | undefined)[];
      if (was && now && was.refreshed && changedKeys({ l: { ...was, refreshed: "" } }, { l: { ...now, refreshed: "" } }).length === 0) colNext = { ...colNext, link: { ...now, refreshed: was.refreshed } as typeof colNext.link };
      colResult = designColumn(colNext);
      colVerdict = verdictOf(colResult.checks);
    } catch (e) {
      colVerdict = e instanceof Error ? e.message : "the column couldn't be worked out";
    }
    c.columnId = await upsert(`column-${k}`, `${s.name}, column`, "pier-column", col, colBefore, colNext, colVerdict, `${prefix}, ${s.name} column`);
    const kind = s.pier.foundation;
    if (c.foundationKind !== kind) c.foundationId = null;
    c.foundationKind = kind;
    const fd = await load(c.foundationId, kind);
    const fBefore = kind === "spread-footing" ? footingInputs(fd?.inputs ?? {}) : kind === "pile-foundation" ? pileFoundationInputs(fd?.inputs ?? {}) : shaftInputs(fd?.inputs ?? {});
    let fNext: object = fBefore;
    if (colResult) {
      // A foundation entirely below ground takes the live load without the dynamic load allowance (AASHTO 3.6.2.1):
      // the column worked out again from the cap's loads without IM, for its base forces only. If that can't be
      // worked out, the loads with IM are kept (conservative).
      const buried =
        kind === "spread-footing"
          ? (fBefore as ReturnType<typeof footingInputs>).Df >= (fBefore as ReturnType<typeof footingInputs>).t / 12
          : kind === "pile-foundation"
            ? (fBefore as ReturnType<typeof pileFoundationInputs>).Df >= (fBefore as ReturnType<typeof pileFoundationInputs>).capT / 12
            : (fBefore as ReturnType<typeof shaftInputs>).topDepth >= 0;
      let baseCol = colResult;
      if (buried)
        try {
          let cn = columnFromBridge(b, run, k, colBefore, columnLinkFrom(c.capId ?? "", capName, capNext, girders, { noIM: true }));
          if (cn.base === "shaft") cn = { ...cn, shaftCage: colNext.shaftCage };
          cn = { ...cn, longitudinal: colNext.longitudinal };
          baseCol = designColumn(cn);
        } catch {
          baseCol = colResult;
        }
      fNext = kind === "spread-footing" ? footingFromColumn(baseCol, fBefore as ReturnType<typeof footingInputs>, colNext) : kind === "pile-foundation" ? pilesFromColumn(baseCol, fBefore as ReturnType<typeof pileFoundationInputs>, colNext) : shaftFromColumn(baseCol, fBefore as ReturnType<typeof shaftInputs>, colNext);
      if (kind === "drilled-shaft") fNext = { ...fNext, D: Math.max((fNext as ReturnType<typeof shaftInputs>).D, s.pier.columnShape === "round" ? s.pier.columnSize : 0) };
    }
    c.foundationId = await upsert(`foundation-${k}`, `${s.name}, foundation`, kind, fd, fBefore, fNext, colResult ? verdictTry(() => runFoundation(kind, fNext).checks) : "the column's base forces are needed first", `${prefix}, ${s.name} foundation`);
  }

  return {
    rows,
    b: {
      ...b,
      deckDesignId: deckId,
      ...(isSlab ? { slabDesignId: slabId } : {}),
      girderDesignIds: girderIds,
      components: comps.map(({ support, bearingId, abutmentId, approachSlabId, wingwallId, jointId, capId, columnId, foundationId, foundationKind }) => ({ support, bearingId: bearingId ?? null, abutmentId: abutmentId ?? null, approachSlabId: approachSlabId ?? null, wingwallId: wingwallId ?? null, jointId: jointId ?? null, capId: capId ?? null, columnId: columnId ?? null, foundationId: foundationId ?? null, foundationKind: foundationKind ?? null })),
    },
  };
}

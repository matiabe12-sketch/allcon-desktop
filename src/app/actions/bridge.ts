"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser, isUuid, requireUser } from "@/lib/auth/session";
import { bridgeInputs } from "@/lib/design/bridge/kinds";
import { girderInputsFor, runBridge, spanGroups, type BridgeInputs } from "@/lib/design/bridge/bridge";
import { designBearing } from "@/lib/design/bearings/elastomeric";
import { designDeck } from "@/lib/design/decks/deck";
import { abutmentFromBridge, approachSlabFromBridge, bearingFromBridge, deckFromBridge, capFromBridge, changedKeys, columnFromBridge, footingFromColumn, pilesFromColumn, shaftFromColumn, wingwallFromBridge } from "@/lib/design/bridge/loadpath";
import { designApproachSlab } from "@/lib/design/approach/approach-slab";
import { designWingwall } from "@/lib/design/walls/wingwall";
import { nodeLpSolver } from "@/lib/design/stm/lp-node";
import { abutmentInputs, footingInputs, pileFoundationInputs, shaftInputs } from "@/lib/design/foundations/kinds";
import { runFoundation } from "@/lib/design/foundations/run";
import { type GirderInputs, designGirder } from "@/lib/design/girders/prestressed";
import { approachSlabInputs, bearingInputs, deckInputs, designInputs, girderInputs, kindInfo, wingwallInputs, stripSealInputs } from "@/lib/design/kinds";
import { columnInputs, designColumn } from "@/lib/design/piers/column";
import { columnLinkFrom } from "@/lib/design/piers/column-link";
import { designStm, stmInputs } from "@/lib/design/stm/strut-tie";
import { db } from "@/lib/db";
import { bridgeIfc, type BridgeComponents } from "@/lib/design/bridge/ifc";
import { attachRebar, rebarOnSpecs, rebarSources, sectionRebarSources, type RebarDesigns } from "@/lib/design/bridge/ifc-rebar";
import { newModelFileKey, workerBridge, workerBridgeModel, WorkerError, type WorkerSummary } from "@/lib/ifc/worker";
import { gzipSync } from "node:zlib";
import { redirect } from "next/navigation";
import { z } from "zod";
import { analyzeBridge } from "@/lib/bridge/bridge";
import { BRIDGE_DEFAULTS, bridgeDefinition, type DesignLink } from "@/lib/bridge/definition";
import { designPrefill, designTargets } from "@/lib/bridge/design-links";
import { importedOf } from "@/lib/bridge/imported";
import { movingLoad } from "@/lib/bridge/moving";
import { bridgeCalcLines } from "@/lib/bridge/report";
import { ifcElements } from "@/lib/bridge/solids";
import { layout } from "@/lib/calcs/library/templates";
import { CALC_FILE, newCalcKey } from "@/lib/calcs/server";
import { emptyCalc } from "@/lib/calcs/types";
import { designStripSeal } from "@/lib/design/joints/strip-seal";
import { deleteFiles, putFile } from "@/lib/storage";

// The Bridge's load path through its linked designs (docs/bridge-model.md): each linked design's
// inputs brought up to date from the Bridge, top to bottom (girders, abutments, pier caps, columns,
// foundations), the missing girder and abutment designs created when asked, and a report of what
// changed and each component's verdict.

export type SyncRow = { component: string; kind: string; designId: string | null; name: string; action: "created" | "updated" | "unchanged" | "missing" | "error"; changes: string[]; verdict: string };

async function ownBridgeDesign(bridgeId: string) {
  const user = await getCurrentUser();
  if (!user || !isUuid(bridgeId)) throw new Error("Bridge not found");
  const design = await db.design.findFirst({ where: { id: bridgeId, orgId: user.orgId, kind: "bridge" } });
  if (!design) throw new Error("Bridge not found");
  return { user, design };
}

/** The designs a Bridge can link to: the org's designs of each component kind, newest first. */
export async function bridgeCandidates(): Promise<Record<string, { id: string; name: string }[]>> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in");
  const kinds = ["lrfd-girder-check", "deck-slab", "elastomeric-bearing", "abutment", "approach-slab", "cantilever-wingwall", "stm-d-region", "pier-column", "spread-footing", "pile-foundation", "drilled-shaft"];
  const rows = await db.design.findMany({ where: { orgId: user.orgId, kind: { in: kinds } }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true, kind: true }, take: 500 });
  return Object.fromEntries(kinds.map((k) => [k, rows.filter((r) => r.kind === k).map((r) => ({ id: r.id, name: r.name }))]));
}

const verdictOf = (checks: { ok: boolean; advisory?: boolean }[]) => {
  const fail = checks.filter((c) => !c.ok && !c.advisory).length;
  return fail ? `${fail} of ${checks.filter((c) => !c.advisory).length} checks fail` : `all ${checks.filter((c) => !c.advisory).length} checks pass`;
};

export async function syncBridge(bridgeId: string, inputsNow: unknown, create: boolean): Promise<{ rows: SyncRow[]; inputs: BridgeInputs }> {
  const { user, design } = await ownBridgeDesign(bridgeId);
  const b = bridgeInputs(inputsNow ?? design.inputs);
  const rows: SyncRow[] = [];
  const load = async (id: string | null | undefined, kind: string) => (id && isUuid(id) ? db.design.findFirst({ where: { id, orgId: user.orgId, kind }, select: { id: true, name: true, inputs: true } }) : null);
  const save = async (id: string, before: object, after: object) => {
    const changes = changedKeys(before, after);
    if (changes.length) await db.design.update({ where: { id }, data: { inputs: after as unknown as Prisma.InputJsonValue } });
    return changes;
  };
  const make = async (kind: string, name: string, inputs: object) => {
    const info = kindInfo(kind)!;
    const d = await db.design.create({ data: { orgId: user.orgId, projectId: design.projectId, kind, name: `${name} (${info.name})`.slice(0, 200), inputs: designInputs(kind, inputs) as unknown as Prisma.InputJsonValue, createdById: user.id } });
    return d.id;
  };

  // --- girders: one design per group of spans ---------------------------------------------------------------------
  const groups = spanGroups(b);
  const girderIds: (string | null)[] = groups.map((_, gi) => b.girderDesignIds[gi] ?? null);
  const bases: (GirderInputs | null)[] = [];
  const names: string[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const d = await load(girderIds[gi], "lrfd-girder-check");
    bases.push(d ? girderInputs(d.inputs) : null);
    names.push(d?.name ?? "");
    if (!d) girderIds[gi] = null;
  }
  const run = runBridge(b, bases);
  for (let gi = 0; gi < groups.length; gi++) {
    const label = `Girders, span${groups[gi].length > 1 ? "s" : ""} ${groups[gi].map((j) => j + 1).join("–")}`;
    const next = girderInputsFor(b, run.layout, groups[gi], bases[gi] ?? undefined);
    const verdict = run.groups[gi].result.ok ? "all checks pass" : "some checks fail";
    if (girderIds[gi]) {
      const changes = await save(girderIds[gi]!, bases[gi]!, next);
      rows.push({ component: label, kind: "lrfd-girder-check", designId: girderIds[gi], name: names[gi], action: changes.length ? "updated" : "unchanged", changes, verdict });
    } else if (create) {
      girderIds[gi] = await make("lrfd-girder-check", `${design.name}, ${label.toLowerCase()}`, next);
      names[gi] = `${design.name}, ${label.toLowerCase()}`;
      rows.push({ component: label, kind: "lrfd-girder-check", designId: girderIds[gi], name: names[gi], action: "created", changes: [], verdict });
    } else rows.push({ component: label, kind: "lrfd-girder-check", designId: null, name: "", action: "missing", changes: [], verdict });
  }

  // --- each support's components ------------------------------------------------------------------------------------
  const comps = b.supports.map((_, i) => ({ support: i, ...(b.components.find((c) => c.support === i) ?? {}) }));
  /** A component brought up to date: saved if linked, created if missing and asked to, else reported missing. Returns its id. */
  const upsert = async (label: string, kind: string, existing: { id: string; name: string } | null, before: object, next: object, verdict: string, newName: string) => {
    if (existing) {
      const changes = await save(existing.id, before, next);
      rows.push({ component: label, kind, designId: existing.id, name: existing.name, action: changes.length ? "updated" : "unchanged", changes, verdict });
      return existing.id;
    }
    if (create) {
      const id = await make(kind, newName, next);
      rows.push({ component: label, kind, designId: id, name: `${newName} (${kindInfo(kind)!.name})`, action: "created", changes: [], verdict });
      return id;
    }
    rows.push({ component: label, kind, designId: null, name: "", action: "missing", changes: [], verdict });
    return null;
  };
  const verdictTry = (f: () => { ok: boolean; advisory?: boolean }[]) => {
    try {
      return verdictOf(f());
    } catch (e) {
      return e instanceof Error ? e.message : "can't be worked out";
    }
  };
  const girders = new Map<string, GirderInputs>();
  for (let gi = 0; gi < groups.length; gi++) if (girderIds[gi]) girders.set(girderIds[gi]!, run.groups[gi].inputs);

  // --- the deck slab (the deck between the girders, the overhang and the rail) ----------------------------------------
  const dd = await load(b.deckDesignId, "deck-slab");
  const dBefore = deckInputs(dd?.inputs ?? {});
  const dNext = deckFromBridge(b, run, dBefore, girderIds[0] ? { id: girderIds[0], name: names[0] || `${design.name}, girders` } : null);
  const deckId = await upsert("Deck, overhang and rail", "deck-slab", dd, dBefore, dNext, verdictTry(() => designDeck(dNext).checks), `${design.name}, deck`);

  for (const c of comps) {
    const s = b.supports[c.support];
    // The bearing pads under the girders here.
    const bd = await load(c.bearingId, "elastomeric-bearing");
    const bBefore = bearingInputs(bd?.inputs ?? {});
    const bNext = bearingFromBridge(b, run, c.support, bBefore);
    c.bearingId = await upsert(`${s.name}, bearings`, "elastomeric-bearing", bd, bBefore, bNext, verdictTry(() => designBearing(bNext).checks), `${design.name}, ${s.name} bearings`);
    if (s.type.endsWith("abutment")) {
      const d = await load(c.abutmentId, "abutment");
      const before = d ? abutmentInputs(d.inputs) : abutmentInputs({});
      const next = abutmentFromBridge(b, run, c.support, before);
      c.abutmentId = await upsert(s.name, "abutment", d, before, next, verdictTry(() => runFoundation("abutment", next).checks), `${design.name}, ${s.name}`);
      // Its approach slab and a wingwall.
      const sd = await load(c.approachSlabId, "approach-slab");
      const sBefore = approachSlabInputs(sd?.inputs ?? {});
      const sNext = approachSlabFromBridge(b, c.support, sBefore);
      c.approachSlabId = await upsert(`${s.name}, approach slab`, "approach-slab", sd, sBefore, sNext, verdictTry(() => designApproachSlab(sNext).checks), `${design.name}, ${s.name} approach slab`);
      const wd = await load(c.wingwallId, "cantilever-wingwall");
      const wBefore = wingwallInputs(wd?.inputs ?? {});
      const wNext = wingwallFromBridge(b, c.support, next, wBefore);
      c.wingwallId = await upsert(`${s.name}, wingwall`, "cantilever-wingwall", wd, wBefore, wNext, verdictTry(() => designWingwall(wNext).checks), `${design.name}, ${s.name} wingwall`);
      continue;
    }
    // A pier: its cap (strut-and-tie from a standard pier cap), column and foundation, from the Bridge's pier.
    if (!s.pier) {
      rows.push({ component: `${s.name}`, kind: "stm-d-region", designId: null, name: "", action: "missing", changes: [], verdict: "describe the pier (cap, columns, foundation) in the Bridge's supports" });
      continue;
    }
    const cap = await load(c.capId, "stm-d-region");
    const capBefore = cap ? stmInputs(cap.inputs) : stmInputs({});
    let capNext = capBefore;
    let capVerdict = "";
    try {
      capNext = capFromBridge(b, run, c.support, capBefore, girderIds, names);
      capVerdict = verdictOf((await designStm(capNext, nodeLpSolver)).checks);
    } catch (e) {
      capVerdict = e instanceof Error ? e.message : "the cap couldn't be built";
    }
    c.capId = await upsert(`${s.name}, cap`, "stm-d-region", cap, capBefore, capNext, capVerdict, `${design.name}, ${s.name} cap`);
    if (!c.capId) continue;
    const capName = cap?.name ?? `${design.name}, ${s.name} cap`;
    const col = await load(c.columnId, "pier-column");
    const colBefore = columnInputs(col?.inputs ?? {});
    let colNext = colBefore;
    let colResult: ReturnType<typeof designColumn> | null = null;
    let colVerdict = "";
    try {
      colNext = columnFromBridge(b, run, c.support, colBefore, columnLinkFrom(c.capId, capName, capNext, girders));
      colResult = designColumn(colNext);
      colVerdict = verdictOf(colResult.checks);
    } catch (e) {
      colVerdict = e instanceof Error ? e.message : "the column couldn't be worked out";
    }
    c.columnId = await upsert(`${s.name}, column`, "pier-column", col, colBefore, colNext, colVerdict, `${design.name}, ${s.name} column`);
    const kind = s.pier.foundation;
    if (c.foundationKind !== kind) c.foundationId = null;
    c.foundationKind = kind;
    const fd = await load(c.foundationId, kind);
    const fBefore = kind === "spread-footing" ? footingInputs(fd?.inputs ?? {}) : kind === "pile-foundation" ? pileFoundationInputs(fd?.inputs ?? {}) : shaftInputs(fd?.inputs ?? {});
    let fNext: object = fBefore;
    if (colResult) {
      fNext = kind === "spread-footing" ? footingFromColumn(colResult, fBefore as ReturnType<typeof footingInputs>) : kind === "pile-foundation" ? pilesFromColumn(colResult, fBefore as ReturnType<typeof pileFoundationInputs>) : shaftFromColumn(colResult, fBefore as ReturnType<typeof shaftInputs>);
      if (kind === "drilled-shaft") fNext = { ...fNext, D: Math.max((fNext as ReturnType<typeof shaftInputs>).D, s.pier.columnShape === "round" ? s.pier.columnSize : 0) };
    }
    c.foundationId = await upsert(`${s.name}, foundation`, kind, fd, fBefore, fNext, colResult ? verdictTry(() => runFoundation(kind, fNext).checks) : "the column's base forces are needed first", `${design.name}, ${s.name} foundation`);
  }

  // The Bridge keeps the links it made.
  const next: BridgeInputs = {
    ...b,
    girderDesignIds: girderIds,
    deckDesignId: deckId,
    components: comps.map(({ support, bearingId, abutmentId, approachSlabId, wingwallId, capId, columnId, foundationId, foundationKind }) => ({ support, bearingId: bearingId ?? null, abutmentId: abutmentId ?? null, approachSlabId: approachSlabId ?? null, wingwallId: wingwallId ?? null, capId: capId ?? null, columnId: columnId ?? null, foundationId: foundationId ?? null, foundationKind: foundationKind ?? null })),
  };
  await db.design.update({ where: { id: design.id }, data: { inputs: next as unknown as Prisma.InputJsonValue } });
  revalidatePath("/design");
  return { rows, inputs: next };
}

/**
 * The Bridge's IFC 4.3 model (phase 2, docs/bridge-model.md): the alignment, the bridge's parts and every
 * element at its designed size and place, from the Bridge and its linked designs, saved as a 3D model in
 * the Bridge's project. Returns the model's link.
 */
export async function buildBridgeModel(bridgeId: string, inputsNow: unknown): Promise<{ link: string; elements: number } | { error: string }> {
  const { user, design } = await ownBridgeDesign(bridgeId);
  if (!design.projectId) return { error: "Put the Bridge in a project first (the project picker at the top): the model is saved there." };
  const b = bridgeInputs(inputsNow ?? design.inputs);
  const ids = b.girderDesignIds.filter((x): x is string => !!x && isUuid(x));
  const linked = await db.design.findMany({ where: { id: { in: ids }, orgId: user.orgId, kind: "lrfd-girder-check" }, select: { id: true, inputs: true } });
  let run: ReturnType<typeof runBridge>;
  try {
    run = runBridge(b, b.girderDesignIds.map((id) => { const d = linked.find((x) => x.id === id); return d ? girderInputs(d.inputs) : null; }));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The bridge can't be laid out." };
  }
  const verdicts: Record<string, string> = {};
  const verdictTry = (id: string | null | undefined, f: () => { ok: boolean; advisory?: boolean }[]) => {
    if (!id) return;
    try {
      verdicts[id] = verdictOf(f());
    } catch {
      verdicts[id] = "can't be worked out";
    }
  };
  run.groups.forEach((g, gi) => {
    const id = b.girderDesignIds[gi];
    if (id) verdicts[id] = g.result.ok ? "all checks pass" : "some checks fail";
  });
  const load = async (id: string | null | undefined, kind: string) => (id && isUuid(id) ? db.design.findFirst({ where: { id, orgId: user.orgId, kind }, select: { id: true, inputs: true } }) : null);
  const deck = await load(b.deckDesignId, "deck-slab");
  const comps: BridgeComponents = { verdicts, abutments: {}, approachSlabs: {}, foundations: {}, deckId: deck?.id ?? null, ids: { girders: b.girderDesignIds, caps: {}, columns: {} } };
  // The designs whose bars go in the model besides those comps carries.
  const rebar: RebarDesigns = { deck: deck ? { id: deck.id, inputs: deckInputs(deck.inputs) } : null, caps: {}, columns: {} };
  for (const c of b.components) {
    const s = b.supports[c.support];
    if (!s) continue;
    if (s.type.endsWith("abutment")) {
      const a = await load(c.abutmentId, "abutment");
      if (a) {
        const inputs = abutmentInputs(a.inputs);
        comps.abutments![c.support] = { id: a.id, inputs };
        verdictTry(a.id, () => runFoundation("abutment", inputs).checks);
      }
      const ap = await load(c.approachSlabId, "approach-slab");
      if (ap) {
        const inputs = approachSlabInputs(ap.inputs);
        comps.approachSlabs![c.support] = { id: ap.id, inputs };
        verdictTry(ap.id, () => designApproachSlab(inputs).checks);
      }
      continue;
    }
    comps.ids!.caps![c.support] = c.capId ?? null;
    comps.ids!.columns![c.support] = c.columnId ?? null;
    const cap = await load(c.capId, "stm-d-region");
    if (cap) rebar.caps![c.support] = { id: cap.id, inputs: stmInputs(cap.inputs) };
    const col = await load(c.columnId, "pier-column");
    if (col) rebar.columns![c.support] = { id: col.id, inputs: columnInputs(col.inputs) };
    const kind = s.pier?.foundation;
    const f = kind && c.foundationKind === kind ? await load(c.foundationId, kind) : null;
    if (f && kind) {
      const inputs = kind === "spread-footing" ? footingInputs(f.inputs) : kind === "pile-foundation" ? pileFoundationInputs(f.inputs) : shaftInputs(f.inputs);
      comps.foundations![c.support] = { id: f.id, kind, inputs };
      verdictTry(f.id, () => runFoundation(kind, inputs).checks);
    }
  }
  const description = attachRebar(bridgeIfc(b, run, comps, design.name), rebarSources(comps, rebar));
  const id = randomUUID();
  const fileKey = newModelFileKey(id);
  let made: Awaited<ReturnType<typeof workerBridgeModel>>;
  try {
    made = await workerBridgeModel(fileKey, { ...description, project: design.name });
  } catch (e) {
    return { error: e instanceof WorkerError ? e.message : "The IFC model couldn't be written." };
  }
  await db.ifcModel.create({
    data: {
      id,
      projectId: design.projectId,
      name: `${design.name} (IFC 4.3)`.slice(0, 200),
      description: `Built from the Bridge "${design.name}": the alignment, ${run.layout.spans.length} span(s) and ${run.layout.supports.length} supports, each element from its linked design.`,
      fileKey,
      fileSize: made.size,
      summary: made.summary as unknown as object,
      elementCount: made.summary.elements,
      editedAt: new Date(),
      createdById: user.id,
    },
  });
  revalidatePath(`/projects/${design.projectId}`);
  return { link: `/projects/${design.projectId}/models/ifc/${id}`, elements: made.summary.elements };
}

// --- The Bridge section (web): a bridge modeled once, analyzed and designed ------------------------------

const name = z.string().trim().min(1, "Give the bridge a name").max(200);

async function ownBridge(bridgeId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in first");
  const bridge = isUuid(bridgeId) ? await db.bridge.findFirst({ where: { id: bridgeId, orgId: user.orgId } }) : null;
  if (!bridge) throw new Error("Bridge not found");
  return { user, bridge };
}

/** A new bridge with the wizard's defaults, opened. */
export async function createBridge() {
  const user = await requireUser();
  const count = await db.bridge.count({ where: { orgId: user.orgId } });
  const bridge = await db.bridge.create({ data: { orgId: user.orgId, name: `Bridge ${count + 1}`, definition: BRIDGE_DEFAULTS as unknown as Prisma.InputJsonValue, createdById: user.id } });
  revalidatePath("/bridges");
  redirect(`/bridges/${bridge.id}`);
}

/** The bridge's definition as it's edited (saved as you go). */
export async function saveBridgeDefinition(bridgeId: string, definition: unknown) {
  const { bridge } = await ownBridge(bridgeId);
  if (importedOf(bridge.definition)) throw new Error("An imported model has no definition to save");
  // The designs started from the bridge are kept as the server has them (they're added by createBridgeDesign).
  const kept = bridgeDefinition(bridge.definition);
  const next = { ...bridgeDefinition(definition), designs: kept.designs, ...(kept.ifcModelId ? { ifcModelId: kept.ifcModelId } : {}) };
  await db.bridge.update({ where: { id: bridge.id }, data: { definition: next as unknown as Prisma.InputJsonValue } });
}

export async function renameBridge(bridgeId: string, newName: string) {
  const { bridge } = await ownBridge(bridgeId);
  const parsed = name.safeParse(newName);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
  await db.bridge.update({ where: { id: bridge.id }, data: { name: parsed.data } });
  revalidatePath("/bridges", "layout");
}

export async function setBridgeProject(bridgeId: string, projectId: string | null) {
  const { user, bridge } = await ownBridge(bridgeId);
  const project = projectId && isUuid(projectId) ? await db.project.findFirst({ where: { id: projectId, orgId: user.orgId }, select: { id: true } }) : null;
  if (projectId && !project) throw new Error("Project not found");
  await db.bridge.update({ where: { id: bridge.id }, data: { projectId: project?.id ?? null } });
  revalidatePath("/bridges");
}

export async function deleteBridge(bridgeId: string) {
  const { bridge } = await ownBridge(bridgeId);
  await db.bridge.delete({ where: { id: bridge.id } });
  const file = importedOf(bridge.definition)?.fileKey;
  if (file) await deleteFiles([file]).catch(() => undefined);
  revalidatePath("/bridges");
}

/**
 * A design for one part of the bridge (its girders, deck, a line of bearings, a pier's columns, a
 * joint), started in the Design section with its inputs taken from the bridge's model and analysis.
 * Started again for the same part, it makes a new design from the bridge as it is now.
 */
export async function createBridgeDesign(bridgeId: string, targetKey: string): Promise<{ designId: string; designs: DesignLink[] }> {
  const { user, bridge } = await ownBridge(bridgeId);
  if (importedOf(bridge.definition)) throw new Error("Designs from an imported model are coming: its members need naming first");
  const definition = bridgeDefinition(bridge.definition);
  const target = designTargets(definition).find((t) => t.key === targetKey);
  if (!target) throw new Error("That part of the bridge has no design tool");
  const analysis = analyzeBridge(definition);
  const live = movingLoad(analysis.generated, analysis.stage(2));
  const { inputs, name } = designPrefill(target, definition, analysis, live);
  const design = await db.design.create({
    data: { orgId: user.orgId, projectId: bridge.projectId, kind: target.kind, name: `${bridge.name}: ${name}`, inputs: designInputs(target.kind, inputs) as unknown as Prisma.InputJsonValue, createdById: user.id },
  });
  const designs = [...definition.designs.filter((l) => l.target !== target.key), { id: design.id, target: target.key, kind: target.kind }];
  await db.bridge.update({ where: { id: bridge.id }, data: { definition: { ...definition, designs } as unknown as Prisma.InputJsonValue } });
  revalidatePath("/design");
  return { designId: design.id, designs };
}

export type BridgeDesignStatus = { id: string; target: string; name: string; ok: boolean | null };

/** The designs started from the bridge, each with whether its checks pass (null: it can't be worked out as entered; missing: deleted). */
export async function bridgeDesignStatus(bridgeId: string): Promise<BridgeDesignStatus[]> {
  const { user, bridge } = await ownBridge(bridgeId);
  const links = importedOf(bridge.definition) ? [] : bridgeDefinition(bridge.definition).designs;
  if (!links.length) return [];
  const designs = await db.design.findMany({ where: { orgId: user.orgId, id: { in: links.map((l) => l.id) } }, select: { id: true, kind: true, name: true, inputs: true } });
  return links.flatMap((l) => {
    const d = designs.find((x) => x.id === l.id);
    if (!d) return [];
    let ok: boolean | null = null;
    try {
      ok =
        d.kind === "lrfd-girder-check"
          ? designGirder(girderInputs(d.inputs)).ok
          : d.kind === "deck-slab"
            ? designDeck(deckInputs(d.inputs)).ok
            : d.kind === "elastomeric-bearing"
              ? designBearing(bearingInputs(d.inputs)).ok
              : d.kind === "pier-column"
                ? designColumn(columnInputs(d.inputs)).ok
                : d.kind === "strip-seal-joint"
                  ? designStripSeal(stripSealInputs(d.inputs)).ok
                  : null;
    } catch {
      ok = null;
    }
    return [{ id: d.id, target: l.target, name: d.name, ok }];
  });
}

/** The bridge's analysis written out as a Calcs worksheet, filed with the bridge's project. */
export async function createBridgeCalc(bridgeId: string): Promise<{ calcId: string }> {
  const { user, bridge } = await ownBridge(bridgeId);
  if (importedOf(bridge.definition)) throw new Error("The calc package is for bridges made with the wizard");
  const definition = bridgeDefinition(bridge.definition);
  const analysis = analyzeBridge(definition);
  if (!analysis.ok) throw new Error("The analysis isn't in equilibrium: no calc package was made");
  const live = movingLoad(analysis.generated, analysis.stage(2));
  const data = emptyCalc("USCS");
  const project = bridge.projectId ? await db.project.findUnique({ where: { id: bridge.projectId }, select: { name: true } }) : null;
  data.header = { ...data.header, title: `${bridge.name}: bridge analysis`, project: project?.name ?? "", by: user.name ?? "" };
  data.regions = layout(bridgeCalcLines(definition, analysis, live, bridge.name), { x: 0, y: 0 }, data.paper);
  const calc = await db.calc.create({ data: { orgId: user.orgId, projectId: bridge.projectId, name: `${bridge.name} analysis`, createdById: user.id } });
  const key = newCalcKey(calc.id);
  await putFile(key, gzipSync(JSON.stringify(data)), CALC_FILE);
  await db.calc.update({ where: { id: calc.id }, data: { fileKey: key, revision: 1, regionCount: data.regions.length } });
  revalidatePath("/calcs");
  return { calcId: calc.id };
}

/**
 * The bridge written as an IFC 4.3 model under its project's Models: its girders, deck, barriers,
 * diaphragms, bearings, pier caps and columns as bridge elements with their shapes and materials.
 * Exported again, the same model gets the bridge as it is now, as a new revision.
 */
export async function exportBridgeIfc(bridgeId: string): Promise<{ modelId: string; projectId: string; elements: number }> {
  const { user, bridge } = await ownBridge(bridgeId);
  if (importedOf(bridge.definition)) throw new Error("The IFC export is for bridges made with the wizard");
  if (!bridge.projectId) throw new Error("File the bridge under a project first (the project list at the top right): its 3D model goes to that project's Models");
  const project = await db.project.findFirst({ where: { id: bridge.projectId, orgId: user.orgId } });
  if (!project) throw new Error("Project not found");
  const definition = bridgeDefinition(bridge.definition);
  const elements = ifcElements(definition, analyzeBridge(definition).generated);
  // The linked designs' bars (the deck's and each pier's columns') in the elements they detail.
  const linked = async (target: string, kind: string) => {
    const link = definition.designs.find((x) => x.target === target && x.kind === kind);
    return link && isUuid(link.id) ? db.design.findFirst({ where: { id: link.id, orgId: user.orgId, kind }, select: { id: true, inputs: true } }) : null;
  };
  const deckDesign = await linked("deck", "deck-slab");
  const columnDesigns = (
    await Promise.all(definition.designs.filter((x) => /^column-\d+$/.test(x.target)).map(async (x) => ({ pier: Number(x.target.slice(7)), d: await linked(x.target, "pier-column") })))
  ).flatMap(({ pier, d }) => (d ? [{ pier, id: d.id, inputs: columnInputs(d.inputs) }] : []));
  rebarOnSpecs(elements, sectionRebarSources({ deck: deckDesign ? { id: deckDesign.id, inputs: deckInputs(deckDesign.inputs) } : null, columns: columnDesigns }));
  const existing = definition.ifcModelId ? await db.ifcModel.findFirst({ where: { id: definition.ifcModelId, projectId: project.id } }) : null;
  const id = existing?.id ?? crypto.randomUUID();
  const fileKey = newModelFileKey(id);
  let made: { summary: WorkerSummary; size: number | null };
  try {
    made = await workerBridge(fileKey, { name: bridge.name, elements, location: project.latitude !== null && project.longitude !== null ? { lat: project.latitude, lon: project.longitude, heading: 0 } : undefined });
  } catch (e) {
    throw new Error(e instanceof WorkerError ? e.message : "The IFC engine couldn't write the model");
  }
  const data = { name: bridge.name, description: `Exported from the bridge "${bridge.name}" (Bridge section).`, fileKey, fileSize: made.size, summary: made.summary as unknown as Prisma.InputJsonValue, elementCount: made.summary.elements, editedAt: new Date() };
  if (existing) {
    await db.ifcModel.update({ where: { id }, data: { ...data, revision: existing.revision + 1, backupKey: existing.fileKey, backupRevision: existing.revision } });
    await deleteFiles([existing.backupKey]).catch(() => undefined);
  } else {
    await db.ifcModel.create({ data: { id, projectId: project.id, ...data, createdById: user.id } });
    await db.bridge.update({ where: { id: bridge.id }, data: { definition: { ...definition, ifcModelId: id } as unknown as Prisma.InputJsonValue } });
  }
  revalidatePath(`/projects/${project.id}`, "layout");
  return { modelId: id, projectId: project.id, elements: made.summary.elements };
}

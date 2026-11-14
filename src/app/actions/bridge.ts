"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser, isUuid, requireUser } from "@/lib/auth/session";
import { BRIDGE_GIRDER_BASE, runBridge, spanGroups, type BridgeInputs } from "@/lib/design/bridge/bridge";
import { designBearing } from "@/lib/design/bearings/elastomeric";
import { designDeck } from "@/lib/design/decks/deck";
import { designApproachSlab } from "@/lib/design/approach/approach-slab";
import { abutmentInputs, foundationInputs, footingInputs, pileFoundationInputs, shaftInputs } from "@/lib/design/foundations/kinds";
import { runFoundation } from "@/lib/design/foundations/run";
import { designGirder, girderShape, type HarpedStrands, type StrandRow } from "@/lib/design/girders/prestressed";
import type { GirderShape } from "@/lib/design/girders/sections";
import { approachSlabInputs, bearingInputs, deckInputs, designInputs, girderInputs, stripSealInputs, wingwallInputs } from "@/lib/design/kinds";
import { designWingwall } from "@/lib/design/walls/wingwall";
import { columnInputs, designColumn } from "@/lib/design/piers/column";
import { stmInputs } from "@/lib/design/stm/strut-tie";
import { db } from "@/lib/db";
import { bridgeIfc, type BridgeComponents } from "@/lib/design/bridge/ifc";
import { runLoadPath, verdictOf, type SyncRow } from "@/lib/design/bridge/load-path.server";
import { attachRebar, rebarSources, type RebarDesigns } from "@/lib/design/bridge/ifc-rebar";
import { newModelFileKey, workerBridgeModel, WorkerError } from "@/lib/ifc/worker";
import { gzipSync } from "node:zlib";
import { redirect } from "next/navigation";
import { z } from "zod";
import { analyzeBridge } from "@/lib/bridge/bridge";
import { BRIDGE_DEFAULTS, bridgeDefinition, type BridgeDefinition, type DesignLink } from "@/lib/bridge/definition";
import { toBridgeInputs } from "@/lib/bridge/geometry";
import { LOAD_PATH_KINDS, linksFrom, withLinks } from "@/lib/bridge/load-links";
import { designPrefill, designTargets } from "@/lib/bridge/design-links";
import { importedOf } from "@/lib/bridge/imported";
import { movingLoad } from "@/lib/bridge/moving";
import { bridgeCalcLines as bridgeAnalysisLines } from "@/lib/bridge/report";
import { bridgePackageLines, bridgeQuantities } from "@/lib/design/bridge/package";
import { layout } from "@/lib/calcs/library/templates";
import { CALC_FILE, newCalcKey } from "@/lib/calcs/server";
import { emptyCalc } from "@/lib/calcs/types";
import { designStripSeal } from "@/lib/design/joints/strip-seal";
import { deleteFiles, putFile } from "@/lib/storage";

// The Bridge section: a bridge modeled once (its geometry, girders, deck and piers), analyzed, and
// designed through its linked designs down the load path (src/lib/design/bridge/load-path.server.ts),
// with its IFC 4.3 model and calc package.

export type { SyncRow };

/**
 * A bridge's IFC 4.3 description (src/lib/design/bridge/ifc.ts) from its description and the designs it links:
 * the girder check run with its girder designs, each linked design's inputs and verdict for its elements, and
 * their bars (ifc-rebar.ts).
 */
async function describeBridgeModel(orgId: string, b: BridgeInputs, name: string): Promise<{ description: ReturnType<typeof bridgeIfc>; run: ReturnType<typeof runBridge> } | { error: string }> {
  const ids = b.girderDesignIds.filter((x): x is string => !!x && isUuid(x));
  const linked = await db.design.findMany({ where: { id: { in: ids }, orgId: orgId, kind: "lrfd-girder-check" }, select: { id: true, inputs: true } });
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
  const load = async (id: string | null | undefined, kind: string) => (id && isUuid(id) ? db.design.findFirst({ where: { id, orgId: orgId, kind }, select: { id: true, inputs: true } }) : null);
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
  const description = attachRebar(bridgeIfc(b, run, comps, name), rebarSources(comps, rebar));
  return { description, run };
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
  if (LOAD_PATH_ONLY.has(target.kind) || /^girders-\d+$/.test(target.key)) {
    // The substructure: started through the load path, from the girders' reactions down (that part only).
    const r = await sectionLoadPath(user, bridge, definition, { create: true, only: new Set([target.key]), replace: target.key });
    const made = r.designs.find((l) => l.target === target.key);
    if (!made) throw new Error(r.rows.find((x) => x.key === target.key)?.verdict || "The design couldn't be started");
    return { designId: made.id, designs: r.designs };
  }
  const analysis = analyzeBridge(definition);
  const live = movingLoad(analysis.generated, analysis.stage(2));
  const prefill = designPrefill(target, definition, analysis, live);
  const name = prefill.name;
  // A girder design started under CDOT's rules takes its criteria.
  const inputs = target.kind === "lrfd-girder-check" && (await agencyOf(user.id)) === "cdot" ? { ...prefill.inputs, criteria: "cdot" } : prefill.inputs;
  const design = await db.design.create({
    data: { orgId: user.orgId, projectId: bridge.projectId, kind: target.kind, name: `${bridge.name}: ${name}`, inputs: designInputs(target.kind, inputs) as unknown as Prisma.InputJsonValue, createdById: user.id },
  });
  const designs = [...definition.designs.filter((l) => l.target !== target.key), { id: design.id, target: target.key, kind: target.kind }];
  await db.bridge.update({ where: { id: bridge.id }, data: { definition: { ...definition, designs } as unknown as Prisma.InputJsonValue } });
  revalidatePath("/design");
  return { designId: design.id, designs };
}

/** Design kinds the section starts only through the load path (they take the girders' reactions, the cap's model or the column's base forces). */
const LOAD_PATH_ONLY = new Set(["abutment", "approach-slab", "cantilever-wingwall", "stm-d-region", "spread-footing", "pile-foundation", "drilled-shaft"]);

/**
 * The load path through the bridge's designs (src/lib/design/bridge/load-path.server.ts) for a Bridge
 * section bridge: its geometry as the Bridge design's description with its links, the designs brought up
 * to date (and the missing ones made, when asked), and the links saved back. `replace`: that part gets a
 * new design (Start again).
 */
async function sectionLoadPath(user: { id: string; orgId: string }, bridge: { id: string; name: string; projectId: string | null }, definition: BridgeDefinition, o: { create: boolean; only?: Set<string>; replace?: string }) {
  const links = o.replace ? definition.designs.filter((l) => l.target !== o.replace) : definition.designs;
  const cdot = (await agencyOf(user.id)) === "cdot";
  const r = await runLoadPath({ orgId: user.orgId, userId: user.id, projectId: bridge.projectId, prefix: bridge.name, b: withLinks(toBridgeInputs(definition), links), create: o.create, only: o.only, ...(cdot ? { girderBase: { ...BRIDGE_GIRDER_BASE, criteria: "cdot" as const } } : {}) });
  const designs = linksFrom(r.b, links, LOAD_PATH_KINDS);
  await db.bridge.update({ where: { id: bridge.id }, data: { definition: { ...definition, designs } as unknown as Prisma.InputJsonValue } });
  revalidatePath("/design");
  return { rows: r.rows, designs };
}

// --- agency rules: AASHTO LRFD alone, or with CDOT's amendments (the person's setting, user.agency) ---------------------

async function agencyOf(userId: string): Promise<"cdot" | null> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { agency: true } });
  return u?.agency === "cdot" ? "cdot" : null;
}

/** The person's agency rules: null for AASHTO LRFD alone, "cdot" for CDOT's criteria (new girder designs take CDOT's amendments). */
export async function bridgeAgency(): Promise<"cdot" | null> {
  const user = await getCurrentUser();
  return user ? agencyOf(user.id) : null;
}

export async function setBridgeAgency(agency: "cdot" | null): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in");
  await db.user.update({ where: { id: user.id }, data: { agency: agency === "cdot" ? "cdot" : null } });
}

/** "Update the linked designs": every design started from the bridge brought up to date down the load path; with `create`, the missing ones made too. */
export async function updateBridgeDesigns(bridgeId: string, create: boolean): Promise<{ rows: SyncRow[]; designs: DesignLink[] }> {
  const { user, bridge } = await ownBridge(bridgeId);
  if (importedOf(bridge.definition)) throw new Error("The load path is for bridges made with the wizard");
  return sectionLoadPath(user, bridge, bridgeDefinition(bridge.definition), { create });
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
                  : d.kind === "approach-slab"
                    ? designApproachSlab(approachSlabInputs(d.inputs)).checks.every((c) => c.ok || c.advisory)
                    : d.kind === "cantilever-wingwall"
                      ? designWingwall(wingwallInputs(d.inputs)).checks.every((c) => c.ok || c.advisory)
                      : d.kind === "abutment" || d.kind === "spread-footing" || d.kind === "pile-foundation" || d.kind === "drilled-shaft"
                        ? runFoundation(d.kind, foundationInputs(d.kind, d.inputs)!).checks.every((c) => c.ok || c.advisory)
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
  data.header = { ...data.header, title: bridge.name, project: project?.name ?? "", by: user.name ?? "" };
  // The bridge's calc package (as the Bridge design wrote it: its description, plan, profile and 3D view,
  // the summary of design checks, the superstructure, each support's substructure in load-path order and
  // the summary of quantities by pay item), then this analysis model and its results.
  const pkg = await bridgePackageLines({ id: bridge.id, name: bridge.name, inputs: withLinks(toBridgeInputs(definition), definition.designs) }, user.orgId);
  const analysisLines = bridgeAnalysisLines(definition, analysis, live, `${bridge.name}: analysis model`);
  if (analysisLines.length && "text" in analysisLines[0]) analysisLines[0] = { ...analysisLines[0], newPage: true };
  data.regions = layout([...pkg, ...analysisLines], { x: 0, y: 0 }, data.paper);
  const calc = await db.calc.create({ data: { orgId: user.orgId, projectId: bridge.projectId, name: `${bridge.name} calc package`, createdById: user.id } });
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
  // The bridge as the IFC 4.3 bridge model (IfcBridge, its parts by support, the alignment, every element
  // from its linked design with its quantities and bars), as the Bridge design built it.
  const described = await describeBridgeModel(user.orgId, withLinks(toBridgeInputs(definition), definition.designs), bridge.name);
  if ("error" in described) throw new Error(described.error);
  const existing = definition.ifcModelId ? await db.ifcModel.findFirst({ where: { id: definition.ifcModelId, projectId: project.id } }) : null;
  const id = existing?.id ?? crypto.randomUUID();
  const fileKey = newModelFileKey(id);
  let made: Awaited<ReturnType<typeof workerBridgeModel>>;
  try {
    made = await workerBridgeModel(fileKey, { ...described.description, project: project.name || bridge.name, ...(project.latitude !== null && project.longitude !== null ? { location: { lat: project.latitude, lon: project.longitude, heading: 0 } } : {}) });
  } catch (e) {
    throw new Error(e instanceof WorkerError ? e.message : "The IFC engine couldn't write the model");
  }
  const data = { name: bridge.name, description: `Exported from the bridge "${bridge.name}" (Bridge section): the alignment, ${described.run.layout.spans.length} span(s) and ${described.run.layout.supports.length} supports, each element from its linked design, with quantities and bars.`, fileKey, fileSize: made.size, summary: made.summary as unknown as Prisma.InputJsonValue, elementCount: made.summary.elements, editedAt: new Date() };
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

/** The bridge's summary of quantities under the pay items, from the saved bridge and its linked designs. */
export async function bridgeQuantitiesFor(bridgeId: string): Promise<{ columns: string[]; rows: { code: string; description: string; unit: string; values: number[]; total: number }[]; missing: string[] }> {
  const { user, bridge } = await ownBridge(bridgeId);
  if (importedOf(bridge.definition)) throw new Error("Quantities are for bridges made with the wizard");
  const definition = bridgeDefinition(bridge.definition);
  return bridgeQuantities({ id: bridge.id, name: bridge.name, inputs: withLinks(toBridgeInputs(definition), definition.designs) }, user.orgId);
}

/**
 * A span's strands, from the girder design linked to its group of spans: the section, the girder's length
 * and end distance, and the span's strand rows and harped strands (a later span of the group from the
 * design's extra spans). Null when no girder design is linked.
 */
export async function girderStrandsFor(
  bridgeId: string,
  span: number, // 1-based
): Promise<{ designId: string; designName: string; spanOfDesign: number; shape: GirderShape; L: number; endDist: number; strandDia: number; strands: StrandRow[]; harped: HarpedStrands | null } | null> {
  const { user, bridge } = await ownBridge(bridgeId);
  if (importedOf(bridge.definition)) return null;
  const definition = bridgeDefinition(bridge.definition);
  const b = withLinks(toBridgeInputs(definition), definition.designs);
  const groups = spanGroups(b);
  const gi = groups.findIndex((g) => g.includes(span - 1));
  const id = gi >= 0 ? b.girderDesignIds[gi] : null;
  if (!id) return null;
  const d = await db.design.findFirst({ where: { id, orgId: user.orgId, kind: "lrfd-girder-check" }, select: { id: true, name: true, inputs: true } });
  if (!d) return null;
  const i = girderInputs(d.inputs);
  const p = groups[gi].indexOf(span - 1);
  const extra = p > 0 ? i.extraSpans?.[p - 1] : undefined;
  return {
    designId: d.id,
    designName: d.name,
    spanOfDesign: p + 1,
    shape: girderShape(i),
    L: extra?.L ?? i.L,
    endDist: i.endDist,
    strandDia: i.strandDia,
    strands: extra?.strands ?? i.strands,
    harped: extra ? (extra.harped ?? i.harped) : i.harped,
  };
}

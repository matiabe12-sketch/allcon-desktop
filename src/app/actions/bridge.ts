"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser, isUuid } from "@/lib/auth/session";
import { bridgeInputs } from "@/lib/design/bridge/kinds";
import { girderInputsFor, runBridge, spanGroups, type BridgeInputs } from "@/lib/design/bridge/bridge";
import { abutmentFromBridge, capFromBridge, changedKeys, footingFromColumn, pilesFromColumn, shaftFromColumn } from "@/lib/design/bridge/loadpath";
import { abutmentInputs, footingInputs, pileFoundationInputs, shaftInputs } from "@/lib/design/foundations/kinds";
import { runFoundation } from "@/lib/design/foundations/run";
import type { GirderInputs } from "@/lib/design/girders/prestressed";
import { designInputs, girderInputs, kindInfo } from "@/lib/design/kinds";
import { columnInputs, designColumn } from "@/lib/design/piers/column";
import { columnLinkFrom } from "@/lib/design/piers/column-link";
import { stmInputs } from "@/lib/design/stm/strut-tie";
import { db } from "@/lib/db";

// The Bridge's load path through its linked designs (docs/bridge-model.md): each linked design's
// inputs brought up to date from the Bridge, top to bottom (girders, abutments, pier caps, columns,
// foundations), the missing girder and abutment designs created when asked, and a report of what
// changed and each component's verdict.

export type SyncRow = { component: string; kind: string; designId: string | null; name: string; action: "created" | "updated" | "unchanged" | "missing" | "error"; changes: string[]; verdict: string };

async function ownBridge(bridgeId: string) {
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
  const kinds = ["lrfd-girder-check", "abutment", "stm-d-region", "pier-column", "spread-footing", "pile-foundation", "drilled-shaft"];
  const rows = await db.design.findMany({ where: { orgId: user.orgId, kind: { in: kinds } }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true, kind: true }, take: 500 });
  return Object.fromEntries(kinds.map((k) => [k, rows.filter((r) => r.kind === k).map((r) => ({ id: r.id, name: r.name }))]));
}

const verdictOf = (checks: { ok: boolean; advisory?: boolean }[]) => {
  const fail = checks.filter((c) => !c.ok && !c.advisory).length;
  return fail ? `${fail} of ${checks.filter((c) => !c.advisory).length} checks fail` : `all ${checks.filter((c) => !c.advisory).length} checks pass`;
};

export async function syncBridge(bridgeId: string, inputsNow: unknown, create: boolean): Promise<{ rows: SyncRow[]; inputs: BridgeInputs }> {
  const { user, design } = await ownBridge(bridgeId);
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
  for (const c of comps) {
    const s = b.supports[c.support];
    if (s.type.endsWith("abutment")) {
      const d = await load(c.abutmentId, "abutment");
      const before = d ? abutmentInputs(d.inputs) : abutmentInputs({});
      const next = abutmentFromBridge(b, run, c.support, before);
      const verdict = (() => {
        try {
          return verdictOf(runFoundation("abutment", next).checks);
        } catch (e) {
          return e instanceof Error ? e.message : "can't be worked out";
        }
      })();
      if (d) {
        const changes = await save(d.id, before, next);
        rows.push({ component: s.name, kind: "abutment", designId: d.id, name: d.name, action: changes.length ? "updated" : "unchanged", changes, verdict });
      } else if (create) {
        c.abutmentId = await make("abutment", `${design.name}, ${s.name}`, next);
        rows.push({ component: s.name, kind: "abutment", designId: c.abutmentId, name: `${design.name}, ${s.name}`, action: "created", changes: [], verdict });
      } else rows.push({ component: s.name, kind: "abutment", designId: null, name: "", action: "missing", changes: [], verdict });
      continue;
    }
    // A pier: its cap (strut-and-tie, from a standard pier cap), column and foundation.
    const cap = await load(c.capId, "stm-d-region");
    if (!cap) {
      rows.push({ component: `${s.name}, cap`, kind: "stm-d-region", designId: null, name: "", action: "missing", changes: [], verdict: "link a Strut-and-Tie design made from a standard pier cap" });
      continue;
    }
    const capBefore = stmInputs(cap.inputs);
    const capNext = capFromBridge(b, run, c.support, capBefore, girderIds, names);
    const capChanges = await save(cap.id, capBefore, capNext);
    rows.push({ component: `${s.name}, cap`, kind: "stm-d-region", designId: cap.id, name: cap.name, action: capChanges.length ? "updated" : "unchanged", changes: capChanges, verdict: "open it to rerun the strut-and-tie model" });
    const col = await load(c.columnId, "pier-column");
    if (!col) {
      rows.push({ component: `${s.name}, column`, kind: "pier-column", designId: null, name: "", action: "missing", changes: [], verdict: "link a Pier Column design" });
      continue;
    }
    const girders = new Map<string, GirderInputs>();
    for (let gi = 0; gi < groups.length; gi++) if (girderIds[gi]) girders.set(girderIds[gi]!, run.groups[gi].inputs);
    const colBefore = columnInputs(col.inputs);
    let colNext = colBefore;
    let colVerdict = "";
    try {
      colNext = { ...colBefore, loads: "stm", link: columnLinkFrom(cap.id, cap.name, capNext, girders) };
    } catch (e) {
      colVerdict = e instanceof Error ? e.message : "the cap's loads couldn't be read";
    }
    const colChanges = await save(col.id, colBefore, colNext);
    let colResult: ReturnType<typeof designColumn> | null = null;
    try {
      colResult = designColumn(colNext);
      colVerdict ||= verdictOf(colResult.checks);
    } catch (e) {
      colVerdict ||= e instanceof Error ? e.message : "can't be worked out";
    }
    rows.push({ component: `${s.name}, column`, kind: "pier-column", designId: col.id, name: col.name, action: colChanges.length ? "updated" : "unchanged", changes: colChanges, verdict: colVerdict });
    const kind = c.foundationKind ?? null;
    const f = kind ? await load(c.foundationId, kind) : null;
    if (!f || !kind) {
      rows.push({ component: `${s.name}, foundation`, kind: kind ?? "spread-footing", designId: null, name: "", action: "missing", changes: [], verdict: "link a footing, pile foundation or drilled shaft design" });
      continue;
    }
    if (!colResult) continue;
    const fBefore = kind === "spread-footing" ? footingInputs(f.inputs) : kind === "pile-foundation" ? pileFoundationInputs(f.inputs) : shaftInputs(f.inputs);
    const fNext = kind === "spread-footing" ? footingFromColumn(colResult, fBefore as ReturnType<typeof footingInputs>) : kind === "pile-foundation" ? pilesFromColumn(colResult, fBefore as ReturnType<typeof pileFoundationInputs>) : shaftFromColumn(colResult, fBefore as ReturnType<typeof shaftInputs>);
    const fChanges = await save(f.id, fBefore, fNext);
    let fVerdict = "";
    try {
      fVerdict = verdictOf(runFoundation(kind, fNext).checks);
    } catch (e) {
      fVerdict = e instanceof Error ? e.message : "can't be worked out";
    }
    rows.push({ component: `${s.name}, foundation`, kind, designId: f.id, name: f.name, action: fChanges.length ? "updated" : "unchanged", changes: fChanges, verdict: fVerdict });
  }

  // The Bridge keeps the links it made.
  const next: BridgeInputs = { ...b, girderDesignIds: girderIds, components: comps.map(({ support, abutmentId, capId, columnId, foundationId, foundationKind }) => ({ support, abutmentId: abutmentId ?? null, capId: capId ?? null, columnId: columnId ?? null, foundationId: foundationId ?? null, foundationKind: foundationKind ?? null })) };
  await db.design.update({ where: { id: design.id }, data: { inputs: next as unknown as Prisma.InputJsonValue } });
  revalidatePath("/design");
  return { rows, inputs: next };
}

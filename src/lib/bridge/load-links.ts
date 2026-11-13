import type { BridgeInputs } from "../design/bridge/bridge";
import type { DesignLink } from "./definition";

// The Bridge section's design links (target key → design) as the Bridge design's linked ids, which the
// load path (src/lib/design/bridge/load-path.server.ts) reads and writes, and back.
//
// Keys: girders (girders-1, … for the groups of spans past a joint), deck, and for support k bearing-k,
// abutment-k, approach-k, wingwall-k, cap-k, column-k, foundation-k. Joints (joint-k) stay the section's own.

const COMPONENT_KEYS = { bearingId: "bearing", abutmentId: "abutment", approachSlabId: "approach", wingwallId: "wingwall", capId: "cap", columnId: "column", foundationId: "foundation" } as const;
type ComponentIdKey = keyof typeof COMPONENT_KEYS;

/** The load path's parts, by the keys it reports them under. */
export const isLoadPathKey = (key: string) => /^(girders(-\d+)?|deck|(bearing|abutment|approach|wingwall|cap|column|foundation)-\d+)$/.test(key);

/** The description with the designs the bridge links filled in. */
export function withLinks(b: BridgeInputs, links: DesignLink[]): BridgeInputs {
  const id = (key: string) => links.find((l) => l.target === key)?.id ?? null;
  const groups = Math.max(1, ...links.filter((l) => /^girders(-\d+)?$/.test(l.target)).map((l) => (l.target === "girders" ? 1 : Number(l.target.slice(8)) + 1)));
  return {
    ...b,
    girderDesignIds: Array.from({ length: groups }, (_, gi) => id(gi === 0 ? "girders" : `girders-${gi}`)),
    deckDesignId: id("deck"),
    components: b.supports.map((_, k) => {
      const c: BridgeInputs["components"][number] = { support: k };
      for (const [field, prefix] of Object.entries(COMPONENT_KEYS) as [ComponentIdKey, string][]) c[field] = id(`${prefix}-${k}`);
      const f = links.find((l) => l.target === `foundation-${k}`);
      c.foundationKind = f && (f.kind === "spread-footing" || f.kind === "pile-foundation" || f.kind === "drilled-shaft") ? f.kind : null;
      return c;
    }),
  };
}

/** The links after the load path ran: its parts as it left them, the others (joints) kept. */
export function linksFrom(b: BridgeInputs, before: DesignLink[], kinds: Record<string, string>): DesignLink[] {
  const out = before.filter((l) => !isLoadPathKey(l.target));
  const add = (target: string, id: string | null | undefined, kind: string | undefined) => {
    if (id && kind) out.push({ id, target, kind });
  };
  b.girderDesignIds.forEach((id, gi) => add(gi === 0 ? "girders" : `girders-${gi}`, id, "lrfd-girder-check"));
  add("deck", b.deckDesignId, "deck-slab");
  for (const c of b.components)
    for (const [field, prefix] of Object.entries(COMPONENT_KEYS) as [ComponentIdKey, string][]) {
      const key = `${prefix}-${c.support}`;
      add(key, c[field], field === "foundationId" ? (c.foundationKind ?? undefined) : kinds[prefix]);
    }
  return out;
}

export const LOAD_PATH_KINDS: Record<string, string> = { bearing: "elastomeric-bearing", abutment: "abutment", approach: "approach-slab", wingwall: "cantilever-wingwall", cap: "stm-d-region", column: "pier-column" };

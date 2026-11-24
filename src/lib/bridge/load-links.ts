import type { BridgeInputs } from "../design/bridge/bridge";
import type { DesignLink } from "./definition";

// The Bridge section's design links (target key → design) as the Bridge design's linked ids, which the
// load path (src/lib/design/bridge/load-path.server.ts) reads and writes, and back.
//
// Keys: girders (girders-1, … for the groups of spans past a joint), deck, and for support k bearing-k,
// abutment-k, approach-k, wingwall-k, joint-k (the abutment's expansion device), cap-k, column-k, foundation-k.

const COMPONENT_KEYS = { bearingId: "bearing", abutmentId: "abutment", approachSlabId: "approach", wingwallId: "wingwall", jointId: "joint", capId: "cap", columnId: "column", foundationId: "foundation" } as const;
type ComponentIdKey = keyof typeof COMPONENT_KEYS;

/** The load path's parts, by the keys it reports them under. */
export const isLoadPathKey = (key: string) => /^(girders(-\d+)?|deck|slab|(bearing|abutment|approach|wingwall|joint|cap|column|foundation)-\d+)$/.test(key);

/** The description with the designs the bridge links filled in. */
export function withLinks(b: BridgeInputs, links: DesignLink[]): BridgeInputs {
  const id = (key: string) => links.find((l) => l.target === key)?.id ?? null;
  const groups = Math.max(1, ...links.filter((l) => /^girders(-\d+)?$/.test(l.target)).map((l) => (l.target === "girders" ? 1 : Number(l.target.slice(8)) + 1)));
  return {
    ...b,
    girderDesignIds: Array.from({ length: groups }, (_, gi) => id(gi === 0 ? "girders" : `girders-${gi}`)),
    deckDesignId: id("deck"),
    scourDesignId: id("scour"),
    slabDesignId: id("slab"),
    components: b.supports.map((_, k) => {
      const c: BridgeInputs["components"][number] = { support: k };
      for (const [field, prefix] of Object.entries(COMPONENT_KEYS) as [ComponentIdKey, string][]) c[field] = id(`${prefix}-${k}`);
      const f = links.find((l) => l.target === `foundation-${k}`);
      c.foundationKind = f && (f.kind === "spread-footing" || f.kind === "pile-foundation" || f.kind === "drilled-shaft") ? f.kind : null;
      const j = links.find((l) => l.target === `joint-${k}`);
      c.jointKind = j && (j.kind === "strip-seal-joint" || j.kind === "modular-joint" || j.kind === "finger-joint") ? j.kind : null;
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
  b.girderDesignIds.forEach((id, gi) => add(gi === 0 ? "girders" : `girders-${gi}`, id, b.shape === "steel" ? "steel-girder-check" : "lrfd-girder-check"));
  add("deck", b.deckDesignId, "deck-slab");
  add("slab", b.slabDesignId, "slab-bridge");
  for (const c of b.components)
    for (const [field, prefix] of Object.entries(COMPONENT_KEYS) as [ComponentIdKey, string][]) {
      const key = `${prefix}-${c.support}`;
      const sp = b.supports[c.support];
      const hlmr = field === "bearingId" && (sp?.bearingKind === "pot" || sp?.bearingKind === "disc") && sp.type !== "integral-abutment" && sp.type !== "continuous-pier";
      add(key, c[field], field === "foundationId" ? (c.foundationKind ?? undefined) : hlmr ? "pot-disc-bearing" : field === "jointId" && c.jointKind ? c.jointKind : kinds[prefix]);
    }
  return out;
}

export const LOAD_PATH_KINDS: Record<string, string> = { bearing: "elastomeric-bearing", abutment: "abutment", approach: "approach-slab", wingwall: "cantilever-wingwall", joint: "strip-seal-joint", cap: "stm-d-region", column: "pier-column" };

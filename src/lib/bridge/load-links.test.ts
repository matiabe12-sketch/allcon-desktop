import { describe, expect, it } from "vitest";
import { BRIDGE_DEFAULTS, supportsFor, type DesignLink } from "./definition";
import { toBridgeInputs } from "./geometry";
import { isLoadPathKey, linksFrom, LOAD_PATH_KINDS, withLinks } from "./load-links";

// The Bridge section's design links as the load path's linked ids, and back.

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const d = { ...BRIDGE_DEFAULTS, spans: [100, 120], supports: supportsFor(2) };

describe("the bridge's design links and the load path", () => {
  const links: DesignLink[] = [
    { id: id(1), target: "girders", kind: "lrfd-girder-check" },
    { id: id(2), target: "deck", kind: "deck-slab" },
    { id: id(3), target: "bearing-1", kind: "elastomeric-bearing" },
    { id: id(4), target: "cap-1", kind: "stm-d-region" },
    { id: id(5), target: "column-1", kind: "pier-column" },
    { id: id(6), target: "foundation-1", kind: "drilled-shaft" },
    { id: id(7), target: "abutment-0", kind: "abutment" },
    { id: id(8), target: "joint-2", kind: "strip-seal-joint" },
  ];

  it("hands the load path each part's design", () => {
    const b = withLinks(toBridgeInputs(d), links);
    expect(b.girderDesignIds).toEqual([id(1)]);
    expect(b.deckDesignId).toBe(id(2));
    expect(b.components[1]).toMatchObject({ bearingId: id(3), capId: id(4), columnId: id(5), foundationId: id(6), foundationKind: "drilled-shaft" });
    expect(b.components[0]).toMatchObject({ abutmentId: id(7), bearingId: null });
  });

  it("takes back what the load path made and keeps the section's own links (joints)", () => {
    const b = withLinks(toBridgeInputs(d), links);
    const after = { ...b, components: b.components.map((c) => (c.support === 2 ? { ...c, abutmentId: id(9), approachSlabId: id(10) } : c)) };
    const back = linksFrom(after, links, LOAD_PATH_KINDS);
    expect(back.find((l) => l.target === "joint-2")?.id).toBe(id(8));
    expect(back.find((l) => l.target === "abutment-2")).toEqual({ id: id(9), target: "abutment-2", kind: "abutment" });
    expect(back.find((l) => l.target === "approach-2")).toEqual({ id: id(10), target: "approach-2", kind: "approach-slab" });
    expect(back.find((l) => l.target === "foundation-1")?.kind).toBe("drilled-shaft");
    expect(back.filter((l) => isLoadPathKey(l.target))).toHaveLength(9);
  });
});

describe("what the load path reports as changed", () => {
  it("ignores the order the database keeps an object's keys in", async () => {
    const { changedKeys } = await import("../design/bridge/loadpath");
    expect(changedKeys({ girders: { back: { a: 1, b: [{ x: 1, y: 2 }] }, x0: 3 } }, { girders: { x0: 3, back: { b: [{ y: 2, x: 1 }], a: 1 } } })).toEqual([]);
    expect(changedKeys({ girders: { x0: 3 } }, { girders: { x0: 4 } })).toEqual(["girders"]);
  });
});

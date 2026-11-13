import { describe, expect, it } from "vitest";
import { bridgeLayout, type BridgeInputs } from "../design/bridge/bridge";
import { bridgeIfc } from "../design/bridge/ifc";
import { runBridge } from "../design/bridge/bridge";
import { F19AGA, F19AGA_GIRDER } from "../design/bridge/f19aga.fixture";
import { I05VA, I05VA_GIRDER } from "../design/bridge/i05va.fixture";
import { I18BC, I18BC_GIRDER } from "../design/bridge/i18bc.fixture";
import type { GirderInputs } from "../design/girders/prestressed";
import { analyzeBridge } from "./bridge";
import { definitionFromBridge } from "./from-design";
import { toBridgeInputs } from "./geometry";

// The three CDOT bridges modelled with the Bridge design, moved to the Bridge section: the section's
// description of each is the design's own (so its layout, load path, IFC model and calc package are the
// same), and the section's analysis model stands up on it.

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ENGINE: (keyof BridgeInputs)[] = ["alignment", "profile", "roadway", "supports", "shape", "nGirders", "spacing", "bridgeLineOffset", "leftEdge", "rightEdge", "barrierWidth", "deckT", "sacrificial", "slabOffset", "fcDeck", "fws"];

describe.each([
  ["I-18-BC (24610)", I18BC, I18BC_GIRDER],
  ["I-05-VA (22943)", I05VA, I05VA_GIRDER],
  ["F-19-AGA (24898)", F19AGA, F19AGA_GIRDER],
] as [string, BridgeInputs, GirderInputs][])("%s moved to the Bridge section", (_, design, girder) => {
  // As saved, with its links.
  const saved: BridgeInputs = { ...design, girderDesignIds: [id(1)], deckDesignId: id(2), components: design.supports.map((_, k) => ({ support: k, bearingId: id(10 + k), ...(k === 0 || k === design.supports.length - 1 ? { abutmentId: id(20 + k) } : { capId: id(30 + k), columnId: id(40 + k) }) })) };
  const def = definitionFromBridge(saved, girder);
  const b = toBridgeInputs(def);

  it("describes the bridge as the design does", () => {
    for (const k of ENGINE) expect(b[k], k).toEqual(design[k]);
    expect(b.rail?.type).toBe(design.rail?.type ?? "custom");
  });

  it("lays out every girder the same", () => {
    const own = bridgeLayout(design);
    const ours = bridgeLayout(b);
    own.spans.forEach((sp, j) => sp.girders.forEach((g, k) => {
      expect(ours.spans[j].girders[k].L).toBeCloseTo(g.L, 9);
      expect(ours.spans[j].girders[k].start.seat).toBeCloseTo(g.start.seat, 9);
    }));
  });

  it("keeps its linked designs", () => {
    const keys = def.designs.map((l) => l.target).sort();
    expect(keys).toContain("girders");
    expect(keys).toContain("deck");
    expect(keys).toContain("abutment-0");
    expect(def.designs.find((l) => l.target === "girders")?.id).toBe(id(1));
  });

  it("builds the same IFC model", () => {
    const run = runBridge(design, [girder]);
    expect(bridgeIfc(b, runBridge(b, [girder]), {}, "x").elements.length).toBe(bridgeIfc(design, run, {}, "x").elements.length);
  });

  it("stands up as the section's analysis model, in equilibrium", () => {
    const a = analyzeBridge(def);
    expect(a.checks.filter((c) => !c.ok).map((c) => c.name)).toEqual([]);
  });
});

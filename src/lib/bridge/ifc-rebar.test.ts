import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DECK_DEFAULTS } from "../design/decks/deck";
import { COLUMN_DEFAULTS } from "../design/piers/column";
import type { V3 as V3Like } from "../design/bridge/ifc";
import { rebarOnSpecs, sectionRebarSources, specBox, type IfcRebar } from "../design/bridge/ifc-rebar";
import { analyzeBridge } from "./bridge";
import { BRIDGE_DEFAULTS, supportsFor, type BridgeDefinition } from "./definition";
import { ifcElements } from "./solids";

// The Bridge section's IFC export with its linked deck and pier column designs: their bars in the deck and
// the columns, and every element's base quantities, written by api/ifc.py's "bridge" action (the Python half
// runs where the desktop copy's Python is, ./python).

const d: BridgeDefinition = { ...BRIDGE_DEFAULTS, spans: [110, 110], supports: supportsFor(2) };
const elements = ifcElements(d, analyzeBridge(d).generated) as (ReturnType<typeof ifcElements>[number] & { rebar?: IfcRebar })[];
rebarOnSpecs(elements, sectionRebarSources({ deck: { id: "deck-1", inputs: DECK_DEFAULTS }, columns: [{ pier: 1, id: "col-1", inputs: COLUMN_DEFAULTS }] }));
const hosts = elements.filter((e) => e.rebar?.bars.length);

const inside = (p: V3Like, e: (typeof elements)[number], tol = 0.01) => {
  const b = specBox(e)!;
  const v = [p[0] - b.c[0], p[1] - b.c[1], p[2] - b.c[2]];
  return b.ax.every((a, k) => Math.abs(v[0] * a[0] + v[1] * a[1] + v[2] * a[2]) <= b.half[k] + tol);
};

describe("the Bridge section's IFC export: bars and quantities", () => {
  it("puts the deck's bars in the deck and the pier's column bars in each of its columns", () => {
    expect(hosts.filter((h) => h.kind === "deck")).toHaveLength(1);
    const columns = elements.filter((e) => e.kind === "column");
    expect(columns.length).toBe(d.piers.columns);
    for (const c of columns) expect(c.rebar?.designId).toBe("col-1");
    // Nothing else has bars: girders are prestressed, caps and bearings have no linked design with a schedule.
    expect(hosts.every((h) => h.kind === "deck" || h.kind === "column")).toBe(true);
  });

  it("sizes the deck's bars to the deck's own length", () => {
    const deck = hosts.find((h) => h.kind === "deck")!;
    const L = 2 * specBox(deck)!.half[0];
    expect(L).toBeCloseTo(220, 0);
    for (const bar of deck.rebar!.bars) expect(bar.length / 12).toBeLessThanOrEqual(L + 1e-6);
  });

  it("lays every set's first and last bar inside its host", () => {
    for (const h of hosts)
      for (const bar of h.rebar!.bars) {
        const { origin, u, v, step, drawn } = bar.at;
        for (const i of [0, drawn - 1]) {
          const start = bar.path[bar.shape === "hooked" ? 1 : 0];
          const p: V3Like = [0, 1, 2].map((k) => origin[k] + i * step[k] + start[0] * u[k] + start[1] * v[k]) as V3Like;
          expect(inside(p, h), `${h.name} ${bar.mark}`).toBe(true);
        }
      }
  });

  const python = resolve("python/python.exe");
  it.skipIf(!existsSync(python))("writes the bars and every element's quantities (IFC 4.3, schema-valid)", () => {
    const dir = mkdtempSync(join(tmpdir(), "allcon-section-ifc-"));
    try {
      const desc = join(dir, "bridge.json");
      writeFileSync(desc, JSON.stringify({ name: "Section bridge", elements }));
      const out = execFileSync(python, ["-I", resolve("scripts/ifc-rebar-check.py"), resolve("api"), desc, join(dir, "bridge.ifc"), "section"], { encoding: "utf8", timeout: 300_000 });
      const x = JSON.parse(out.trim().split("\n").pop()!).IFC4X3;
      expect(x.errors).toEqual([]);
      expect(x.bars).toBe(hosts.reduce((s, h) => s + h.rebar!.bars.length, 0));
      expect(x.hosts).toBe(hosts.length);
      for (const k of ["unaggregated", "untyped", "withoutQto", "withoutSchedule", "withoutShape", "hostsWithoutReinforcementQto"]) expect(x[k], k).toBe(0);
      expect(x.concreteWithoutQto).toEqual([]);
      expect(x.elementsWithoutQto).toEqual([]);
      expect(x.weightKg / 0.45359237).toBeCloseTo(hosts.reduce((s, h) => s + h.rebar!.bars.reduce((t, b) => t + b.weight, 0), 0), 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300_000);
});

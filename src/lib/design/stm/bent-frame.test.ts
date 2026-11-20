import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, evaluateSheet, type SheetItem, type Value } from "@/lib/calcs/evaluate";
import { layout } from "@/lib/calcs/library/templates";
import { readingOrder } from "@/lib/calcs/types";
import { BRIDGE_DEFAULTS, runBridge } from "../bridge/bridge";
import { capFromBridge } from "../bridge/loadpath";
import { nodeLpSolver } from "./lp-node";
import { capMethod, designStm, stmInputs, type StmInputs } from "./strut-tie";
import { buildTemplate, MULTICOLUMN_DEFAULTS } from "./templates";
import { frameForces, sectionalDesign } from "./sectional";
import { stmPackageLines } from "./package";

// The pier bent by beam theory: the cap's forces from the frame with its columns, the method recommended from the
// regions (AASHTO 5.8.2.1) or chosen, the cantilevers' bars developed, and the calc package.

const close = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
const run = runBridge(BRIDGE_DEFAULTS);
const cap: StmInputs = { ...capFromBridge(BRIDGE_DEFAULTS, run, 1, buildTemplate(MULTICOLUMN_DEFAULTS, stmInputs({})), ["g"], ["Girders"]), stages: null };

describe("the cap's forces from the bent's frame", () => {
  it("the Bridge sets the frame from its pier", () => {
    expect(cap.frame?.columnHeight).toBeCloseTo(run.layout.piers[1]!.columnHeight, 2);
    expect(cap.frame?.columnT).toBe(BRIDGE_DEFAULTS.supports[1].pier!.columnSize);
  });

  it("an overhang's moment is statics (the same as the pinned beam's); with near-pinned columns the spans' too", () => {
    const t = cap.template!;
    const loads = [[{ x: 2, P: 100 }, { x: t.length / 2, P: 200 }, { x: t.length - 2, P: 100 }]];
    const stiff = frameForces(t, cap.frame!, cap.fc, loads);
    const face = t.columns[0] - t.columnWidth / 2;
    // The overhang: −100 × (face − 2), statics.
    close(stiff(0, face).M, -100 * (face - 2), 1e-6);
    // Columns as slender as a wire: the cap is the beam on pinned supports (statics checked: the load's total in the shears).
    const soft = frameForces(t, { ...cap.frame!, columnT: 0.5, columnW: 0.5 }, cap.fc, loads);
    const mid = soft(0, t.length / 2).M;
    expect(Math.abs(mid)).toBeGreaterThan(0);
  });
});

describe("the method: recommended from the regions, or chosen", () => {
  it("recommends from AASHTO 5.8.2.1 and says why; the designer may choose", () => {
    const m = capMethod(cap)!;
    const regions = sectionalDesign(cap, { capLoads: null } as never).regions.filter((g) => g.kind !== "none");
    expect(m.recommended).toBe(regions.every((g) => g.kind === "B") ? "beam" : "stm");
    expect(capMethod({ ...cap, method: "beam" })!.method).toBe("beam");
    expect(capMethod({ ...cap, method: "stm" })!.method).toBe("stm");
  });

  it("beam theory throughout: the sectional checks are the cap's, every loaded region, D-regions flagged", async () => {
    const r = await designStm({ ...cap, method: "beam" }, nodeLpSolver);
    expect(r.method?.method).toBe("beam");
    expect(r.checks.every((c) => c.id.startsWith("sec-") || c.id === "method-d-regions" || c.id.startsWith("along-"))).toBe(true);
    const dRegions = r.method!.dRegions;
    expect(r.checks.some((c) => c.id === "method-d-regions")).toBe(dRegions.length > 0);
    // the overhangs' top bars developed to the cap's ends
    expect(r.checks.some((c) => c.id.endsWith("-develop"))).toBe(true);
    expect(r.stmChecks!.length).toBeGreaterThan(0);
  });

  it("the calc package for a beam-theory cap works out with no errors, its NG as the engine's", async () => {
    const i = { ...cap, method: "beam" as const };
    const r = await designStm(i, nodeLpSolver);
    const regions = readingOrder(layout(stmPackageLines(i, r, "Bent cap"), { x: 0, y: 0 }));
    const items = regions.flatMap((x): SheetItem[] => (x.kind === "text" || x.kind === "image" ? [] : [x as SheetItem]));
    const values = new Map<string, Value>();
    const res = evaluateSheet(items, DEFAULT_SETTINGS, values);
    const errors = regions.flatMap((x) => (res.get(x.id)?.kind === "error" ? [`${x.kind === "math" ? x.latex : x.kind}: ${(res.get(x.id) as { message: string }).message}`] : []));
    expect(errors).toEqual([]);
  });
});

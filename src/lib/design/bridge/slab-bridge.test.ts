import { describe, expect, it } from "vitest";
import { BRIDGE_DEFAULTS, runBridge, type BridgeInputs } from "./bridge";
import { abutmentFromBridge, bearingFromBridge, capFromBridge } from "./loadpath";
import { abutmentInputs } from "../foundations/kinds";
import { designAbutment } from "../foundations/abutment";
import { bearingInputs } from "../kinds";
import { designBearing } from "../bearings/elastomeric";
import { buildTemplate, MULTICOLUMN_DEFAULTS } from "../stm/templates";
import { designStm, stmInputs } from "../stm/strut-tie";
import { nodeLpSolver } from "../stm/lp-node";
import { bridgeIfc } from "./ifc";

// A slab bridge in the Bridge model: the slab designed from the Bridge, its reactions on the bearing lines (at the girder
// spacing) handed to the abutments, bearings and pier caps once, and no girders in the model.

const close = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));

const slabBridge: BridgeInputs = {
  ...BRIDGE_DEFAULTS,
  superstructure: "slab",
  deckT: 21,
  nGirders: 9,
  spacing: 5,
  supports: [
    { ...BRIDGE_DEFAULTS.supports[0], station: 1030, type: "seat-abutment", bearing: "expansion" },
    { ...BRIDGE_DEFAULTS.supports[1], station: 1070, type: "continuous-pier" },
    { ...BRIDGE_DEFAULTS.supports[2], station: 1110, type: "seat-abutment", bearing: "expansion" },
  ],
};

describe("a slab bridge in the Bridge model", () => {
  const run = runBridge(slabBridge);

  it("the slab designed from the Bridge: its spans, depth, width; continuous over its continuous pier", () => {
    expect(run.groups.length).toBe(0);
    const s = run.slab!;
    expect(s.inputs.spans.length).toBe(2);
    expect(s.inputs.t).toBe(21);
    expect(s.inputs.continuous).toBe(true);
    close(s.inputs.W, slabBridge.leftEdge + slabBridge.rightEdge);
  });

  it("each support's lines carry the slab's reaction per foot times their width, the line's total the slab's", () => {
    const r = run.reactions[1] as (typeof run.reactions)[number] & { slab: { perFoot: { DC: number }; tribInt: number; tribExt: number } };
    const per = run.slab!.result.reactions[1].DC;
    close(r.slab.perFoot.DC, per);
    // two exterior lines and the rest interior make up the width
    close(2 * r.slab.tribExt + (slabBridge.nGirders - 2) * r.slab.tribInt, slabBridge.leftEdge + slabBridge.rightEdge, 1e-6);
    close(r.totals.DC, per * (slabBridge.leftEdge + slabBridge.rightEdge));
  });

  it("the abutment and its bearings take them", () => {
    const a = abutmentFromBridge(slabBridge, run, 0, abutmentInputs({ type: "seat" }));
    close(a.girderTotals!.DC, Math.round(run.reactions[0].totals.DC * 10) / 10, 1e-6);
    expect(a.girderInside).toBe(0);
    expect(designAbutment(a).checks.length).toBeGreaterThan(0);
    const bi = bearingFromBridge(slabBridge, run, 0, bearingInputs({}), a);
    close(bi.DL, Math.round((run.reactions[0].DC + run.reactions[0].DW) * 10) / 10, 1e-6);
    expect(designBearing(bi).checks.length).toBeGreaterThan(0);
  });

  it("the pier cap takes the slab's lines from both sides, half each, and no wet diaphragm stage", async () => {
    const cap = capFromBridge(slabBridge, run, 1, buildTemplate(MULTICOLUMN_DEFAULTS, stmInputs({})), [], [], "slab-id", "Slab");
    expect(cap.stages?.enabled ?? false).toBe(false);
    const back = cap.girders!.back!;
    const r = run.reactions[1] as (typeof run.reactions)[number] & { slab: { perFoot: { DC: number }; tribInt: number } };
    close(back.dc.interior, (r.slab.perFoot.DC * r.slab.tribInt) / 2);
    const res = await designStm(cap, nodeLpSolver);
    const dcTotal = res.capLoads!.bearingLoads.reduce((t, b) => t + b.dc, 0);
    close(dcTotal, r.totals.DC, 1e-6);
  });

  it("the 3D model has the slab and its bearings, no girders", () => {
    const m = bridgeIfc(slabBridge, run);
    expect(m.elements.some((e) => e.cls === "IfcBeam" && e.type === "GIRDER_SEGMENT")).toBe(false);
    expect(m.elements.some((e) => e.cls === "IfcSlab")).toBe(true);
    expect(m.elements.filter((e) => e.cls === "IfcBearing").length).toBe(2 * 2 * slabBridge.nGirders);
  });
});

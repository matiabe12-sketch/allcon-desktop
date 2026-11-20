import { describe, expect, it } from "vitest";
import { BEARING_DEFAULTS } from "../bearings/elastomeric";
import { brakingPerLane } from "../girders/substructure-loads";
import { BRIDGE_DEFAULTS, runBridge, type BridgeInputs } from "./bridge";
import { capLoadCases, girderSide } from "../stm/cap-loads";
import { abutmentFromBridge, defaultStiffness, designLanes, girdersInside, longitudinalShares, multiplePresence, padLineStiffness, thermalReactions, type LongStiffness } from "./loadpath";
import { abutmentInputs } from "../foundations/kinds";

// The load path counts each load once (docs/bridge-model.md, "Loads counted once").

const close = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
const run = runBridge(BRIDGE_DEFAULTS);

describe("the bridge's longitudinal forces, shared once", () => {
  const unitBR = (b: BridgeInputs, L: number) => Math.max(...Array.from({ length: designLanes(b) }, (_, m) => (m + 1) * multiplePresence(m + 1) * brakingPerLane(L).perLane));

  it("a unit's braking is shared by stiffness and adds up to the unit's force, never more", () => {
    const k: LongStiffness[] = [{ kSub: 300, kBear: Infinity }, { kSub: 100, kBear: Infinity }, { kSub: 600, kBear: Infinity }];
    const sh = longitudinalShares(BRIDGE_DEFAULTS, k);
    const L = BRIDGE_DEFAULTS.supports[2].station - BRIDGE_DEFAULTS.supports[0].station;
    const BR = unitBR(BRIDGE_DEFAULTS, L);
    close(sh.reduce((t, s) => t + s.braking, 0), BR);
    close(sh[1].braking, (BR * 100) / 1000);
  });

  it("rigid supports take it alone, equally; pads in series with a column soften it", () => {
    const sh = longitudinalShares(BRIDGE_DEFAULTS, [{ kSub: Infinity, kBear: Infinity }, { kSub: 100, kBear: 50 }, { kSub: Infinity, kBear: Infinity }]);
    expect(sh[1].braking).toBe(0);
    close(sh[0].braking, sh[2].braking);
    const soft = longitudinalShares(BRIDGE_DEFAULTS, [{ kSub: Infinity, kBear: 100 }, { kSub: 100, kBear: 100 }, { kSub: Infinity, kBear: 100 }]);
    close(soft[1].k, 50); // 1 / (1/100 + 1/100)
  });

  it("a simple pier's joint splits the bridge into units; the pier takes from both", () => {
    const b: BridgeInputs = { ...BRIDGE_DEFAULTS, supports: BRIDGE_DEFAULTS.supports.map((s, j) => (j === 1 ? { ...s, type: "simple-pier" as const } : s)) };
    const k: LongStiffness[] = b.supports.map(() => ({ kSub: 100, kBear: Infinity }));
    const sh = longitudinalShares(b, k);
    expect(sh[1].units.length).toBe(2);
    const L1 = b.supports[1].station - b.supports[0].station;
    const L2 = b.supports[2].station - b.supports[1].station;
    close(sh.reduce((t, s) => t + s.braking, 0), unitBR(b, L1) + unitBR(b, L2));
  });

  it("the abutments of the default bridge no longer each take half on top of the pier's share", () => {
    const sh = longitudinalShares(BRIDGE_DEFAULTS, defaultStiffness(BRIDGE_DEFAULTS, run, BEARING_DEFAULTS));
    const total = [0, 1, 2].reduce((t, j) => t + sh[j].braking, 0);
    const L = BRIDGE_DEFAULTS.supports[2].station - BRIDGE_DEFAULTS.supports[0].station;
    close(total, unitBR(BRIDGE_DEFAULTS, L));
    const a = abutmentFromBridge(BRIDGE_DEFAULTS, run, 0, abutmentInputs({}));
    close(a.braking, Math.round(sh[0].braking * 10) / 10, 1e-6);
  });

  it("an elastomeric line's stiffness is every girder's G A / hrt", () => {
    const p = BEARING_DEFAULTS;
    const hrt = p.n * p.hri + 2 * p.hre;
    close(padLineStiffness({ ...p, pad: "steel", covers: 2 }, 6), (6 * p.G * p.L * p.W) / hrt);
  });

  it("temperature: a fixed support holds the other bearings' forces, those either side of the fixed point balancing", () => {
    const b: BridgeInputs = { ...BRIDGE_DEFAULTS, supports: BRIDGE_DEFAULTS.supports.map((s, j) => ({ ...s, type: j === 1 ? ("continuous-pier" as const) : ("seat-abutment" as const), bearing: j === 1 ? ("fixed" as const) : ("expansion" as const) })) };
    const k: LongStiffness[] = [{ kSub: Infinity, kBear: 100 }, { kSub: 50, kBear: Infinity }, { kSub: Infinity, kBear: 100 }];
    const out = thermalReactions(b, k, [10, 0, 14]);
    expect(out[0]).toBe(10);
    expect(out[2]).toBe(14);
    close(out[1], 4); // 14 one way, 10 the other
  });
});

describe("self-weight counted once", () => {
  it("the abutment takes the line of girders (two exterior, the rest interior), not n × the larger", () => {
    const r = run.reactions[0];
    const n = BRIDGE_DEFAULTS.nGirders;
    const side = r.sides[0];
    close(r.totals.DC, 2 * side.exterior.DC + (n - 2) * side.interior.DC);
    expect(r.totals.DC).toBeLessThanOrEqual(n * r.DC + 1e-9);
    const a = abutmentFromBridge(BRIDGE_DEFAULTS, run, 0, abutmentInputs({}));
    close(a.girderTotals!.DC, Math.round(r.totals.DC * 10) / 10, 1e-6);
  });

  it("an integral cap's solid weight doesn't count the girders' ends and the deck inside it again", () => {
    const a = abutmentFromBridge(BRIDGE_DEFAULTS, run, 0, abutmentInputs({ type: "integral-piles" }));
    const s = BRIDGE_DEFAULTS.supports[0];
    const sd = run.groups[0].result.spans[0];
    const half = Math.max(0, a.capWidth / 2 - s.bearingOffset);
    const one = (line: typeof sd.interior) => line.loads.wg * (s.endDistance + half) + line.loads.wDeck * half;
    close(girdersInside(BRIDGE_DEFAULTS, run, 0, a.capWidth), 2 * one(sd.exterior) + (BRIDGE_DEFAULTS.nGirders - 2) * one(sd.interior));
    close(a.girderInside!, Math.round(girdersInside(BRIDGE_DEFAULTS, run, 0, a.capWidth) * 10) / 10, 1e-6);
  });

  it("a pier diaphragm's weight comes off at each bearing by what the girders already carry inside it", () => {
    const g = run.groups[0];
    const back = girderSide(g.inputs, 0, "x", "G", "end");
    const ahead = girderSide(g.inputs, 1, "x", "G", "start");
    expect(back.inDiaphragm!.wg).toBeGreaterThan(0);
    const nodes = [{ label: "A", x: 0, y: 0 }, { label: "B", x: 46, y: 0 }];
    const outline: [number, number][] = [[0, 0], [46, 0], [46, 5], [0, 5]];
    const link = { enabled: true, back, ahead, x0: 23, reverse: false, loadNodes: ["A", "B"], selfWeight: true, soffit: 0, wc: 0.15, bearingOffset: 1 };
    const plain = capLoadCases({ ...link }, nodes, outline, 48, 23);
    const done = capLoadCases({ ...link, stage: "completed" as const }, nodes, outline, 48, 23);
    const a = 48 / 24 - 1;
    const per = (s: typeof back, ext: boolean) => s.inDiaphragm!.wg * (s.inDiaphragm!.endDist + a) + (ext ? s.inDiaphragm!.wDeck.exterior : s.inDiaphragm!.wDeck.interior) * a;
    const n = back.n;
    const off = [back, ahead].reduce((t, s) => t + 2 * per(s, true) + (n - 2) * per(s, false), 0);
    close(plain.selfWeight - done.selfWeight, off, 1e-6);
  });
});

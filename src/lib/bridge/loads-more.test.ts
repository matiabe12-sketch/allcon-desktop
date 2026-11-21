import { describe, expect, it } from "vitest";
import { analyzeBridge, combinationsFor } from "./bridge";
import { BRIDGE_DEFAULTS, bridgeDefinition, supportsFor } from "./definition";
import { emptyModel, type Model } from "./model";
import { FATIGUE_SETS, Grid, laneEffect, movingLoad, PERMIT_SETS } from "./moving";
import { analyze } from "./solver";

// The analysis model's added loads (step 5 of the remaining checks): uniform temperature, wind on the structure and
// on the live load, the fatigue truck, CDOT's Strength II vehicles, live load deflection, and Table 3.4.1-1's other
// combinations.

describe("uniform temperature (3.12.2)", () => {
  it("a bar held at both ends: N = E·A·α·ΔT in compression on a rise; free at one end, nothing", () => {
    const m: Model = emptyModel();
    m.materials.push({ id: 1, name: "C", E: 576000, G: 240000, density: 0, alpha: 6e-6 });
    m.sections.push({ id: 1, name: "S", A: 5, Asy: 0, Asz: 0, J: 1, Iy: 3, Iz: 1 });
    m.nodes.push({ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 50, y: 0, z: 0 }, { id: 3, x: 100, y: 0, z: 0 });
    m.elements.push({ id: 1, type: "beam", mat: 1, sec: 1, n1: 1, n2: 2 }, { id: 2, type: "beam", mat: 1, sec: 1, n1: 2, n2: 3 });
    const all = [true, true, true, true, true, true] as [boolean, boolean, boolean, boolean, boolean, boolean];
    m.supports.push({ node: 1, fixed: all }, { node: 3, fixed: all });
    m.loadCases.push({ name: "T", type: "TU" });
    m.loads.push({ case: "T", kind: "thermal", element: 1, dT: 45 }, { case: "T", kind: "thermal", element: 2, dT: 45 });
    const a = analyze(m);
    const N = a.forcesAt(0, 0, 0.5).N;
    expect(N).toBeCloseTo(-576000 * 5 * 6e-6 * 45, 6); // compression −
    const free: Model = { ...m, supports: [{ node: 1, fixed: all }, { node: 3, fixed: [false, true, true, true, true, true] }] };
    expect(analyze(free).forcesAt(0, 0, 0.5).N).toBeCloseTo(0, 6);
  });
  it("the bridge: rise and fall are alternatives; with one fixed line the girders aren't strained", () => {
    const d = bridgeDefinition({ ...BRIDGE_DEFAULTS, spans: [100] });
    const a = analyzeBridge(d);
    const m = a.generated.members.find((x) => x.id === "G3-S1")!;
    const rise = a.member(m, { kind: "case", name: "Temperature rise" }, 1);
    expect(Math.max(...rise.map((s) => Math.abs(s.forces.N)))).toBeLessThan(1e-3);
    const both = analyzeBridge(bridgeDefinition({ ...d, supports: [{ bearing: "fixed" }, { bearing: "fixed" }] }));
    const N = both.member(m, { kind: "case", name: "Temperature rise" }, 1)[0].forces.N;
    expect(N).toBeLessThan(-100); // restrained: compression on a rise
    expect(a.cases.filter((c) => c.group === "TU").map((c) => c.name)).toEqual(["Temperature rise", "Temperature fall"]);
  });
});

describe("wind (3.8.1.2, 3.8.1.3, 3.8.2)", () => {
  const d = bridgeDefinition({ ...BRIDGE_DEFAULTS, spans: [90, 110], supports: supportsFor(2) });
  const a = analyzeBridge(d);
  it("Kz, the pressures and the other combinations' scale by hand", () => {
    const w = a.generated.wind;
    const Kz = (2.5 * Math.log(33 / 0.0984) + 7.35) ** 2 / 478.4;
    expect(w.Kz).toBeCloseTo(Kz, 9);
    expect(Kz).toBeCloseTo(1.0, 1); // Table C3.8.1.2.1-1: 1.00 at 33 ft, exposure C
    expect(w.Pz).toBeCloseTo(2.56e-6 * 115 ** 2 * Kz * 1.3, 9);
    expect(w.PzSub).toBeCloseTo(2.56e-6 * 115 ** 2 * Kz * 1.6, 9);
    expect(w.scale.strengthV * w.Pz).toBeCloseTo(0.0164 * 1.3, 3); // Table C3.8.1.2.1-2: 0.0163 CD
    expect(w.scale.serviceI * w.Pz).toBeCloseTo(0.0125 * 1.3, 3);
  });
  it("every lateral load reaches the supports", () => {
    for (const name of ["Wind on the structure", "Wind on live load"]) {
      const lateral = a.reactions({ kind: "case", name }).reduce((s, r) => s + r.R[1], 0);
      const ref = a.cases.find((c) => c.name === name)!;
      const applied = a.stage(2).model.loads.filter((l) => l.case === name && l.kind === "uniform").reduce((s, l) => {
        if (l.kind !== "uniform") return s;
        const k = a.stage(2).model.elements.findIndex((e) => e.id === l.element);
        return s + l.w * a.stage(2).lengthOf(k);
      }, 0);
      expect(ref.signed).toBe(true);
      expect(lateral).toBeCloseTo(-applied, 3);
    }
    const up = a.checks.find((c) => c.name === "Wind up")!;
    const width = d.nGirders > 1 ? (d.nGirders - 1) * d.spacing + 2 * d.overhang : 0;
    expect(-up.applied).toBeCloseTo(0.02 * width * 200, 3); // 0.020 ksf on the deck's width, 200 ft
  });
  it("the combinations: wind scaled to each one's speed, the vehicles, Table 3.4.1-1's factors", () => {
    const c = combinationsFor(a.generated.wind.scale);
    const by = (n: string) => c.find((x) => x.name === n)!;
    expect(by("Strength III").factors.WS).toBe(1);
    expect(by("Strength V").factors.WS).toBeCloseTo(a.generated.wind.scale.strengthV, 3);
    expect(by("Strength V").factors.LL).toBe(1.35);
    expect(by("Strength V").factors.WL).toBe(1);
    expect(by("Service I").factors.WS).toBeCloseTo(a.generated.wind.scale.serviceI, 3);
    expect(by("Strength II").vehicle).toBe("permit");
    expect(by("Strength II").factors.LL).toBe(1.35);
    expect(by("Fatigue I").factors.LL).toBe(1.75);
    expect(by("Fatigue II").factors.LL).toBe(0.8);
    expect(by("Strength I").factors.TU).toBe(0.5);
    expect(a.vehicleOf({ kind: "combination", name: "Fatigue I" })).toBe("fatigue");
  });
  it("Strength III's envelope holds the wind from either side", () => {
    const m = a.generated.members.find((x) => x.id === "G1-S1")!;
    const st = a.member(m, { kind: "combination", name: "Strength III" }, 2);
    const mid = st[Math.floor(st.length / 2)];
    // The two sides differ by twice the lateral case (the vertical wind rides with both).
    const ws = a.member(m, { kind: "case", name: "Wind on the structure" }, 2)[Math.floor(st.length / 2)].forces.Mz;
    expect(mid.max!.Mz - mid.min!.Mz).toBeCloseTo(2 * Math.abs(ws), 6);
  });
});

describe("the fatigue truck and the permit vehicles", () => {
  it("the fatigue truck on a 100 ft simple span's midspan moment, against a brute-force search", () => {
    const L = 100;
    const xs = Array.from({ length: 201 }, (_, k) => k * 0.5);
    const grid = new Grid(xs);
    const eta = new Float32Array(xs.map((x) => (x <= L / 2 ? x / 2 : (L - x) / 2)));
    const p = laneEffect(grid, eta, 0, 1, 0, false, FATIGUE_SETS, 0);
    let best = 0;
    for (let x = -50; x <= 150; x += 0.25)
      for (const dir of [1, -1]) {
        const v = [8, 32, 32].reduce((s, P, k) => {
          const at = x - dir * [0, 14, 44][k];
          return s + (at >= 0 && at <= L ? P * (at <= L / 2 ? at / 2 : (L - at) / 2) : 0);
        }, 0);
        best = Math.max(best, v);
      }
    expect(p.value).toBeCloseTo(best, 3);
    expect(p.lane).toBe(0);
  });
  it("the permit vehicles are CDOT's CO Permit and EV3 at twice their wheel lines", () => {
    expect(PERMIT_SETS).toHaveLength(2);
    expect(PERMIT_SETS[0].reduce((s, a) => s + a.P, 0)).toBeCloseTo(2 * (13.5 + 4 * 12.5 + 3 * 10.84), 6);
  });
  it("on the bridge: the fatigue run is one lane at 15% and below HL-93; deflection within L/800 on the defaults", () => {
    const a = analyzeBridge(bridgeDefinition({ ...BRIDGE_DEFAULTS, spans: [100] }));
    const hl = movingLoad(a.generated, a.stage(2));
    const fat = movingLoad(a.generated, a.stage(2), { vehicle: "fatigue" });
    expect(fat.vehicle).toBe("fatigue");
    expect(fat.IM).toBe(0.15);
    const m = a.generated.members.find((x) => x.id === "G3-S1")!;
    const mid = (live: typeof hl) => {
      const st = a.member(m, { kind: "live" }, 1, live);
      return Math.max(...st.map((s) => s.max!.My));
    };
    expect(mid(fat)).toBeLessThan(mid(hl));
    expect(mid(fat)).toBeGreaterThan(0.2 * mid(hl));
    const dl = a.liveDeflections(hl);
    expect(dl).toHaveLength(1);
    expect(dl[0].delta).toBeGreaterThan(0);
    expect(dl[0].delta).toBeLessThan(dl[0].limit);
  });
});

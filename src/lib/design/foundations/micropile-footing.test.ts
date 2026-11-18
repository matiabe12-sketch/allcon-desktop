import { describe, expect, it } from "vitest";
import { ABUTMENT_DEFAULTS, designAbutment } from "./abutment";
import { abutmentTakeoff, pileTakeoff } from "./detail";
import { abutmentInputs, pileFoundationInputs } from "./kinds";
import { designMicropile, MICROPILE_DEFAULTS } from "./micropile";
import { designPiles, PILE_DEFAULTS } from "./piles";

// D-11-Z's foundations: the pier footing (9.5 x 7 x 3 ft cap on a ring of ten 10 in micropiles, 25 ft) and the
// integral abutment on two rows of micropiles (CDOT 26956 micropile array calc).
const mp = { holeD: 10, casingOD: 9.625, casingT: 0.545, cased: 0, bond: 25, alphaB: 6.2 / ((Math.PI * 10) / 12), phiBond: 0.55, embed: 12 };

describe("a pier footing on micropiles", () => {
  const i = pileFoundationInputs({ ...PILE_DEFAULTS, pileType: "micropile", perimeter: true, micropile: mp, nB: 4, nL: 3, sB: 2.5, sL: 2.5, edge: 1, capT: 36, colB: 108, colL: 36, colShape: "rectangular" });
  it("keeps its micropile settings through saving", () => {
    expect(i.pileType).toBe("micropile");
    expect(i.perimeter).toBe(true);
    expect(i.micropile?.holeD).toBe(10);
  });
  it("a ring of 10 under a 9.5 × 7 ft cap; each micropile by the Micropile design, the cap's own checks too", () => {
    const r = designPiles(i);
    expect(r.n).toBe(10);
    expect(r.capB).toBeCloseTo(9.5, 6);
    expect(r.capL).toBeCloseTo(7, 6);
    const ids = r.checks.map((c) => c.id);
    expect(ids).toContain("mp-bond-comp");
    expect(ids).toContain("cap-punch-col");
    expect(ids).not.toContain("geo-axial");
    // 6.2 k/ft nominal over 25 ft, φ 0.55.
    expect(r.checks.find((c) => c.id === "mp-bond-comp")!.capacity).toBeCloseTo(0.55 * 6.2 * 25, 1);
  });
  it("its quantities: 10 micropiles × 25 ft under Item 503", () => {
    const t = pileTakeoff(i);
    expect(t.quantities.micropile?.value).toBeCloseTo(250, 6);
    expect(t.quantities.pile).toBeUndefined();
  });
});

describe("an integral abutment on two rows of micropiles", () => {
  const i = abutmentInputs({ ...ABUTMENT_DEFAULTS, type: "integral-micropiles", nPiles: 12, mpRows: 2, mpRowSpacing: 5, mpBatterFront: 0, mpBatterBack: 6, groupMoment: 6125, micropile: mp, length: 47, capWidth: 8, capDepth: 3.5 });
  it("the group's forces across its two rows, the second battered, and each micropile checked", () => {
    const r = designAbutment(i);
    const bond = r.checks.find((c) => c.id === "mp-bond-comp")!;
    expect(r.integral).toBeTruthy();
    // The most loaded pile carries the group's share plus the 6125 kip·ft moment across the two rows 5 ft apart (Σy² = 150 ft²).
    expect(bond.demand).toBeGreaterThan((6125 * 2.5) / 150);
    expect(bond.capacity).toBeCloseTo(0.55 * 6.2 * 25, 1);
    expect(r.checks.some((c) => c.id === "mp-movement")).toBe(true);
    expect(r.checks.some((c) => c.id === "pile-length")).toBe(true);
  });
  it("its quantities: 24 micropiles × 25 ft", () => {
    expect(abutmentTakeoff(i).quantities.micropile?.value).toBeCloseTo(24 * 25, 6);
  });
});

describe("micropiles: corrosion, the group's p-multipliers, the bar's development, embankment (AASHTO 10.9, CDOT BDM 10.5.1.4)", () => {
  const base = { ...MICROPILE_DEFAULTS };
  it("aggressive ground takes 0.001 in/yr × 75 yr off the casing's outside", () => {
    const a = designMicropile(base);
    const b = designMicropile({ ...base, aggressive: true });
    expect(b.loss).toBeCloseTo(0.075, 6);
    const ID = base.casingOD - 2 * base.casingT;
    expect(b.Ac).toBeCloseTo((Math.PI / 4) * ((base.casingOD - 0.15) ** 2 - ID ** 2), 6);
    expect(b.RnCC).toBeLessThan(a.RnCC);
    expect(b.Mp).toBeLessThan(a.Mp);
    // A coating counted for 30 years: corrosion over the last 45.
    expect(designMicropile({ ...base, aggressive: true, coatingLife: 30 }).loss).toBeCloseTo(0.045, 6);
    expect(b.notes.some((n) => n.includes("BDM 10.5.1.4"))).toBe(true);
  });
  it("in a group the lead row's moment, pushed to the group's deflection, is larger than a lone pile's", () => {
    const lone = designMicropile(base);
    const grp = designMicropile({ ...base, groupPm: { avg: 0.5, lead: 0.8 } });
    const m = (r: ReturnType<typeof designMicropile>) => Math.max(...r.comb.map((c) => c.r.Mmax));
    expect(m(grp)).toBeGreaterThan(m(lone));
  });
  it("the bar developed within the bond length: 2.4·db·fy/√f'c·λrc·λer (AASHTO 5.10.8.2.1)", () => {
    const r = designMicropile(base);
    const ch = r.checks.find((c) => c.id === "bar-dev")!;
    expect(ch).toBeDefined();
    // Tension: 60 kip on a #20 (λrc = 2.5/4); compression: 230 kip against 0.75·Rnu, the larger of 0.63·db·fy/√f'c and 0.3·db·fy.
    const needT = Math.max(12, ((2.4 * 2.5 * 75) / Math.sqrt(5)) * (2.5 / 4) * (60 / (0.8 * r.RnTU)));
    const needC = Math.max(8, Math.max((0.63 * 2.5 * 75) / Math.sqrt(5), 0.3 * 2.5 * 75) * (230 / (0.75 * r.RnCU)));
    expect(ch.demand * 12).toBeCloseTo(Math.max(needT, needC), 6);
    expect(ch.demand * 12).toBeCloseTo(36.2, 0);
    expect(ch.capacity).toBe(base.bond);
  });
  it("through embankment: 10 ft into original ground, or less bonded in rock", () => {
    const soil = designMicropile({ ...base, bondGround: "dense-sand", fill: 50, alphaB: 4 });
    expect(soil.checks.find((c) => c.id === "fill")!.ok).toBe(false);
    const rock = designMicropile({ ...base, fill: 40 });
    expect(rock.checks.find((c) => c.id === "fill")!.ok).toBe(true);
  });
  it("the group in net uplift: φ 0.50 on the piles' bond (AASHTO 10.7.3.11)", () => {
    const i = pileFoundationInputs({ ...PILE_DEFAULTS, pileType: "micropile", micropile: mp, nB: 2, nL: 2, sB: 3, sL: 3, edge: 1.25, capT: 36, cases: [{ name: "Strength III", limit: "strength", P: -400, MB: 0, ML: 0, HB: 5, HL: 0 }] });
    const r = designPiles(i);
    const ch = r.checks.find((c) => c.id === "group-uplift")!;
    expect(ch).toBeDefined();
    expect(ch.capacity).toBeCloseTo(0.5 * 4 * 6.2 * 25, 1);
    expect(r.micropileGroup?.d).toBe("B");
  });
});

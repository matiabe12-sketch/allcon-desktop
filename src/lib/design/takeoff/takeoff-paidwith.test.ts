import { describe, expect, it } from "vitest";
import { abutmentInputs } from "../foundations/kinds";
import type { AbutmentInputs } from "../foundations/abutment";
import { soqRows } from "../bridge/calc";
import { takeoffFor, takeoffPayLines } from ".";

describe("a semi-integral abutment's end diaphragm in a bridge's summary of quantities", () => {
  const a = { ...abutmentInputs({}), type: "semi-integral", length: 60, stemT: 4, stemH: 10, backwallT: 4, backwallH: 7.5 } as AbutmentInputs;
  const t = takeoffFor("abutment", a)!;
  it("is its own concrete item, paid with the superstructure; the stem stays with the abutment", () => {
    const dia = t.schedule.concrete.find((c) => c.label === "End diaphragm")!;
    expect(dia.paidWith).toBe("superstructure");
    expect(dia.cy).toBeCloseTo((60 * 4 * 7.5) / 27, 6);
    expect(t.schedule.concrete.find((c) => c.label === "Stem")!.paidWith).toBeUndefined();
  });
  it("splits only for the bridge: the design's own lines keep it", () => {
    const own = takeoffPayLines("abutment", t, {}, a);
    const split = takeoffPayLines("abutment", t, {}, a, { split: true });
    const sum = (ls: typeof own, code: string) => ls.filter((l) => l.code === code).reduce((s, l) => s + l.quantity, 0);
    expect(own.some((l) => l.paidWith)).toBe(false);
    expect(sum(split, "601-03056")).toBeCloseTo(sum(own, "601-03056"), 0);
    expect(sum(split, "602-00020")).toBeCloseTo(sum(own, "602-00020"), -1);
    expect(split.filter((l) => l.paidWith === "superstructure").map((l) => l.code).sort()).toEqual(["601-03056", "602-00020"]);
    // The summary puts those lines under the superstructure.
    const rows = soqRows([{ label: "Superstructure", lines: [] }, { label: "Abutment 1", lines: split }]);
    const df = rows.find((r) => r.code === "601-03056")!;
    expect(df.values[0]).toBeCloseTo((60 * 4 * 7.5) / 27, 0);
    expect(df.values[1]).toBeCloseTo((60 * 4 * 10) / 27, 0);
  });
});

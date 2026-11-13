import { describe, expect, it } from "vitest";
import { bridgeLayout } from "./bridge";
import { I18BC, I18BC_SEATS } from "./i18bc.fixture";

// CDOT 24610, I-18-BC: the Bridge laid out as the sealed calcs lay it out.

describe("I-18-BC (24610 Airport Rd over Powers Blvd, WB): the layout", () => {
  const lay = bridgeLayout(I18BC);
  const seats = (span: number, end: "start" | "end") => lay.spans[span].girders.map((g) => g[end].seat);

  it("the girders at the sealed calc's offsets: 10.8 ft apart from −30.25 to +23.75 ft", () => {
    expect(lay.offsets.map((o) => Math.round(o * 100) / 100)).toEqual([-30.25, -19.45, -8.65, 2.15, 12.95, 23.75]);
    expect(lay.overhang).toBeCloseTo(3.75, 9);
  });

  for (const [name, span, end, want] of [
    ["Abutment 1", 0, "start", I18BC_SEATS.abut1],
    ["Pier 2, back", 0, "end", I18BC_SEATS.pier2Back],
    ["Pier 2, ahead", 1, "start", I18BC_SEATS.pier2Ahead],
    ["Abutment 3", 1, "end", I18BC_SEATS.abut3],
  ] as const) {
    it(`bearing seat elevations at ${name} within 0.01 ft of the sealed calc's`, () => {
      const got = seats(span, end);
      got.forEach((v, k) => expect(Math.abs(v - want[k])).toBeLessThanOrEqual(0.01));
    });
  }
});

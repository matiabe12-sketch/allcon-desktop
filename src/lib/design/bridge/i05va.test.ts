import { describe, expect, it } from "vitest";
import { bridgeLayout, runBridge } from "./bridge";
import { I05VA, I05VA_GIRDER, I05VA_SEATS } from "./i05va.fixture";

// CDOT 22943, I-05-VA: the Bridge laid out as the independent design check lays it out.

describe("I-05-VA (22943 SH 92 over the Gunnison River): the layout and girders", () => {
  const lay = bridgeLayout(I05VA);
  const seats = (span: number, end: "start" | "end") => lay.spans[span].girders.map((g) => g[end].seat);

  it("six girders at 8 ft, 3.5 ft overhangs", () => {
    expect(lay.offsets).toEqual([-20, -12, -4, 4, 12, 20]);
    expect(lay.overhang).toBeCloseTo(3.5, 9);
  });

  // At the piers the IDC takes the seat at the pier's centerline; the bearings are 1 ft either side (the grade there, under 0.4 %, is within the tolerance).
  for (const [name, span, end, want] of [
    ["Abutment 1", 0, "start", I05VA_SEATS.abut1],
    ["Pier 2, back", 0, "end", I05VA_SEATS.pier2],
    ["Pier 2, ahead", 1, "start", I05VA_SEATS.pier2],
    ["Pier 3, back", 1, "end", I05VA_SEATS.pier3],
    ["Pier 3, ahead", 2, "start", I05VA_SEATS.pier3],
    ["Abutment 4", 2, "end", I05VA_SEATS.abut4],
  ] as const) {
    it(`bearing seat elevations at ${name} within 0.01 ft of the IDC's`, () => {
      seats(span, end).forEach((v, k) => expect(Math.abs(v - want[k])).toBeLessThanOrEqual(0.01));
    });
  }

  it("spans 110 ft and 139 ft bearing to bearing, as the IDC's girder runs", () => {
    expect(lay.spans.map((s) => Math.round(s.L * 100) / 100)).toEqual([110, 139, 110]);
  });

  it("runs the girders, three continuous spans in one design", () => {
    const r = runBridge(I05VA, [I05VA_GIRDER]);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].result.spans).toHaveLength(3);
  });
});

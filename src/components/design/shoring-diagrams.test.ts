import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DetailSketch } from "./detail-sketch";
import { Diagrams } from "./shoring-diagrams";
import { schedule } from "@/lib/design/rebar/schedule";
import { shoringViews } from "@/lib/design/shoring/detail";
import { designShoring, SHORING_DEFAULTS } from "@/lib/design/shoring/wall";

describe("soldier pile wall drawings", () => {
  for (const i of [SHORING_DEFAULTS, { ...SHORING_DEFAULTS, wall: "sheet" as const, support: "anchored" as const, H: 20, D: 10 }]) {
    it(`draws the diagrams, section and plan (${i.wall}, ${i.support})`, () => {
      const html = renderToStaticMarkup(createElement(Diagrams, { i, r: designShoring(i) }));
      expect(html).toContain("<svg");
      expect(html).not.toContain("NaN");
      for (const v of shoringViews(i)) expect(renderToStaticMarkup(createElement(DetailSketch, { view: v, schedule: schedule([], []) }))).not.toContain("NaN");
    });
  }
});

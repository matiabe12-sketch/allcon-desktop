import { describe, expect, it } from "vitest";
import { plainNumbers } from "./plain-numbers";
import { num } from "../design/calc-style";

describe("plain numbers in text and tables", () => {
  it("writes powers of ten without the math markup", () => {
    expect(plainNumbers(num(1.107e-7))).toBe("1.107×10⁻⁷");
    expect(plainNumbers("y = 9.661\\cdot 10^{-2} in, M = 12")).toBe("y = 9.661×10⁻² in, M = 12");
    expect(plainNumbers("no numbers to change")).toBe("no numbers to change");
  });
});

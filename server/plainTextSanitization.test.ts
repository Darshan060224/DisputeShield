import { describe, expect, it } from "vitest";
import { sanitizePlainText } from "./plainTextSanitization";

describe("plain-text workflow input normalization", () => {
  it("removes HTML-significant and control characters without dropping ordinary Unicode text", () => {
    expect(sanitizePlainText("  <script>delivery</script>\u0000 — पहुँचा नहीं  ")).toBe("script delivery /script — पहुँचा नहीं");
  });
});

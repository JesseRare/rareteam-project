import { describe, expect, it } from "vitest";
import { controlPanelHtml } from "./control-panel.js";

describe("control panel HTML", () => {
  it("uses a CSP nonce and no inline event attributes", () => {
    const html = controlPanelHtml("test-nonce");
    expect(html).toContain('<script nonce="test-nonce">');
    expect(html).not.toMatch(/\sonclick=/i);
    expect(html).toContain('data-page="announcements"');
    expect(html).toContain("/control/api/announcements");
    expect(html).toContain("image/png,image/jpeg,image/webp");
  });
});

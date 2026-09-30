import { describe, expect, it } from "vitest";
import { offlineMinecraftUuid } from "./security.js";

describe("offlineMinecraftUuid", () => {
  it("matches Minecraft's OfflinePlayer UUID algorithm", () => {
    expect(offlineMinecraftUuid("Notch")).toBe("b50ad385-829d-3141-a216-7e7d7539ba7f");
  });
});

import { describe, expect, it } from "vitest";
import { parseSourceInfo } from "./source-status.js";

function value(text: string) { return Buffer.concat([Buffer.from(text, "utf8"), Buffer.from([0])]); }

describe("parseSourceInfo", () => {
  it("reads a Source A2S_INFO response", () => {
    const packet = Buffer.concat([
      Buffer.from([0xff, 0xff, 0xff, 0xff, 0x49, 17]),
      value("SURVIVAL JIM"), value("de_dust2"), value("cstrike"), value("Counter-Strike: Source"),
      Buffer.from([0xf0, 0x00, 7, 32, 0, 100, 119, 0, 1]), value("1.0.0.34"),
    ]);
    expect(parseSourceInfo(packet)).toMatchObject({ online: true, players: 7, maxPlayers: 32, map: "de_dust2", serverName: "SURVIVAL JIM" });
  });

  it("rejects malformed responses", () => {
    expect(() => parseSourceInfo(Buffer.from([1, 2, 3]))).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { isNewerVersion, parsePortableUpdateMetadata } from "./portable-updater.js";

const valid = {
  version: "0.3.12",
  url: "rareteam-0.3.12-Windows-Portable-x64.exe",
  sha512: `${"A".repeat(86)}==`,
  size: 94_000_000,
};

describe("portable updater", () => {
  it("accepts strict release metadata", () => {
    expect(parsePortableUpdateMetadata(valid)).toEqual(valid);
  });

  it("rejects unsafe filenames and malformed checksums", () => {
    expect(() => parsePortableUpdateMetadata({ ...valid, url: "../rareteam.exe" })).toThrow();
    expect(() => parsePortableUpdateMetadata({ ...valid, url: "rareteam-0.3.11-Windows-Portable-x64.exe" })).toThrow();
    expect(() => parsePortableUpdateMetadata({ ...valid, sha512: "invalid" })).toThrow();
  });

  it("only accepts a strictly newer semantic version", () => {
    expect(isNewerVersion("0.3.12", "0.3.11")).toBe(true);
    expect(isNewerVersion("0.3.11", "0.3.11")).toBe(false);
    expect(isNewerVersion("0.3.10", "0.3.11")).toBe(false);
  });
});
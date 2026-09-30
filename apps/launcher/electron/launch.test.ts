import { describe, expect, it } from "vitest";
import { isNeoForgeInstallerOutput } from "./launch.js";

describe("NeoForge classpath", () => {
  it("keeps installer outputs on disk but excludes them from Java -cp", () => {
    expect(isNeoForgeInstallerOutput("libraries/net/minecraft/client/1.21.1-build/client-1.21.1-build-extra.jar")).toBe(true);
    expect(isNeoForgeInstallerOutput("libraries/net/minecraft/client/1.21.1-build/client-1.21.1-build-srg.jar")).toBe(true);
    expect(isNeoForgeInstallerOutput("libraries/net/neoforged/neoforge/21.1.252/neoforge-21.1.252-client.jar")).toBe(true);
    expect(isNeoForgeInstallerOutput("libraries/net/neoforged/neoforge/21.1.252/neoforge-21.1.252-universal.jar")).toBe(false);
    expect(isNeoForgeInstallerOutput("libraries/com/google/guava/guava.jar")).toBe(false);
  });
});
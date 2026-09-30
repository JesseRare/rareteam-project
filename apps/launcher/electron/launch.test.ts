import { describe, expect, it } from "vitest";
import { isNeoForgeInstallerOutput, withQuickPlayMultiplayer } from "./launch.js";

describe("NeoForge classpath", () => {
  it("keeps installer outputs on disk but excludes them from Java -cp", () => {
    expect(isNeoForgeInstallerOutput("libraries/net/minecraft/client/1.21.1-build/client-1.21.1-build-extra.jar")).toBe(true);
    expect(isNeoForgeInstallerOutput("libraries/net/minecraft/client/1.21.1-build/client-1.21.1-build-srg.jar")).toBe(true);
    expect(isNeoForgeInstallerOutput("libraries/net/neoforged/neoforge/21.1.252/neoforge-21.1.252-client.jar")).toBe(true);
    expect(isNeoForgeInstallerOutput("libraries/net/neoforged/neoforge/21.1.252/neoforge-21.1.252-universal.jar")).toBe(false);
    expect(isNeoForgeInstallerOutput("libraries/com/google/guava/guava.jar")).toBe(false);
  });
});

describe("Minecraft Quick Play", () => {
  it("replaces legacy server arguments with the supported multiplayer argument", () => {
    expect(withQuickPlayMultiplayer(
      ["--username", "player", "--server", "old.example", "--port", "25565"],
      "play.rarenetwork.ru:25565",
    )).toEqual([
      "--username",
      "player",
      "--quickPlayMultiplayer",
      "play.rarenetwork.ru:25565",
    ]);
  });

  it("replaces an existing Quick Play target without duplicating it", () => {
    expect(withQuickPlayMultiplayer(
      ["--quickPlayMultiplayer", "old.example:25565", "--version", "1.21.1"],
      "play.rarenetwork.ru:25565",
    )).toEqual([
      "--version",
      "1.21.1",
      "--quickPlayMultiplayer",
      "play.rarenetwork.ru:25565",
    ]);
  });
});
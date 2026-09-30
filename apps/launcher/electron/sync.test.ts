import { generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BuildManifest } from "@rare/contracts";
import { planSync, synchronize, unsignedManifest, verifyManifest } from "./sync.js";

function fixture(): BuildManifest {
  return {
    schemaVersion: 1, profileId: "survival", version: "1", minecraftVersion: "1.21.1",
    loader: { type: "neoforge", version: "21.1.252" }, java: { major: 21, distribution: "temurin" },
    generatedAt: "2026-09-29T00:00:00.000Z",
    files: [{ path: "mods/example.jar", size: 3, sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", url: "objects/a", kind: "required", side: "client" }],
    mirrors: [], signature: "",
  };
}

describe("manifest security", () => {
  it("accepts a valid Ed25519 signature and rejects tampering", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const manifest = fixture();
    manifest.signature = sign(null, Buffer.from(unsignedManifest(manifest)), privateKey).toString("base64url");
    const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(verifyManifest(manifest, publicPem)).toBe(manifest);
    expect(() => verifyManifest({ ...manifest, version: "2" }, publicPem)).toThrow("invalid");
  });

  it("blocks path traversal and detects changed files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "rare-sync-"));
    await mkdir(path.join(root, "mods"));
    await writeFile(path.join(root, "mods/example.jar"), "bad");
    expect((await planSync(root, fixture()))[0]?.reason).toBe("hash");
    const unsafe = fixture(); unsafe.files[0].path = "../escape.jar";
    await expect(planSync(root, unsafe)).rejects.toThrow("Invalid manifest file");
    expect(await readFile(path.join(root, "mods/example.jar"), "utf8")).toBe("bad");
  });

  it("finishes a fully downloaded .part file without an invalid range request", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "rare-sync-resume-"));
    await mkdir(path.join(root, "mods"));
    await writeFile(path.join(root, "mods/example.jar.part"), "abc");
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const manifest = fixture();
    manifest.signature = sign(null, Buffer.from(unsignedManifest(manifest)), privateKey).toString("base64url");
    let objectRequests = 0;
    const server = createServer((request, response) => {
      if (request.url === "/manifest.json") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(manifest));
      } else {
        objectRequests += 1;
        response.end("abc");
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not start");
      await synchronize(root, `http://127.0.0.1:${address.port}/manifest.json`, publicKey.export({ type: "spki", format: "pem" }).toString());
      expect(await readFile(path.join(root, "mods/example.jar"), "utf8")).toBe("abc");
      expect(objectRequests).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("downloads a zero-byte file when its .part file does not exist", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "rare-sync-empty-"));
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const manifest = fixture();
    manifest.files = [{
      path: "mods/.keep",
      size: 0,
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      url: "objects/empty",
      kind: "required",
      side: "client",
    }];
    manifest.signature = sign(null, Buffer.from(unsignedManifest(manifest)), privateKey).toString("base64url");
    const server = createServer((request, response) => {
      if (request.url === "/manifest.json") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(manifest));
      } else {
        response.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not start");
      await synchronize(root, `http://127.0.0.1:${address.port}/manifest.json`, publicKey.export({ type: "spki", format: "pem" }).toString());
      expect((await stat(path.join(root, "mods/.keep"))).size).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});

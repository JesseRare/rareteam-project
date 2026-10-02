import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { launcherReleaseRoutes } from "./routes/launcher-releases.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("launcher release routes", () => {
  it.each([
    ["/artifacts/launcher/darwin-arm64/latest-mac.yml", "latest-mac-arm64.yml"],
    ["/artifacts/launcher/darwin-x64/latest-mac.yml", "latest-mac-x64.yml"],
    ["/artifacts/launcher/win32-x64/latest.yml", "latest-win32-x64.yml"],
    ["/artifacts/launcher/win32-x64/latest-portable.json", "latest-portable.json"],
  ])("maps %s to architecture-specific metadata", async (url, releaseFilename) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("version: 0.3.9\n", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const app = Fastify();
    await app.register(launcherReleaseRoutes);

    const response = await app.inject({ method: "GET", url });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain(url.endsWith(".json") ? "application/json" : "text/yaml");
    expect(response.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
    expect(response.body).toBe("version: 0.3.9\n");
    expect(fetchMock).toHaveBeenCalledWith(
      `https://github.com/JesseRare/rareteam-project/releases/latest/download/${releaseFilename}`,
      expect.objectContaining({
        headers: { accept: releaseFilename.endsWith(".json") ? "application/json" : "text/yaml", "cache-control": "no-cache" },
        redirect: "follow",
      }),
    );
    await app.close();
  });

  it("returns 503 when GitHub metadata is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    const app = Fastify();
    await app.register(launcherReleaseRoutes);

    const response = await app.inject({
      method: "GET",
      url: "/artifacts/launcher/win32-x64/latest.yml",
    });

    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it("redirects safe artifact names and rejects nested paths", async () => {
    const app = Fastify();
    await app.register(launcherReleaseRoutes);

    const valid = await app.inject({
      method: "GET",
      url: "/artifacts/launcher/win32-x64/rareteam-0.3.9-Windows-Setup-x64.exe",
    });
    expect(valid.statusCode).toBe(302);
    expect(valid.headers.location).toBe(
      "https://github.com/JesseRare/rareteam-project/releases/latest/download/rareteam-0.3.9-Windows-Setup-x64.exe",
    );

    const invalid = await app.inject({
      method: "GET",
      url: "/artifacts/launcher/win32-x64/nested/file.exe",
    });
    expect(invalid.statusCode).toBe(404);
    await app.close();
  });
});

import type { FastifyPluginAsync } from "fastify";

const githubLatestBase =
  "https://github.com/JesseRare/rareteam-project/releases/latest/download";

const channels = [
  {
    prefix: "/artifacts/launcher/darwin-arm64",
    publicMetadata: "latest-mac.yml",
    releaseMetadata: "latest-mac-arm64.yml",
  },
  {
    prefix: "/artifacts/launcher/darwin-x64",
    publicMetadata: "latest-mac.yml",
    releaseMetadata: "latest-mac-x64.yml",
  },
  {
    prefix: "/artifacts/launcher/win32-x64",
    publicMetadata: "latest.yml",
    releaseMetadata: "latest-win32-x64.yml",
  },
  {
    prefix: "/artifacts/launcher/win32-x64",
    publicMetadata: "latest-portable.json",
    releaseMetadata: "latest-portable.json",
  },
] as const;

async function loadReleaseMetadata(filename: string) {
  const response = await fetch(`${githubLatestBase}/${filename}`, {
    headers: { accept: filename.endsWith(".json") ? "application/json" : "text/yaml", "cache-control": "no-cache" },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw Object.assign(new Error(`Launcher release metadata is unavailable: ${response.status}`), {
      statusCode: 503,
    });
  }
  return response.text();
}

export const launcherReleaseRoutes: FastifyPluginAsync = async (app) => {
  for (const channel of channels) {
    app.get(`${channel.prefix}/${channel.publicMetadata}`, async (_request, reply) =>
      reply
        .header("Cache-Control", "no-cache, no-store, must-revalidate")
        .type(channel.publicMetadata.endsWith(".json") ? "application/json; charset=utf-8" : "text/yaml; charset=utf-8")
        .send(await loadReleaseMetadata(channel.releaseMetadata)),
    );
  }

  for (const prefix of new Set(channels.map((channel) => channel.prefix))) {
    app.get<{ Params: { "*": string } }>(`${prefix}/*`, async (request, reply) => {
      const filename = request.params["*"];
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(filename)) {
        return reply.code(404).send({ code: "not_found", error: "Not found" });
      }
      return reply.redirect(`${githubLatestBase}/${encodeURIComponent(filename)}`);
    });
  }
};

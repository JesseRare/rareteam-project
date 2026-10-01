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
] as const;

async function loadReleaseMetadata(filename: string) {
  const response = await fetch(`${githubLatestBase}/${filename}`, {
    headers: { accept: "text/yaml", "cache-control": "no-cache" },
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
        .type("text/yaml; charset=utf-8")
        .send(await loadReleaseMetadata(channel.releaseMetadata)),
    );

    app.get<{ Params: { "*": string } }>(`${channel.prefix}/*`, async (request, reply) => {
      const filename = request.params["*"];
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(filename)) {
        return reply.code(404).send({ code: "not_found", error: "Not found" });
      }
      return reply.redirect(`${githubLatestBase}/${encodeURIComponent(filename)}`);
    });
  }
};

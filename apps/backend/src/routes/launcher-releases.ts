import type { FastifyPluginAsync } from "fastify";

type MacRelease = {
  arch: "arm64" | "x64";
  filename: string;
  sha512: string;
  size: number;
  releaseDate: string;
};

const version = "0.2.0";
const githubReleaseBase =
  "https://github.com/JesseRare/rareteam-project/releases/download/v0.2.0";

const macReleases: MacRelease[] = [
  {
    arch: "arm64",
    filename: "Melchior-1-0.2.0-macOS-arm64.zip",
    sha512:
      "VW0EdGzCQ5t+eZ0E2WQzTwxeoE/+mS/8ycqNXooCO1IvGhLrPWJ0LclJA1b+Ibh+1Nb/ewPXhOdpF5BkEEbypg==",
    size: 110_138_889,
    releaseDate: "2026-10-01T03:19:30.248755Z",
  },
  {
    arch: "x64",
    filename: "Melchior-1-0.2.0-macOS-x64.zip",
    sha512:
      "+aY3h+kuTEZ8hs9sw1ta0RHWGcFX5yX9lFsAXyXQgvRlS+uu6ytpXh/aVxUmQj1C8KHoTG6H7aGuELsugH7QDw==",
    size: 115_263_235,
    releaseDate: "2026-10-01T03:19:30.532962Z",
  },
];

function metadata(release: MacRelease) {
  return [
    `version: ${version}`,
    "files:",
    `  - url: ${release.filename}`,
    `    sha512: ${release.sha512}`,
    `    size: ${release.size}`,
    `path: ${release.filename}`,
    `sha512: ${release.sha512}`,
    `releaseDate: '${release.releaseDate}'`,
    "",
  ].join("\n");
}

export const launcherReleaseRoutes: FastifyPluginAsync = async (app) => {
  for (const release of macReleases) {
    const prefix = `/artifacts/launcher/darwin-${release.arch}`;

    app.get(`${prefix}/latest-mac.yml`, async (_request, reply) =>
      reply
        .header("Cache-Control", "no-cache, no-store, must-revalidate")
        .type("text/yaml; charset=utf-8")
        .send(metadata(release)),
    );

    app.get(`${prefix}/${release.filename}`, async (_request, reply) =>
      reply.redirect(`${githubReleaseBase}/${release.filename}`),
    );
  }
};
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
      "EuAdCUiSWll477PcaiFI+kIbu4Ma1iKXVy7bZd3PhIB9BvfzNqZT2QD9Z6lDgACdkrOnrFiXc6daGVRGf957ew==",
    size: 110_138_877,
    releaseDate: "2026-10-01T02:58:53.603286Z",
  },
  {
    arch: "x64",
    filename: "Melchior-1-0.2.0-macOS-x64.zip",
    sha512:
      "ZQnZGFCq0ZZvek5Xtul9H+RQPt1b0/kLNB89xtgisPb3xY2kqQgwyRxWWxOdMXpwGvkWWsJY7xZUzXUtJH2kMA==",
    size: 115_263_223,
    releaseDate: "2026-10-01T02:58:53.976280Z",
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
import { config } from "./config.js";

export async function queryPterodactylRunning(serverId: string): Promise<boolean | null> {
  if (!config.PTERODACTYL_URL || !config.PTERODACTYL_API_KEY) return null;
  try {
    const response = await fetch(new URL(`/api/client/servers/${serverId}/resources`, config.PTERODACTYL_URL), {
      headers: {
        accept: "Application/vnd.pterodactyl.v1+json",
        authorization: `Bearer ${config.PTERODACTYL_API_KEY}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const body = await response.json() as { attributes?: { current_state?: string } };
    return body.attributes?.current_state === "running";
  } catch {
    return null;
  }
}

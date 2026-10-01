export type ReleaseChannel = "stable" | "beta";
export type ManagedFileKind = "required" | "optional" | "mutable";

export interface LauncherRole {
  id: string;
  name: string;
  color: string;
  iconUrl?: string;
  position: number;
}

export interface LauncherUser {
  id: string;
  username: string;
  uuid: string;
  roles: string[];
  roleAssignments?: LauncherRole[];
  skinUrl?: string;
  capeUrl?: string;
  skinModel: "classic" | "slim";
}

export interface BuildFile {
  path: string;
  size: number;
  sha256: string;
  url: string;
  kind: ManagedFileKind;
  side: "client" | "server" | "both";
  executable?: boolean;
}

export interface BuildManifest {
  schemaVersion: 1;
  profileId: string;
  version: string;
  minecraftVersion: string;
  loader: { type: "neoforge"; version: string };
  java: { major: 21; distribution: string };
  launch?: {
    mainClass: string;
    classpath: string[];
    jvmArgs: string[];
    gameArgs: string[];
    javaPath?: string;
  };
  generatedAt: string;
  files: BuildFile[];
  mirrors: string[];
  signature: string;
}

export interface ServerProfile {
  id: string;
  gameType: "minecraft" | "source";
  title: string;
  subtitle: string;
  version: string;
  address: string;
  manifestUrl?: string;
  manifestPublicKey?: string;
  online: boolean;
  players: number;
  maxPlayers: number;
  map?: string;
  serverName?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: LauncherUser;
}

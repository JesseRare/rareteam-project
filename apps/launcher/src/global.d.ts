export {};

import type { SyncProgress, SyncResult } from "../electron/sync";
import type { UpdateState } from "../electron/updater";

declare global {
  interface Window {
    rare?: {
      minimize(): Promise<void>;
      close(): Promise<void>;
      synchronize(profileId: string): Promise<SyncResult>;
      onSyncProgress(listener: (progress: SyncProgress) => void): () => void;
      loadSession(): Promise<string | null>;
      saveSession(value: string): Promise<void>;
      clearSession(): Promise<void>;
      getSettings(): Promise<{ memoryMb: number; gameRoot: string; cssRoot: string }>;
      saveSettings(value: Partial<{ memoryMb: number; gameRoot: string; cssRoot: string }>): Promise<{ memoryMb: number; gameRoot: string; cssRoot: string }>;
      chooseGameDirectory(): Promise<{ memoryMb: number; gameRoot: string; cssRoot: string }>;
      chooseCssDirectory(): Promise<{ memoryMb: number; gameRoot: string; cssRoot: string }>;
      launchSource(serverAddress: string): Promise<{ pid: number }>;
      launch(profileId: string, identity: { username: string; uuid: string; ticket: string; serverAddress: string }): Promise<{ pid: number }>;
      getUpdateState(): Promise<UpdateState>;
      checkForUpdates(): Promise<UpdateState>;
      installUpdate(): Promise<void>;
      onUpdateState(listener: (state: UpdateState) => void): () => void;
    };
  }
}

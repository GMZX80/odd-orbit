import type { RunResult } from "../systems/runTypes";
import type { StorageAdapter } from "./localStorageAdapter";

export interface GameDataService {
  recordRun(userId: string, result: RunResult): Promise<void>;
  getRunHistory(userId: string): Promise<RunResult[]>;
}

export function createGameDataService(storage: StorageAdapter): GameDataService {
  const key = "run-history";

  return {
    async recordRun(_userId: string, result: RunResult) {
      const history = storage.read<RunResult[]>(key, []);
      storage.write(key, [result, ...history].slice(0, 20));
    },

    async getRunHistory(_userId: string) {
      return storage.read<RunResult[]>(key, []);
    }
  };
}

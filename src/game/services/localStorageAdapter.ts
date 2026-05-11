export interface StorageAdapter {
  read<T>(key: string, fallback: T): T;
  write<T>(key: string, value: T): void;
}

export function createLocalStorageAdapter(namespace: string): StorageAdapter {
  const prefix = `${namespace}:`;

  return {
    read<T>(key: string, fallback: T) {
      const raw = window.localStorage.getItem(`${prefix}${key}`);
      if (!raw) {
        return fallback;
      }

      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },
    write<T>(key: string, value: T) {
      window.localStorage.setItem(`${prefix}${key}`, JSON.stringify(value));
    }
  };
}

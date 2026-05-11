export function createRng(seed: number) {
  let state = seed >>> 0;

  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    },
    pick<T>(items: readonly T[]) {
      return items[Math.floor(this.next() * items.length)];
    },
    int(min: number, max: number) {
      return Math.floor(this.next() * (max - min + 1)) + min;
    }
  };
}

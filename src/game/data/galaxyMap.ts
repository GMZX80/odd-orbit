import type { Constellation, StarSystem } from "../systems/galaxyTypes";

export const constellations: Constellation[] = [
  { id: "cinder-rim", name: "Cinder Rim", bonusUnits: 2, tint: 0xff654f },
  { id: "luminous-drift", name: "Luminous Drift", bonusUnits: 3, tint: 0x66f2a8 },
  { id: "mirror-veil", name: "Mirror Veil", bonusUnits: 2, tint: 0x9b8cff },
  { id: "brass-wake", name: "Brass Wake", bonusUnits: 3, tint: 0xffc857 },
  { id: "umbra-pocket", name: "Umbra Pocket", bonusUnits: 4, tint: 0xb76dff }
];

export const initialSystems: StarSystem[] = [
  {
    id: "solace",
    name: "Solace",
    x: 58,
    y: 516,
    owner: "player",
    fleetUnits: 12,
    resourceValue: 3,
    constellationId: "cinder-rim",
    systemType: "core",
    neighbours: ["brindle", "vanta", "ember"]
  },
  {
    id: "brindle",
    name: "Brindle",
    x: 116,
    y: 453,
    owner: "player",
    fleetUnits: 8,
    resourceValue: 2,
    constellationId: "cinder-rim",
    systemType: "mining",
    neighbours: ["solace", "vanta", "kestrel", "pavo", "halo"]
  },
  {
    id: "ember",
    name: "Ember",
    x: 44,
    y: 399,
    owner: "neutral",
    fleetUnits: 7,
    resourceValue: 1,
    constellationId: "cinder-rim",
    systemType: "frontier",
    neighbours: ["solace", "vanta", "ochre"]
  },
  {
    id: "vanta",
    name: "Vanta",
    x: 102,
    y: 361,
    owner: "neutral",
    fleetUnits: 9,
    resourceValue: 2,
    constellationId: "luminous-drift",
    systemType: "rift",
    neighbours: ["solace", "brindle", "ember", "kestrel", "ochre"]
  },
  {
    id: "kestrel",
    name: "Kestrel",
    x: 184,
    y: 381,
    owner: "neutral",
    fleetUnits: 10,
    resourceValue: 2,
    constellationId: "luminous-drift",
    systemType: "frontier",
    neighbours: ["brindle", "vanta", "pavo", "morrow", "ochre"]
  },
  {
    id: "pavo",
    name: "Pavo",
    x: 260,
    y: 452,
    owner: "amber",
    fleetUnits: 12,
    resourceValue: 2,
    constellationId: "luminous-drift",
    systemType: "mining",
    neighbours: ["brindle", "kestrel", "lumen", "saffron", "halo"]
  },
  {
    id: "ochre",
    name: "Ochre",
    x: 88,
    y: 281,
    owner: "crimson",
    fleetUnits: 13,
    resourceValue: 3,
    constellationId: "mirror-veil",
    systemType: "fortress",
    neighbours: ["ember", "vanta", "kestrel", "morrow", "iris"]
  },
  {
    id: "iris",
    name: "Iris",
    x: 42,
    y: 215,
    owner: "violet",
    fleetUnits: 11,
    resourceValue: 2,
    constellationId: "mirror-veil",
    systemType: "rift",
    neighbours: ["ochre", "quartz", "nyx"]
  },
  {
    id: "quartz",
    name: "Quartz",
    x: 128,
    y: 190,
    owner: "neutral",
    fleetUnits: 8,
    resourceValue: 1,
    constellationId: "mirror-veil",
    systemType: "frontier",
    neighbours: ["iris", "ochre", "morrow", "nyx"]
  },
  {
    id: "morrow",
    name: "Morrow",
    x: 198,
    y: 274,
    owner: "crimson",
    fleetUnits: 16,
    resourceValue: 4,
    constellationId: "brass-wake",
    systemType: "core",
    neighbours: ["kestrel", "ochre", "quartz", "saffron", "lumen", "gilt", "nova"]
  },
  {
    id: "saffron",
    name: "Saffron",
    x: 314,
    y: 357,
    owner: "amber",
    fleetUnits: 14,
    resourceValue: 3,
    constellationId: "brass-wake",
    systemType: "fortress",
    neighbours: ["pavo", "morrow", "lumen", "gilt"]
  },
  {
    id: "lumen",
    name: "Lumen",
    x: 334,
    y: 497,
    owner: "amber",
    fleetUnits: 10,
    resourceValue: 2,
    constellationId: "brass-wake",
    systemType: "mining",
    neighbours: ["pavo", "saffron", "morrow", "brindle", "halo"]
  },
  {
    id: "gilt",
    name: "Gilt",
    x: 352,
    y: 267,
    owner: "neutral",
    fleetUnits: 9,
    resourceValue: 1,
    constellationId: "brass-wake",
    systemType: "frontier",
    neighbours: ["saffron", "morrow", "nova", "spire"]
  },
  {
    id: "nyx",
    name: "Nyx",
    x: 154,
    y: 113,
    owner: "violet",
    fleetUnits: 15,
    resourceValue: 4,
    constellationId: "umbra-pocket",
    systemType: "core",
    neighbours: ["iris", "quartz", "nova", "umbra"]
  },
  {
    id: "nova",
    name: "Nova",
    x: 256,
    y: 133,
    owner: "violet",
    fleetUnits: 12,
    resourceValue: 2,
    constellationId: "umbra-pocket",
    systemType: "rift",
    neighbours: ["nyx", "gilt", "umbra", "morrow"]
  },
  {
    id: "umbra",
    name: "Umbra",
    x: 326,
    y: 106,
    owner: "neutral",
    fleetUnits: 13,
    resourceValue: 2,
    constellationId: "umbra-pocket",
    systemType: "frontier",
    neighbours: ["nyx", "nova", "spire"]
  },
  {
    id: "spire",
    name: "Spire",
    x: 342,
    y: 189,
    owner: "crimson",
    fleetUnits: 11,
    resourceValue: 2,
    constellationId: "umbra-pocket",
    systemType: "mining",
    neighbours: ["umbra", "nova", "gilt"]
  },
  {
    id: "halo",
    name: "Halo",
    x: 210,
    y: 511,
    owner: "player",
    fleetUnits: 7,
    resourceValue: 1,
    constellationId: "cinder-rim",
    systemType: "frontier",
    neighbours: ["brindle", "pavo", "lumen"]
  }
];

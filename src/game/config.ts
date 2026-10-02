// Game data, copied one-to-one from paw-crossing.html.
// Plain data only (no three / react-native imports) so build scripts can read it too.
// Model keys are Kenney paths without the .glb extension, e.g. 'cube-pets/animal-dog'.

export const PETS = ['dog', 'cat', 'bunny', 'chick',
  'fox', 'pig', 'cow', 'penguin', 'panda', 'beaver', 'hog', 'koala', 'monkey', 'deer',
  'lion', 'tiger', 'polar', 'parrot', 'elephant', 'giraffe', 'bee', 'crab',
  'caterpillar', 'fish'];
export const STARTERS = PETS.slice(0, 4);
export const RARE = ['lion', 'tiger', 'polar', 'parrot', 'elephant', 'giraffe', 'bee', 'crab'];
export const LEGEND = ['caterpillar', 'fish'];
// IAP packs unlock these all at once (they can still be bought with coins)
export const SAFARI_PACK = ['lion', 'tiger', 'elephant', 'giraffe'];
export const LEGEND_PACK = ['caterpillar', 'fish'];
export const price = (n: string) => STARTERS.includes(n) ? 0 : LEGEND.includes(n) ? 500 : RARE.includes(n) ? 250 : 100;

export const CARS = ['sedan', 'taxi', 'police', 'van', 'suv', 'hatchback-sports', 'sedan-sports', 'suv-luxury', 'delivery', 'truck', 'ambulance', 'firetruck', 'garbage-truck'];
export const TREES = ['tree_default', 'tree_oak', 'tree_pineRoundA', 'tree_pineRoundC', 'tree_detailed', 'tree_fat', 'tree_simple', 'tree_cone', 'tree_blocks'];
export const ROCKS = ['rock_largeA', 'rock_largeC', 'stump_round', 'stump_roundDetailed', 'plant_bushLarge', 'plant_bushDetailed'];
export const FLOWERS = ['flower_redA', 'flower_yellowA', 'flower_purpleA', 'flower_redB', 'flower_yellowB', 'mushroom_red', 'mushroom_tanGroup', 'plant_bushSmall'];
export const LOCOS = ['train-locomotive-a', 'train-locomotive-b', 'train-diesel-a', 'train-electric-bullet-a'];
export const WAGONS = ['train-carriage-container-red', 'train-carriage-container-blue', 'train-carriage-container-green', 'train-carriage-box', 'train-carriage-tank', 'train-carriage-lumber', 'train-carriage-coal'];

export const P = {
  pet: (n: string) => `cube-pets/animal-${n}`,
  car: (n: string) => `car-kit/${n}`,
  nat: (n: string) => `nature-kit/${n}`,
  coin: 'platformer-kit/coin-gold',
  log: 'nature-kit/log_large',
  lily: 'nature-kit/lily_large',
  lamp: 'city-kit-roads/light-square',
  cone: 'city-kit-roads/construction-cone',
  train: (n: string) => `train-kit/${n}`,
  track: 'train-kit/track-single-detailed',
  plat: (n: string) => `platformer-kit/${n}`,
  boat: (n: string) => `watercraft-kit/${n}`,
  city: (n: string) => `city-kit-commercial/${n}`,
  surv: (n: string) => `survival-kit/${n}`,
};
export const BOATS = ['boat-row-small', 'boat-fishing-small', 'boat-speed-a', 'boat-speed-e'];

export const ZONE_LEN = 40;
export const CITY_CARS = ['taxi', 'taxi', 'police', 'sedan-sports', 'hatchback-sports', 'suv-luxury', 'van', 'race', 'race-future'];

export type Weather = 'clear' | 'night' | 'storm' | 'blizzard';
export interface Zone {
  name: string; sub: string; sky: number; night?: boolean;
  grass: number[]; trees: string[]; rocks: string[]; flowers: string[];
  water: 'logs' | 'ice' | 'boats' | 'weeds'; hazard?: 'crabs'; farm?: boolean; dirt?: boolean; city?: boolean;
  herd: string[] | null; herdName: string; herdSub: string; weather: Weather[];
}

export const ZONES: Zone[] = [
  { name: 'Sunny Meadow', sub: 'Back where it all began', sky: 0xbfe7ff,
    grass: [0x9bd46a, 0x8cc75d, 0x86bd58, 0x7cb150],
    trees: TREES.map(P.nat), rocks: ROCKS.map(P.nat), flowers: FLOWERS.map(P.nat),
    water: 'logs', herd: ['cow', 'pig', 'cow', 'hog'], herdName: 'Stampede!', herdSub: 'The cows broke out of the farm',
    weather: ['night', 'storm'] },
  { name: 'Autumn Woods', sub: 'Mind the falling leaves', sky: 0xffe3c2,
    grass: [0xe2b04f, 0xd8a346, 0xcb9641, 0xbf8a3b],
    trees: ['tree_default_fall', 'tree_oak_fall', 'tree_detailed_fall', 'tree_fat_fall', 'tree_simple_fall', 'tree_cone_fall', 'tree_blocks_fall', 'tree_tall_fall'].map(P.nat),
    rocks: ['rock_largeA', 'stump_round', 'stump_roundDetailed', 'stump_old', 'log', 'crop_pumpkin'].map(P.nat),
    flowers: ['mushroom_red', 'mushroom_redGroup', 'mushroom_tanGroup', 'mushroom_tan', 'plant_bushSmall', 'flower_yellowB', 'crop_pumpkin'].map(P.nat),
    water: 'logs', farm: true, herd: ['deer', 'deer', 'fox', 'beaver'], herdName: 'Deer crossing!', herdSub: 'The whole forest is on the move',
    weather: ['night', 'storm'] },
  { name: 'Snowy Pass', sub: 'Brr! The lakes are frozen', sky: 0xdfeaf6,
    grass: [0xf2f6fb, 0xe6edf6, 0xdbe4ef, 0xcfd9e6],
    trees: ['tree-pine-snow', 'tree-snow', 'tree-pine-snow-small'].map(P.plat).concat(['tree_pineRoundA', 'tree_pineTallA'].map(P.nat)),
    rocks: ['rock-a', 'rock-b', 'rock-c'].map(P.surv).concat([P.plat('rocks')]),
    flowers: [P.plat('stones'), P.plat('tree-pine-snow-small')],
    water: 'ice', herd: ['penguin', 'polar', 'penguin', 'penguin'], herdName: 'Penguin parade!', herdSub: 'They waddle faster than you think',
    weather: ['night', 'blizzard'] },
  { name: 'Sandy Beach', sub: 'Watch out for crabs', sky: 0xc4f0ff,
    grass: [0xf6e2a8, 0xf0d99a, 0xe9cf8c, 0xe1c47f],
    trees: ['tree_palm', 'tree_palmBend', 'tree_palmTall', 'tree_palmShort', 'tree_palmDetailedTall'].map(P.nat),
    rocks: ['rock-sand-a', 'rock-sand-b', 'rock-sand-c'].map(P.surv).concat([P.city('detail-parasol-a'), P.city('detail-parasol-b')]),
    flowers: ['rock_smallFlatA', 'plant_bushSmall', 'grass'].map(P.nat),
    water: 'boats', hazard: 'crabs', herd: ['crab', 'crab', 'crab'], herdName: 'Crab rave!', herdSub: 'Sideways and very fast',
    weather: ['night', 'storm'] },
  { name: 'Cactus Canyon', sub: 'Tumbleweeds ahead', sky: 0xffd9a8,
    grass: [0xe9a86a, 0xe09d5f, 0xd28f55, 0xc6834c],
    trees: ['cactus_tall', 'cactus_short', 'rock_tallB', 'rock_tallE', 'rock_tallG'].map(P.nat),
    rocks: ['cactus_short', 'rock_tallA', 'rock_largeB', 'tent_smallOpen'].map(P.nat),
    flowers: ['rock_smallB', 'rock_smallE', 'plant_bushSmall', 'cactus_short'].map(P.nat),
    water: 'weeds', dirt: true, herd: ['elephant', 'giraffe', 'lion', 'elephant'], herdName: 'Safari rush!', herdSub: 'Elephants have right of way',
    weather: ['night'] },
  { name: 'Neon City', sub: 'The city never sleeps', sky: 0x2a2f5c, night: true,
    grass: [0xb6bac6, 0xadb1be, 0x9ea2af, 0x959aa7],
    trees: ['low-detail-building-a', 'low-detail-building-b', 'low-detail-building-c', 'low-detail-building-d', 'low-detail-building-e', 'low-detail-building-f', 'low-detail-building-g', 'low-detail-building-h'].map(P.city),
    rocks: ['tree_default', 'tree_simple', 'plant_bushLarge'].map(P.nat),
    flowers: ['plant_bushSmall', 'flower_redA', 'flower_yellowA'].map(P.nat),
    water: 'boats', city: true, herd: null, herdName: 'Rush hour!', herdSub: 'Everyone is late for something',
    weather: ['storm'] },
];
export const NIGHT_SKY = 0x1b2246, STORM_SKY = 0x8794a8;
export const zoneOf = (i: number) => i < 0 ? 0 : Math.floor(i / ZONE_LEN) % ZONES.length;
export const phaseOf = (i: number) => i < 0 ? -1 : i % ZONE_LEN;

export const ALL_MODELS: string[] = [...new Set([
  ...PETS.map(P.pet), ...CARS.map(P.car), ...TREES.map(P.nat), ...ROCKS.map(P.nat), ...FLOWERS.map(P.nat),
  P.coin, P.log, P.lily, P.lamp, P.cone, P.track,
  ...LOCOS.map(P.train), ...WAGONS.map(P.train),
  ...['heart', 'jewel', 'star', 'flag'].map(P.plat),
  ...ZONES.flatMap(z => [...z.trees, ...z.rocks, ...z.flowers]),
  ...['fence_simple', 'plant_bush', 'plant_bushDetailed', 'rock_largeA', 'rock_largeC'].map(P.nat),
  ...BOATS.map(P.boat), ...['tractor', 'tractor-shovel', 'truck-flat', 'delivery-flat', 'race', 'race-future'].map(P.car),
  ...['train-electric-city-a', 'train-electric-city-b', 'train-electric-city-c', 'train-electric-subway-a', 'train-electric-subway-b', 'train-electric-subway-c'].map(P.train),
])];

export const PARTICLES = ['star_06', 'spark_05', 'smoke_04', 'circle_05', 'magic_03', 'twirl_02', 'light_01', 'dirt_02', 'trace_03'] as const;
export type ParticleTex = typeof PARTICLES[number];

// ---------- missions ----------
export interface MissionDef { text: (n: number) => string; run?: boolean; steps: number[] }
export const MISSIONS: Record<string, MissionDef> = {
  score:  { text: n => `Reach ${n} in one run`, run: true, steps: [15, 25, 40, 55, 75, 100, 130, 160] },
  coins:  { text: n => `Grab ${n} coins in one run`, run: true, steps: [4, 6, 8, 10, 13, 16, 20] },
  roads:  { text: n => `Hop over ${n} road lanes`, steps: [10, 20, 35, 50, 75, 100] },
  logs:   { text: n => `Ride ${n} logs or boats`, steps: [5, 10, 18, 28, 40, 60] },
  boss:   { text: n => n > 1 ? `Survive ${n} stampedes` : 'Survive a stampede', steps: [1, 2, 3, 4] },
  night:  { text: n => `Hop ${n} rows in the dark`, steps: [10, 20, 35, 50] },
  slides: { text: n => `Slide ${n} tiles on ice`, steps: [6, 12, 20, 30] },
  rails:  { text: n => `Cross ${n} railways`, steps: [2, 4, 7, 10, 15, 22] },
  close:  { text: n => `Get ${n} close calls`, steps: [2, 4, 7, 10, 15] },
  powers: { text: n => `Pick up ${n} power-ups`, steps: [1, 2, 4, 6, 9] },
  speedy: { text: n => `Hit Speedy ×${n}`, run: true, steps: [4, 8, 12] },
  zone:   { text: n => `Reach ${ZONES[n].name}`, run: true, steps: [1, 2, 3, 4, 5] },
};

export type DeathKind = 'car' | 'water' | 'drift' | 'slow' | 'train' | 'herd' | 'weed' | 'crab' | 'eagle';
export const DEATHS: Record<DeathKind, [string, string[]]> = {
  car: ['Squashed!', ['That car was not stopping.', 'Look both ways next time.', 'Rush hour got you.', 'Beep beep. Too late.']],
  water: ['Splash!', ['Turns out you can\'t swim.', 'The river wins this round.', 'Logs float. You don\'t.']],
  drift: ['Swept away!', ['The log took you off the map.', 'Ride the log, but not that far.']],
  slow: ['Too slow!', ['The world moved on without you.', 'Keep hopping forward!']],
  train: ['Choo choo!', ['The 5:15 was right on time.', 'You heard the bell, right?', 'Trains always win.']],
  herd: ['Trampled!', ['The herd had places to be.', 'Wait for the gap next time.', 'Moo-ve faster.']],
  weed: ['Tumbled!', ['A tumbleweed rolled right over you.', 'The desert wind wins.']],
  crab: ['Pinched!', ['Crabs only walk sideways. You didn\'t look.', 'Snip snap!']],
  eagle: ['Snatched!', ['An eagle spotted you dawdling.', 'Keep moving forward or the eagle comes.', 'Up, up and away.']],
};

// Golden Dog: Paw Club / Legendary pack exclusive (the dog model in gold). Not part of PETS.
export const GOLDEN = 'golden';

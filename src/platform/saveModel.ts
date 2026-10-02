// Versioned save + merge rules (docs §6.1). Pure functions: no React Native imports, unit-tested.
//
// Coins are a ledger, not a number, so two devices can merge without losing or duplicating coins:
//   earned[device] / spent[device] only ever grow on that device, iap[transactionId] = coins granted.
//   balance = Σearned + Σiap − Σspent
export interface Mission { type: string; n: number; p: number; reward: number; done: boolean }

export interface SaveV1 {
  v: 1;
  rcUserId: string;             // stable RevenueCat appUserID, carried across devices by iCloud
  best: number;
  mlevel: number;
  owned: string[];
  missions: Mission[] | null;
  lastClaimDay: string;         // 'YYYY-MM-DD' of the last daily gift ('' = never)
  stats: Record<string, number>;// lifetime counters (close calls, slides…), merged with max
  earned: Record<string, number>;
  spent: Record<string, number>;
  iap: Record<string, number>;
  updatedAt: number;
}

export const emptySave = (rcUserId: string, starters: string[]): SaveV1 => ({
  v: 1, rcUserId, best: 0, mlevel: 0, owned: [...starters], missions: null, lastClaimDay: '', stats: {},
  earned: {}, spent: {}, iap: {}, updatedAt: 0,
});

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
export const balance = (s: SaveV1) => Math.max(0, sum(s.earned) + sum(s.iap) - sum(s.spent));

const maxMerge = (a: Record<string, number>, b: Record<string, number>) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
  return out;
};

export function merge(a: SaveV1, b: SaveV1): SaveV1 {
  const missionsFrom = b.mlevel > a.mlevel ? b : a;
  return {
    v: 1,
    rcUserId: [a.rcUserId, b.rcUserId].filter(Boolean).sort()[0] ?? a.rcUserId,
    best: Math.max(a.best, b.best),
    mlevel: Math.max(a.mlevel, b.mlevel),
    owned: [...new Set([...a.owned, ...b.owned])].sort(),
    missions: missionsFrom.missions ?? a.missions ?? b.missions,
    lastClaimDay: a.lastClaimDay > b.lastClaimDay ? a.lastClaimDay : b.lastClaimDay,
    stats: maxMerge(a.stats, b.stats),
    earned: maxMerge(a.earned, b.earned),
    spent: maxMerge(a.spent, b.spent),
    iap: { ...a.iap, ...b.iap },
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}

/** Accept anything (old web-style keys, corrupt JSON) and return a valid SaveV1. */
export function migrate(raw: unknown, ctx: { rcUserId: string; deviceId: string; starters: string[]; legacy?: Record<string, unknown> }): SaveV1 {
  const base = emptySave(ctx.rcUserId, ctx.starters);
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<SaveV1>;
  if (r.v === 1) {
    return {
      ...base, ...r,
      rcUserId: typeof r.rcUserId === 'string' && r.rcUserId ? r.rcUserId : ctx.rcUserId,
      owned: Array.isArray(r.owned) ? [...new Set([...ctx.starters, ...r.owned.filter(x => typeof x === 'string')])] : base.owned,
      earned: { ...(r.earned ?? {}) }, spent: { ...(r.spent ?? {}) }, iap: { ...(r.iap ?? {}) }, stats: { ...(r.stats ?? {}) },
      v: 1,
    };
  }
  // web-style paw.* keys (a build that stored them one by one)
  const l = ctx.legacy ?? {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const coins = num(l['paw.coins']);
  return {
    ...base,
    best: num(l['paw.best']),
    mlevel: num(l['paw.mlevel']),
    owned: Array.isArray(l['paw.owned']) ? [...new Set([...ctx.starters, ...(l['paw.owned'] as string[])])] : base.owned,
    missions: Array.isArray(l['paw.missions']) ? (l['paw.missions'] as Mission[]) : null,
    earned: coins ? { [ctx.deviceId]: coins } : {},
  };
}

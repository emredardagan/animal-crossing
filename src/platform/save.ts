// Local save (MMKV) + iCloud sync. The game reads/writes through here only.
import { AppState } from 'react-native';
import { createMMKV } from 'react-native-mmkv';
import { STARTERS } from '../game/config';
import * as cloud from './cloudsave';
import { balance, merge, migrate, type SaveV1 } from './saveModel';

export type { SaveV1 };
const mmkv = createMMKV({ id: 'paw' });

export const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = (Math.random() * 16) | 0;
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

// ---------- device-only settings (never synced) ----------
export const prefs = {
  get<T>(k: string, d: T): T {
    try { const v = mmkv.getString(`pref.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k: string, v: unknown) { try { mmkv.set(`pref.${k}`, JSON.stringify(v)); } catch {} },
};

export const deviceId: string = (() => {
  let id = prefs.get<string>('deviceId', '');
  if (!id) { id = uuid(); prefs.set('deviceId', id); }
  return id;
})();

// ---------- the synced save ----------
let current: SaveV1 = (() => {
  let raw: unknown = null;
  try { const s = mmkv.getString(cloud.KEY); raw = s ? JSON.parse(s) : null; } catch {}
  return migrate(raw, { rcUserId: uuid(), deviceId, starters: STARTERS });
})();
const listeners = new Set<(s: SaveV1) => void>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;

function writeLocal() { try { mmkv.set(cloud.KEY, JSON.stringify(current)); } catch {} }
writeLocal();

export const getSave = () => current;
export const coins = () => balance(current);

export function save(patch: Partial<SaveV1> | ((s: SaveV1) => Partial<SaveV1>), { syncNow = false } = {}) {
  const p = typeof patch === 'function' ? patch(current) : patch;
  current = { ...current, ...p, updatedAt: Date.now() };
  writeLocal();
  for (const l of listeners) l(current);
  if (syncNow) void sync();
  else { if (pushTimer) clearTimeout(pushTimer); pushTimer = setTimeout(() => void sync(), 4000); }
}

export function onSaveChanged(cb: (s: SaveV1) => void) { listeners.add(cb); return () => listeners.delete(cb); }

// ---------- coin ledger ----------
export function earn(n: number) {
  if (n > 0) save(s => ({ earned: { ...s.earned, [deviceId]: (s.earned[deviceId] ?? 0) + n } }));
}
export function spend(n: number): boolean {
  if (n <= 0 || coins() < n) return false;
  save(s => ({ spent: { ...s.spent, [deviceId]: (s.spent[deviceId] ?? 0) + n } }), { syncNow: true });
  return true;
}
/** Grant a consumable coin pack once per App Store transaction (on any device). */
export function grantIap(transactionId: string, n: number): boolean {
  if (current.iap[transactionId] != null) return false;
  save(s => ({ iap: { ...s.iap, [transactionId]: n } }), { syncNow: true });
  return true;
}

// ---------- iCloud ----------
let syncing: Promise<void> | null = null;
export function sync(): Promise<void> {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  syncing ??= (async () => {
    try {
      const remote = await cloud.pull();
      if (remote) {
        let parsed: unknown = null;
        try { parsed = JSON.parse(remote); } catch {}
        if (parsed) {
          const merged = merge(current, migrate(parsed, { rcUserId: current.rcUserId, deviceId, starters: STARTERS }));
          if (JSON.stringify(merged) !== JSON.stringify(current)) {
            current = merged; writeLocal();
            for (const l of listeners) l(current);
          }
        }
      }
      await cloud.push(JSON.stringify(current));
    } finally { syncing = null; }
  })();
  return syncing;
}

let started = false;
export function startSync() {
  if (started) return;
  started = true;
  cloud.onExternalChange(() => void sync());
  AppState.addEventListener('change', st => { if (st === 'background') void sync(); });
}

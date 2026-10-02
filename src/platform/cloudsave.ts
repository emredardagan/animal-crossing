// iCloud key-value store (NSUbiquitousKeyValueStore) via ios/PawCrossing/CloudSave.swift.
// Every call is optional: without iCloud (signed out, simulator, module missing) the game runs on MMKV alone.
import { NativeEventEmitter, NativeModules } from 'react-native';

interface CloudSaveNative {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<boolean>;
  synchronize(): Promise<boolean>;
}
const native: CloudSaveNative | undefined = NativeModules.CloudSave;
const emitter = native ? new NativeEventEmitter(NativeModules.CloudSave) : null;

export const KEY = 'paw.save';

export async function pull(): Promise<string | null> {
  if (!native) return null;
  try { await native.synchronize(); return await native.get(KEY); } catch { return null; }
}

export async function push(json: string): Promise<void> {
  if (!native) return;
  try { await native.set(KEY, json); } catch {}
}

/** Called when another device changed the save (NSUbiquitousKeyValueStoreDidChangeExternallyNotification). */
export function onExternalChange(cb: () => void): () => void {
  if (!emitter) return () => {};
  const sub = emitter.addListener('CloudSaveChanged', cb);
  return () => sub.remove();
}

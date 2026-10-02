// RevenueCat: one-time products only. Entitlements are the only source of truth for unlocks.
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage, type PurchasesOffering } from 'react-native-purchases';
import { KEYS, isSet } from './keys';
import { getSave, grantIap, onSaveChanged } from './save';

export type Entitlement = 'no_ads' | 'paw_club' | 'pack_safari' | 'pack_legendary';
export const COIN_PACKS: Record<string, number> = { coins_500: 500, coins_1500: 1500, coins_4000: 4000 };

let ready = false;
let active = new Set<string>();
let offering: PurchasesOffering | null = null;
const listeners = new Set<(active: Set<string>) => void>();

export const has = (e: Entitlement) => active.has(e) || (e === 'no_ads' && active.has('paw_club'));
export const purchasesReady = () => ready;
export function onEntitlementsChanged(cb: (active: Set<string>) => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }

function apply(info: CustomerInfo) {
  active = new Set(Object.keys(info.entitlements.active));
  for (const l of listeners) l(active);
  grantCoinPacks(info);
}

// consumables: credit every coin transaction exactly once (the ledger dedupes by transaction id, across devices too)
function grantCoinPacks(info: CustomerInfo) {
  for (const tx of info.nonSubscriptionTransactions) {
    const n = COIN_PACKS[tx.productIdentifier];
    if (n) grantIap(tx.transactionIdentifier, n);
  }
}

export async function initPurchases() {
  if (Platform.OS !== 'ios' || !isSet(KEYS.revenueCatIos)) { console.warn('RevenueCat key not set: shop disabled'); return; }
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey: KEYS.revenueCatIos, appUserID: getSave().rcUserId });
  Purchases.addCustomerInfoUpdateListener(apply);
  ready = true;
  // iCloud merge may pick another device's id: follow it so both share one RevenueCat customer
  let current = getSave().rcUserId;
  onSaveChanged(s => {
    if (s.rcUserId !== current) { current = s.rcUserId; Purchases.logIn(current).then(r => apply(r.customerInfo)).catch(() => {}); }
  });
  try { apply(await Purchases.getCustomerInfo()); } catch {}
}

export async function getOffering(): Promise<PurchasesOffering | null> {
  if (!ready) return null;
  try { offering = (await Purchases.getOfferings()).current; } catch { /* offline */ }
  return offering;
}
export const cachedOffering = () => offering;

/** true when the purchase went through. Cancels resolve false without an error. */
export async function buy(pkg: PurchasesPackage): Promise<boolean> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    apply(customerInfo);
    return true;
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return false;
    throw e;
  }
}

export async function restore(): Promise<void> {
  if (!ready) throw new Error('Store unavailable');
  apply(await Purchases.restorePurchases());
}

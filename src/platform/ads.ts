// AdMob: rewarded + interstitial only, never during a run (docs §8).
import { Platform } from 'react-native';
import mobileAds, {
  AdEventType, AdsConsent, InterstitialAd, MaxAdContentRating, RewardedAd, RewardedAdEventType, TestIds,
} from 'react-native-google-mobile-ads';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { KEYS, isSet } from './keys';
import { has } from './purchases';
import { prefs } from './save';

// limits live in one object; RevenueCat offering metadata `ads` can override them
export const LIMITS = {
  interstitialEveryRuns: 3,
  interstitialMinGapSec: 120,
  noInterstitialFirstRuns: 3,
  shopCoinsPerDay: 5,
  shopCoinsReward: 15,
  continueMinScore: 10,
};
export function applyRemoteLimits(meta: unknown) {
  const ads = (meta as { ads?: Partial<typeof LIMITS> } | null)?.ads;
  if (ads) for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) if (typeof ads[k] === 'number') LIMITS[k] = ads[k]!;
}

const ids = __DEV__
  ? { rewarded: TestIds.REWARDED, interstitial: TestIds.INTERSTITIAL }
  : { rewarded: KEYS.admob.rewarded, interstitial: KEYS.admob.interstitial };
const enabled = Platform.OS === 'ios' && (__DEV__ || (isSet(ids.rewarded) && isSet(ids.interstitial)));

let started = false;
let rewarded: RewardedAd | null = null, rewardedLoaded = false;
let interstitial: InterstitialAd | null = null, interstitialLoaded = false;
let lastInterstitial = 0, runsSinceInterstitial = 0, rewardedThisScreen = false;
const firstSession = (() => { const n = prefs.get('sessions', 0); prefs.set('sessions', n + 1); return n === 0; })();
let hooks = { open: () => {}, close: () => {} };
export function setAdHooks(h: typeof hooks) { hooks = h; }

/** UMP consent (EEA/UK) first, then the SDK. ATT is asked separately after the first run. */
export async function initAds() {
  if (!enabled || started) return;
  try {
    await AdsConsent.gatherConsent();
    const info = await AdsConsent.getConsentInfo();
    if (!info.canRequestAds) return;
  } catch (e) { console.warn('consent', e); }
  await mobileAds().setRequestConfiguration({ maxAdContentRating: MaxAdContentRating.G, tagForChildDirectedTreatment: false });
  await mobileAds().initialize();
  started = true;
  loadRewarded(); loadInterstitial();
}

export async function privacyOptionsRequired() {
  try { return (await AdsConsent.getConsentInfo()).privacyOptionsRequirementStatus === 'REQUIRED'; } catch { return false; }
}
export const showPrivacyOptions = () => AdsConsent.showPrivacyOptionsForm().catch(() => {});

// ---------- App Tracking Transparency ----------
export async function attStatus() {
  try { return await check(PERMISSIONS.IOS.APP_TRACKING_TRANSPARENCY); } catch { return RESULTS.UNAVAILABLE; }
}
export async function shouldAskAtt() { return (await attStatus()) === RESULTS.DENIED && !prefs.get('attAsked', false); }
export async function askAtt() {
  prefs.set('attAsked', true);
  try { await request(PERMISSIONS.IOS.APP_TRACKING_TRANSPARENCY); } catch {}
}

// ---------- rewarded ----------
function loadRewarded() {
  if (!started) return;
  rewardedLoaded = false;
  rewarded = RewardedAd.createForAdRequest(ids.rewarded);
  rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => { rewardedLoaded = true; });
  rewarded.addAdEventListener(AdEventType.ERROR, () => { rewardedLoaded = false; setTimeout(loadRewarded, 30000); });
  rewarded.load();
}
export const rewardedReady = () => started && rewardedLoaded;

/** Resolves true only when the player earned the reward. */
export function showRewarded(): Promise<boolean> {
  const ad = rewarded;
  if (!ad || !rewardedLoaded) return Promise.resolve(false);
  return new Promise(resolve => {
    let earned = false;
    const offs = [
      ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => { earned = true; }),
      ad.addAdEventListener(AdEventType.CLOSED, () => {
        offs.forEach(off => off()); hooks.close();
        if (earned) rewardedThisScreen = true;
        resolve(earned); loadRewarded();
      }),
      ad.addAdEventListener(AdEventType.ERROR, () => { offs.forEach(off => off()); hooks.close(); resolve(false); }),
    ];
    hooks.open();
    rewardedLoaded = false;
    ad.show().catch(() => { offs.forEach(off => off()); hooks.close(); resolve(false); loadRewarded(); });
  });
}

// ---------- interstitial ----------
function loadInterstitial() {
  if (!started || has('no_ads')) return;
  interstitialLoaded = false;
  interstitial = InterstitialAd.createForAdRequest(ids.interstitial);
  interstitial.addAdEventListener(AdEventType.LOADED, () => { interstitialLoaded = true; });
  interstitial.addAdEventListener(AdEventType.ERROR, () => { interstitialLoaded = false; setTimeout(loadInterstitial, 60000); });
  interstitial.load();
}

function canShowInterstitial() {
  return started && interstitialLoaded && !has('no_ads') && !firstSession && !rewardedThisScreen
    && prefs.get('runs', 0) > LIMITS.noInterstitialFirstRuns
    && runsSinceInterstitial >= LIMITS.interstitialEveryRuns
    && Date.now() - lastInterstitial >= LIMITS.interstitialMinGapSec * 1000;
}

/**
 * The player left the game-over screen (Hop again / Pets): the run is finished.
 * Counts it and, if every limit allows, shows an interstitial. Resolves when the ad is gone (or right away).
 */
export function finishRun(): Promise<void> {
  runsSinceInterstitial++;
  prefs.set('runs', prefs.get('runs', 0) + 1);
  const show = canShowInterstitial() && interstitial;
  rewardedThisScreen = false;
  if (!show) return Promise.resolve();
  const ad = interstitial!;
  return new Promise(resolve => {
    const done = () => { offs.forEach(off => off()); hooks.close(); resolve(); loadInterstitial(); };
    const offs = [ad.addAdEventListener(AdEventType.CLOSED, done), ad.addAdEventListener(AdEventType.ERROR, done)];
    hooks.open();
    lastInterstitial = Date.now(); runsSinceInterstitial = 0; interstitialLoaded = false;
    ad.show().catch(done);
  });
}

// ---------- daily caps ----------
const today = () => new Date().toISOString().slice(0, 10);
export function shopCoinsLeft() {
  const d = prefs.get('shopAds', { day: '', n: 0 });
  return d.day === today() ? Math.max(0, LIMITS.shopCoinsPerDay - d.n) : LIMITS.shopCoinsPerDay;
}
export function useShopCoins() {
  const d = prefs.get('shopAds', { day: '', n: 0 });
  prefs.set('shopAds', d.day === today() ? { day: d.day, n: d.n + 1 } : { day: today(), n: 1 });
}

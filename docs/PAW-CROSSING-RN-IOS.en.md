# Paw Crossing — Pure React Native (no Expo) iOS Plan

> Türkçe sürüm: [PAW-CROSSING-RN-IOS.tr.md](PAW-CROSSING-RN-IOS.tr.md)

Paw Crossing is the three.js web game in [`emredardagan/opus-creative-htmls`](https://github.com/emredardagan/opus-creative-htmls) (`paw-crossing.html` + `assets/kit/toybox.js`). This document plans an **identical** rebuild of the game in **bare React Native, without Expo**, for **iOS only**. Purchases use **RevenueCat**, ads use **Google AdMob**. Product and ad rules are the same as the existing [`PAW-CROSSING-IOS.md`](https://github.com/emredardagan/opus-creative-htmls/blob/main/PAW-CROSSING-IOS.md) (Capacitor plan); what changes is that the app is native React Native instead of a WebView.

## 0. Decisions

| Topic | Decision |
| --- | --- |
| Platform | iOS only (iPhone first), portrait lock, iOS 16+ |
| Approach | **Bare React Native** (`@react-native-community/cli init`), no Expo / expo-modules, New Architecture |
| 3D | **three.js `WebGPURenderer` + `react-native-wgpu`** (Dawn → Metal). Game logic stays three.js |
| Purchases | **RevenueCat** (`react-native-purchases`), one-time products only, no subscriptions |
| Ads | **AdMob** (`react-native-google-mobile-ads`): rewarded + interstitial, no banners |
| Product/ad rules | `PAW-CROSSING-IOS.md` §6–§8 kept as is (Paw Club lifetime, coin packs, frequency caps) |
| Save data | MMKV locally + iCloud key-value sync across devices; coins kept as a ledger so they are never lost or duplicated (§6.1) |
| Category | Games › Casual, 4+, not the Kids category |

## 1. Anatomy of the source game (porting guide)

Sections of `paw-crossing.html` → target modules:
- Constants/data: `PETS`, `STARTERS/RARE/LEGEND`, `price`, `CARS`, `TREES`, `ZONES` (6 seasons), `MISSIONS`, `DEATHS` → `src/game/config.ts`
- Row generation: `pickType`, `makeRow` (grass/road/rush/herd/weeds/crabs/ice/rail/river+lily/boats), `cityBlock`, `addProp`, `ensureRows` → `world.ts`
- Player: `pl`, `hop`, `landed`, ice sliding, `supportAt`, `rescue`, `die` → `player.ts`
- Movers/trains/coin magnet (inside tick) → `hazards.ts`
- Weather: `weatherAt`, `updateWeather` (night, storm + lightning, blizzard, rain LineSegments, fireflies, leaves) → `weather.ts`
- Eagle: `buildEagle`, `updateEagle` → `eagle.ts`
- Missions: `newMission/refreshMissions/track` → `missions.ts`
- Economy: `bank`, `addCoins`, `unlockPet` → `economy.ts` (all coin math + Paw Club 2× in one place)
- Loop + camera + shadow follow + "Too slow" check → `loop.ts`
- `toybox.js`: `createStage`, `preload/loaded/cloneLoaded`, `Bursts`, `popText`, `Sfx`, `damp/easeOutBack`, `store` → `src/engine/*`

Rule: **port behaviour 1:1 first, add features after.** Every number (speeds, probabilities, timings) is copied unchanged.

## 2. Tech stack (no Expo)

| Need | On the web | React Native equivalent |
| --- | --- | --- |
| Rendering | `WebGLRenderer` + canvas | `react-native-wgpu` `<Canvas>` + `three/webgpu` `WebGPURenderer`, `context.present()` after every frame |
| AO post-process | N8AO (postprocessing) | three TSL `PostProcessing` + `ao()` (GTAO), High quality only |
| Tone mapping/shadows | ACES, PCF 2048 | Same (supported by WebGPURenderer) |
| Custom shaders | `ShaderMaterial` (water, shield bubble) | TSL `MeshBasicNodeMaterial` (`colorNode`), fog automatic |
| Glow textures | `<canvas>` 2D gradient | `DataTexture` computed in JS (64×64 RGBA) |
| GLB loading | `GLTFLoader.loadAsync(url)` | Read file as `ArrayBuffer` (`react-native-fs`, MainBundle) → `GLTFLoader.parse` |
| PNG textures | browser decode | Build script converts `colormap.png` + particle PNGs to **raw RGBA/KTX2** → `DataTexture`/`KTX2Loader` (LoadingManager handler) |
| HDRI | `HDRLoader` + PMREM | `.hdr` ArrayBuffer → `HDRLoader.parse` → `PMREMGenerator` |
| Sound (synth) | WebAudio | **`react-native-audio-api`** (Software Mansion, Web Audio API compatible: Oscillator, BiquadFilter, Gain, AudioBuffer) → `Sfx` almost unchanged |
| UI/HUD | HTML/CSS | RN components + **Reanimated** (toast, zone banner, "nope" shake, glow, pop-in) |
| Icons | Phosphor web font | `phosphor-react-native` + `react-native-svg` |
| Font | Fredoka (Google Fonts) | Fredoka TTFs bundled in iOS (OFL) |
| popText | DOM + `project()` | Pooled `Animated.View` list; screen coordinates written from the game loop into Reanimated shared values |
| Input | pointer/keyboard | **react-native-gesture-handler**: Tap → forward, Pan/Fling → direction (same 24 pt threshold) |
| Save data | `localStorage` | **`react-native-mmkv`** (synchronous → same `store.get/set` API) + iCloud key-value sync (see §6.1) |
| Haptics | — | `react-native-haptic-feedback` |
| Safe area | `env(safe-area-inset-*)` | `react-native-safe-area-context` |
| Reduced motion | `matchMedia` | `AccessibilityInfo.isReduceMotionEnabled()` |
| Pause/resume | — | `AppState` → stop/start loop and audio |
| Purchases | — | `react-native-purchases` |
| Ads + UMP | — | `react-native-google-mobile-ads` (`AdsConsent`) |
| ATT | — | `react-native-permissions` (`PERMISSIONS.IOS.APP_TRACKING_TRANSPARENCY`) |
| Game Center | — | Small Swift TurboModule (GameKit: auth, submitScore, reportAchievement, showLeaderboard) |
| Splash | — | `react-native-bootsplash` |

Metro: `unstable_enablePackageExports: true` (`three/webgpu`, `three/tsl`), add `glb`, `hdr`, `ktx2`, `bin` to `assetExts`. Check each package's current docs/version before installing.

## 3. Repo layout

```
animal-crossing/
  app.json, index.js, metro.config.js, babel.config.js, tsconfig.json
  App.tsx                       ← SafeArea, GestureHandlerRoot, screen manager
  src/
    engine/                     ← port of toybox.js
      stage.ts                  ← WebGPURenderer, lights, fog, HDRI, PostProcessing(AO), followShadow, quality
      assets.ts                 ← preload/load/loaded/cloneLoaded (SkeletonUtils), reading from the bundle
      bursts.ts, sfx.ts, glow.ts, materials.ts (water/bubble TSL), math.ts
    game/
      config.ts world.ts player.ts hazards.ts weather.ts eagle.ts missions.ts economy.ts loop.ts
      store.ts                  ← game state → UI bridge (zustand, throttled)
    ui/
      GameCanvas.tsx            ← <Canvas> + gesture layer
      Hud.tsx TitleScreen.tsx GameOver.tsx Shop.tsx Settings.tsx Credits.tsx
      Toast.tsx ZoneBanner.tsx PopTexts.tsx LoadingBar.tsx DailyGift.tsx AttPrePrompt.tsx
    platform/                   ← game code never calls a plugin directly
      ads.ts purchases.ts save.ts cloudsave.ts haptics.ts gamecenter.ts consent.ts
  assets/                       ← only the .glb files used + processed textures + hdri + LICENSE files
  scripts/build-assets.mjs      ← GLB selection (from the allPaths list), PNG → RGBA/KTX2
  ios/                          ← committed; GameCenterModule.swift, CloudSaveModule.swift, PrivacyInfo.xcprivacy
  CREDITS.md
```

## 4. Setup from zero

```bash
npx @react-native-community/cli@latest init PawCrossing --directory . --skip-git-init
npm i three react-native-wgpu react-native-reanimated react-native-worklets \
  react-native-gesture-handler react-native-safe-area-context react-native-svg \
  phosphor-react-native react-native-audio-api react-native-mmkv react-native-fs \
  react-native-haptic-feedback react-native-permissions react-native-bootsplash zustand \
  react-native-purchases react-native-google-mobile-ads
npm i -D @types/three @gltf-transform/core @gltf-transform/cli sharp
cd ios && bundle install && bundle exec pod install
```

Bundle id: `com.emredardagan.pawcrossing` (must match App Store Connect). In Xcode, add the `assets/` folder as a **folder reference** (glb/hdr files are read from the MainBundle).

## 5. Porting steps (key conversions)

1. **Technical spike (first, 1–2 days):** one animated cube-pet + shadows + HDRI + ACES on react-native-wgpu; then the full scene (Neon City at night + storm) with an fps measurement on iPhone 11. Target 60 fps; if not reached, make Low quality the default.
2. `toybox.js` → `engine/`: `createStage` takes the RN wgpu context instead of a canvas; `resize` → `onLayout`; drop `addEventListener('resize')`.
3. Water + bubble `ShaderMaterial` → TSL (`time`, `positionWorld`, noise function, fresnel). No `#include <tonemapping_fragment>` needed.
4. `glowTexture` → plain JS `DataTexture`.
5. `Bursts` sprite pool unchanged (SpriteNodeMaterial or SpriteMaterial).
6. `rain` LineSegments unchanged.
7. All DOM access (`$('score').textContent` etc.) → events to the UI through `game/store.ts`; the UI only reads.
8. `store.get/set` → `platform/save.ts` (MMKV, versioned `paw.save` format; migrate from the web's `paw.*` keys, see §6.1).
9. `performance.now`, `requestAnimationFrame`, `Math.random` exist in RN — the loop stays on the JS thread.
10. Remove keyboard input; touch rules stay the same.
11. Remove the `index.html` link ("← All games"); add Settings/Shop buttons instead.

## 6. Platform layer API

```ts
// platform/ads.ts
initAds(): Promise<void>                  // UMP → (after first run) ATT → MobileAds().initialize()
canShowInterstitial(): boolean            // if no no_ads and caps allow it
maybeShowInterstitial(reason): Promise<void>
showRewarded(placement): Promise<boolean> // true only on the EARNED_REWARD event
rewardedReady(): boolean
// platform/purchases.ts
initPurchases(); getShopPackages(); buy(pkg); restore(); has(ent); onEntitlementsChanged(cb)
// platform/save.ts
loadSave(); save(patch); migrate(raw)
// platform/cloudsave.ts
pull(); push(save); merge(a, b); onExternalChange(cb)
// platform/haptics.ts
hop(); coin(); hit(); success()
// platform/gamecenter.ts
signIn(); submitBest(score); unlock(id); showLeaderboard()
```

RevenueCat: `Purchases.configure({ apiKey })`, `getOfferings`, `purchasePackage`, `getCustomerInfo`, `restorePurchases`, `addCustomerInfoUpdateListener`.
AdMob: `AdsConsent.requestInfoUpdate/loadAndShowConsentFormIfRequired`, `MobileAds().setRequestConfiguration({ maxAdContentRating: G })`, `InterstitialAd.createForAdRequest`, `RewardedAd.createForAdRequest` + `RewardedAdEventType.EARNED_REWARD`, `AdEventType.CLOSED` → preload the next ad.

## 6.1 Save and sync

The local store is **MMKV**. On its own it has one weakness: everything lives on one device. If the player deletes the app or moves to a new phone, the coins, the best score and the unlocked pets are gone. Non-consumables (Remove Ads, Paw Club, pet packs) come back through RevenueCat restore, but **consumable coin packs do not**, so a player could lose coins bought with real money. That is why save data is also synced through iCloud.

**Layers**

| Layer | What | Where |
| --- | --- | --- |
| 1. Local (source of truth while playing) | Everything, read and written synchronously | MMKV (`paw.*` keys) |
| 2. iCloud backup / cross-device | Progress and coin ledger | `NSUbiquitousKeyValueStore` (iCloud key-value store), small Swift TurboModule (`ios/CloudSaveModule.swift`) |
| 3. Purchases | Non-consumable entitlements | RevenueCat (restore) |
| 4. (Option) Server-side coins | Purchased coin balance | RevenueCat virtual currency, evaluated in milestone 4 |

**Save format (`paw.save`, versioned)**

```ts
type SaveV1 = {
  v: 1;                                   // paw.saveVersion: migrate on every format change
  best: number;
  owned: string[];                        // unlocked pets
  mlevel: number; missions: Mission[];
  coins: {                                // ledger, not a single balance
    earned: Record<DeviceId, number>;     // only grows; each device writes only its own key
    spent:  Record<DeviceId, number>;     // only grows; each device writes only its own key
    iap:    Record<TransactionId, number>;// purchased coin packs: transaction id → amount
  };
  daily: { lastClaimDay: string };
  stats: Record<string, number>;          // achievement counters (close calls, slides…)
  rcUserId: string;                       // stable RevenueCat app user id (see below)
};
// balance = Σearned + Σiap − Σspent
```

Device-only settings, never synced: `muted`, `haptics`, `quality`, selected pet, ad counters and the interstitial cooldown.

**Merge rules (local ⊕ iCloud)**, deterministic and order-independent, so two devices always end up in the same state:

- `best`, `mlevel`, `stats.*`, `daily.lastClaimDay` → **max**
- `owned` → **union**
- `coins.earned[d]`, `coins.spent[d]` → **per-key max** (each device only increases its own counters → no coins lost or duplicated)
- `coins.iap` → **union by transaction id** → a coin pack is never granted twice, not even across devices
- `missions` → taken from the side with the higher `mlevel` (if equal, the local side)

**Flow**

1. Launch: read MMKV → call `synchronize()` on iCloud → merge → write the result to both MMKV and iCloud.
2. While playing, only MMKV is written. iCloud is written at the end of a run, after a purchase, after a pet unlock and when the app goes to the background (debounced, avoids iCloud throttling).
3. On `NSUbiquitousKeyValueStoreDidChangeExternallyNotification`, the native module sends an event to JS → merge → UI updates.
4. iCloud signed out or full: the game keeps working on MMKV alone; it syncs automatically when iCloud comes back.
5. Coin pack purchase: after `purchasePackage` succeeds → write `iap[transactionId] = amount` → save immediately to MMKV + iCloud. On launch, `getCustomerInfo().nonSubscriptionTransactions` is checked for consumable transactions missing from the ledger, which are then granted (covers a crash mid-purchase).

**Stable RevenueCat user id:** on first launch a UUID is generated, stored in `rcUserId` and passed to `Purchases.configure({ appUserID })`. Because it is carried in iCloud, the same Apple ID gets the same RevenueCat customer on a new device. This is required if the virtual currency option is used.

**RevenueCat virtual currency (option, decided in milestone 4):** keeps the purchased coin balance on RevenueCat's servers, so it cannot be edited on the device. Coins earned in-game stay local plus iCloud, so the two balances must be shown and spent together. Before deciding, check the feature's current status (beta/GA), pricing and SDK API. If it is not a good fit, the iCloud ledger above already covers device changes and double grants.

**Limits:** iCloud KV allows 1 MB and 1,024 keys in total. This save is a few KB, so it fits easily. Requires the "iCloud → Key-value storage" capability in Xcode and on the App ID.

## 7. Products (RevenueCat + App Store Connect) — same as the existing plan

| Product | Type | Entitlement | Price |
| --- | --- | --- | --- |
| `remove_ads` | Non-consumable | `no_ads` | $2.99 |
| `paw_club` | Non-consumable | `no_ads` + `paw_club` | $6.99 |
| `pack_safari` | Non-consumable | `pack_safari` (lion, tiger, elephant, giraffe) | $1.99 |
| `pack_legendary` | Non-consumable | `pack_legendary` (caterpillar, fish + Golden Dog) | $3.99 |
| `coins_500/1500/4000` | Consumable | coins | $0.99 / $2.99 / $4.99 |

Paw Club: no interstitials, 2× coins (coins, gems, season bonus, mission rewards), daily gift ×3, Golden Dog, paw badge next to the score.
Rules: entitlements are the only source of truth; consumable coins are never granted twice (transaction id in the `coins.iap` ledger, synced via iCloud, §6.1); **Restore Purchases** in Settings; prices always come from the Offering (`priceString`), never hard-coded; one "default" Offering.

## 8. Ads (AdMob) — same as the existing plan

**Never** during a run. Rewarded: Continue (score ≥ 10, once per run, not for "Too slow", revive on the last safe tile with a 2 s shield — reuses the existing `rescue()` logic), Double coins, Shop +15 coins (5 per day), Daily gift ×2, Mission 2×. Interstitial: every 3rd finished run, ≥ 120 s since the last one, none in the first session or first 3 runs, none if a rewarded ad was watched on that screen. `no_ads` turns off all interstitials. Caps live in one config object, with overrides from RevenueCat Offering **metadata**. The loop and `Sfx` pause during ads. Google test IDs in Debug/TestFlight (`ca-app-pub-3940256099942544~1458002511`, `/4411468910`, `/1712485313`), real IDs in Release (via build config).

## 9. Privacy and compliance

Launch order: UMP form (EEA/UK) → after the first run, ATT pre-prompt + system ATT → `MobileAds().initialize()`. `Info.plist`: `GADApplicationIdentifier`, `NSUserTrackingUsageDescription`, `SKAdNetworkItems` (Google's current list). `PrivacyInfo.xcprivacy` (MMKV/UserDefaults, file timestamp APIs) and check that the SDKs ship their manifests. AdMob: max rating **G**, sensitive categories blocked, no child-directed tag. Privacy labels: identifiers/usage data for advertising, purchase history. iCloud KV data stays in the user's own iCloud and is not collected by us. Settings: sound, haptics, quality, restore, privacy choices (re-open the UMP form), credits.

## 10. Native polish

Game Center (`best_score` leaderboard; achievements: each season, first stampede, 10 slides on ice, full collection, 100 close calls). Haptics: light on hop, soft on coin, heavy on death, success on mission/purchase. Quality: **High** (AO on, 2048 shadows, pixelRatio 2) / **Low** (AO off, 1024 shadows, pixelRatio 1.5, fewer rain drops/particles), automatic per device. App icon, blue splash, status bar hidden during play, audio/loop stop when backgrounded.

## 11. Milestones (each ends with a TestFlight build)

| # | Milestone | Done when |
| --- | --- | --- |
| 0 | Accounts | Apple Dev, ASC record + products, RevenueCat project/entitlements/Offering, AdMob app + units |
| 1 | Spike | wgpu + three: animated pet, shadows, HDRI, on device; fps measured |
| 2 | Port | Whole game on device offline, identical to the web; split into modules; MMKV saves + `paw.save` v1; safe area, portrait, pause/resume; sound |
| 3 | Performance | Quality setting; 60 fps on iPhone 11 in Neon City at night in a storm |
| 4 | Purchases | Shop screen, all products in sandbox, live entitlements, restore, coins never double-granted; iCloud sync; virtual currency decision |
| 5 | Ads | UMP + ATT, Continue + Double coins, capped interstitials, `no_ads`, test IDs in debug |
| 6 | Paw Club + daily gift | All perks |
| 7 | Native polish | Game Center, haptics, icon, splash, Settings, Credits |
| 8 | Release | Screenshots (6.9" + 6.5"), preview video, description, privacy labels, review notes, submit |

## 12. Test checklist

- Fresh install: consent → first run → ATT pre-prompt → no interstitial in the first session
- All products with a StoreKit Configuration file, then a TestFlight sandbox tester
- Restore on a second device: non-consumables come back through RevenueCat; coins come back only through iCloud sync, not through restore
- Airplane mode: game fully playable, shop "offline", rewarded buttons hidden
- Interstitial caps: 3 runs / 120 s / none after a rewarded ad
- Continue: once per run, safe tile, shield; works on logs, ice and boats
- Backgrounding mid-hop / mid-ad / mid-purchase
- iPhone 11 and the newest device: fps, heat, memory (WebGPU texture/memory limits)
- Save survives an app update (`paw.save` version migration)
- Delete and reinstall / new device with the same Apple ID: coins (earned + bought), best, pets come back
- Two devices playing offline, then both online: merge gives the same result on both, no coins lost or duplicated
- iCloud signed out: game works, syncs when signed back in
- Crash mid coin purchase: coins granted once on next launch
- Side-by-side visual comparison with the web: every season, night, storm, blizzard, stampede, eagle

## 13. Risks / to verify

- Maturity of react-native-wgpu + three WebGPURenderer (shadows, SkinnedMesh, PostProcessing) → the spike (milestone 1) checks this early.
- WebGPU may be limited in the Simulator; real testing happens on devices.
- `react-native-audio-api` support for `exponentialRampToValueAtTime`, `BiquadFilter` → sound is also tried in the spike.
- Package versions (RN, wgpu, purchases, google-mobile-ads) — verify against current docs at install time.
- Google's current `SKAdNetworkItems` list.
- RevenueCat virtual currency: status, pricing and API (§6.1).
- iCloud KV sync latency and throttling (can take seconds to minutes; the merge must not depend on timing).

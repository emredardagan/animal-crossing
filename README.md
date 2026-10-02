# Paw Crossing (iOS)

Paw Crossing for iPhone: the three.js web game rebuilt in **bare React Native (no Expo)**, rendered with three.js `WebGPURenderer` on `react-native-webgpu` (Metal). Purchases go through **RevenueCat** and ads through **Google AdMob**.

| | |
| --- | --- |
| Plan | [Türkçe](docs/PAW-CROSSING-RN-IOS.tr.md) · [English](docs/PAW-CROSSING-RN-IOS.en.md) |
| Accounts and App Review | [Türkçe](docs/SETUP-ACCOUNTS.tr.md) · [English](docs/SETUP-ACCOUNTS.en.md) |

## Layout

```
App.tsx                 screens on top of the game canvas
src/engine/             toybox.js port: WebGPU stage (+GTAO), asset loading, particles, synth sound, TSL shaders
src/game/               config (data), Game.ts (the game, 1:1 with paw-crossing.html), ui.ts (game → React bridge)
src/ui/                 HUD, title, game over, shop, settings, daily gift, ATT explainer…
src/platform/           save (MMKV + iCloud ledger merge), purchases (RevenueCat), ads (AdMob/UMP/ATT), haptics, keys
ios/                    Xcode project (CloudSave.swift = iCloud key-value store)
assets/                 151 Kenney models, raw textures, HDRI, fonts (scripts/build-assets.mjs)
fastlane/               build → TestFlight → metadata → App Review; store texts and screenshots
scripts/asc-iap.mjs     creates the 7 in-app purchases through the App Store Connect API
docs/                   plans, account setup, privacy/support pages (GitHub Pages)
```

## Develop (on a Mac)

```bash
npm install
cd ios && bundle install && bundle exec pod install && cd ..
npm start            # Metro
npm run ios          # or open ios/PawCrossing.xcworkspace and run on a real iPhone (WebGPU needs a device)
```

`npm run assets` re-copies the models from a checkout of `opus-creative-htmls` next to this repo.

## Ship

GitHub → Actions → **iOS release** → lane `iap`, `beta`, `metadata` or `release`. Secrets and one-time account steps are in [SETUP-ACCOUNTS](docs/SETUP-ACCOUNTS.en.md).

## Checks

```bash
npx tsc --noEmit && npx jest && npx eslint .
```

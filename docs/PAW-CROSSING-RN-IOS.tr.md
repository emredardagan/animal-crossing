# Paw Crossing — Pure React Native (Expo'suz) iOS Planı

> English version: [PAW-CROSSING-RN-IOS.en.md](PAW-CROSSING-RN-IOS.en.md)

Paw Crossing, [`emredardagan/opus-creative-htmls`](https://github.com/emredardagan/opus-creative-htmls) reposundaki three.js web oyunu (`paw-crossing.html` + `assets/kit/toybox.js`). Bu doküman oyunun **birebir aynısını**, **Expo kullanmadan, bare React Native** ile, **sadece iOS** için yeniden yapmanın planıdır. Satın almalar **RevenueCat**, reklamlar **Google AdMob** ile. Ürün ve reklam kuralları mevcut [`PAW-CROSSING-IOS.md`](https://github.com/emredardagan/opus-creative-htmls/blob/main/PAW-CROSSING-IOS.md) (Capacitor planı) ile aynıdır; değişen, uygulamanın WebView yerine native React Native olmasıdır.

## 0. Kararlar

| Konu | Karar |
| --- | --- |
| Platform | Sadece iOS (iPhone öncelikli), dikey kilit, iOS 16+ |
| Yaklaşım | **Bare React Native** (`@react-native-community/cli init`), Expo/expo-modules yok, New Architecture |
| 3D | **three.js `WebGPURenderer` + `react-native-wgpu`** (Dawn → Metal). Oyun mantığı three.js olarak kalır |
| Satın alma | **RevenueCat** (`react-native-purchases`), sadece tek seferlik ürünler, abonelik yok |
| Reklam | **AdMob** (`react-native-google-mobile-ads`): rewarded + interstitial, banner yok |
| Ürün/reklam kuralları | `PAW-CROSSING-IOS.md` §6–§8 aynen korunur (Paw Club lifetime, coin paketleri, frekans limitleri) |
| Kategori | Games › Casual, 4+, Kids kategorisi değil |

## 1. Kaynak oyunun anatomisi (porta rehber)

`paw-crossing.html` bölümleri → hedef modüller:
- Sabitler/veriler: `PETS`, `STARTERS/RARE/LEGEND`, `price`, `CARS`, `TREES`, `ZONES` (6 sezon), `MISSIONS`, `DEATHS` → `src/game/config.ts`
- Satır üretimi: `pickType`, `makeRow` (grass/road/rush/herd/weeds/crabs/ice/rail/river+lily/boats), `cityBlock`, `addProp`, `ensureRows` → `world.ts`
- Oyuncu: `pl`, `hop`, `landed`, buz kayması, `supportAt`, `rescue`, `die` → `player.ts`
- Hareketliler/trenler/coin mıknatısı (tick içi) → `hazards.ts`
- Hava: `weatherAt`, `updateWeather` (gece, fırtına+şimşek, kar fırtınası, yağmur LineSegments, ateş böcekleri, yapraklar) → `weather.ts`
- Kartal: `buildEagle`, `updateEagle` → `eagle.ts`
- Görevler: `newMission/refreshMissions/track` → `missions.ts`
- Ekonomi: `bank`, `addCoins`, `unlockPet` → `economy.ts` (tüm coin matematiği + Paw Club 2× tek yerde)
- Döngü + kamera + gölge takibi + "Too slow" kontrolü → `loop.ts`
- `toybox.js`: `createStage`, `preload/loaded/cloneLoaded`, `Bursts`, `popText`, `Sfx`, `damp/easeOutBack`, `store` → `src/engine/*`

Kural: **önce davranışı birebir taşı, sonra özellik ekle.** Tüm sayılar (hız, olasılık, zamanlamalar) değişmeden kopyalanır.

## 2. Teknoloji yığını (Expo'suz)

| İhtiyaç | Web'deki | React Native karşılığı |
| --- | --- | --- |
| Render | `WebGLRenderer` + canvas | `react-native-wgpu` `<Canvas>` + `three/webgpu` `WebGPURenderer`, her frame sonrası `context.present()` |
| AO post-process | N8AO (postprocessing) | three TSL `PostProcessing` + `ao()` (GTAO) — sadece High kalite |
| Tone mapping/gölge | ACES, PCF 2048 | Aynı (WebGPURenderer destekler) |
| Özel shader'lar | `ShaderMaterial` (su, kalkan baloncuğu) | TSL `MeshBasicNodeMaterial` (`colorNode`), sis otomatik |
| Glow dokuları | `<canvas>` 2D gradient | JS'te hesaplanan `DataTexture` (64×64 RGBA) |
| GLB yükleme | `GLTFLoader.loadAsync(url)` | Dosyayı `ArrayBuffer` olarak oku (`react-native-fs`, MainBundle) → `GLTFLoader.parse` |
| PNG doku | tarayıcı decode | Build script ile `colormap.png` + parçacık PNG'leri **ham RGBA/KTX2**'ye çevrilir → `DataTexture`/`KTX2Loader` (LoadingManager handler) |
| HDRI | `HDRLoader` + PMREM | `.hdr` ArrayBuffer → `HDRLoader.parse` → `PMREMGenerator` |
| Ses (synth) | WebAudio | **`react-native-audio-api`** (Software Mansion, Web Audio API uyumlu: Oscillator, BiquadFilter, Gain, AudioBuffer) → `Sfx` neredeyse aynen |
| UI/HUD | HTML/CSS | RN bileşenleri + **Reanimated** (toast, zone banner, nope sallanması, glow, pop-in) |
| İkonlar | Phosphor web font | `phosphor-react-native` + `react-native-svg` |
| Font | Fredoka (Google Fonts) | Fredoka TTF'leri iOS bundle'ına (OFL) |
| popText | DOM + `project()` | Havuzlu `Animated.View` listesi; ekran koordinatları game loop'tan Reanimated shared value'ya yazılır |
| Girdi | pointer/keyboard | **react-native-gesture-handler**: Tap → ileri, Pan/Fling → yön (24 pt eşik aynen) |
| Kayıt | `localStorage` | **`react-native-mmkv`** (senkron → `store.get/set` aynı API) |
| Haptik | — | `react-native-haptic-feedback` |
| Safe area | `env(safe-area-inset-*)` | `react-native-safe-area-context` |
| Reduced motion | `matchMedia` | `AccessibilityInfo.isReduceMotionEnabled()` |
| Pause/resume | — | `AppState` → loop + ses durdur/başlat |
| Satın alma | — | `react-native-purchases` |
| Reklam + UMP | — | `react-native-google-mobile-ads` (`AdsConsent`) |
| ATT | — | `react-native-permissions` (`PERMISSIONS.IOS.APP_TRACKING_TRANSPARENCY`) |
| Game Center | — | Küçük Swift TurboModule (GameKit: auth, submitScore, reportAchievement, showLeaderboard) |
| Splash | — | `react-native-bootsplash` |

Metro: `unstable_enablePackageExports: true` (`three/webgpu`, `three/tsl`), `assetExts`'e `glb`, `hdr`, `ktx2`, `bin` eklenir. Kurulumdan önce her paketin güncel dokümanı/versiyonu kontrol edilir.

## 3. Repo yapısı

```
animal-crossing/
  app.json, index.js, metro.config.js, babel.config.js, tsconfig.json
  App.tsx                       ← SafeArea, GestureHandlerRoot, ekran yöneticisi
  src/
    engine/                     ← toybox.js portu
      stage.ts                  ← WebGPURenderer, ışıklar, sis, HDRI, PostProcessing(AO), followShadow, quality
      assets.ts                 ← preload/load/loaded/cloneLoaded (SkeletonUtils), bundle'dan okuma
      bursts.ts, sfx.ts, glow.ts, materials.ts (water/bubble TSL), math.ts
    game/
      config.ts world.ts player.ts hazards.ts weather.ts eagle.ts missions.ts economy.ts loop.ts
      store.ts                  ← oyun durumu → UI köprüsü (zustand, throttled)
    ui/
      GameCanvas.tsx            ← <Canvas> + gesture katmanı
      Hud.tsx TitleScreen.tsx GameOver.tsx Shop.tsx Settings.tsx Credits.tsx
      Toast.tsx ZoneBanner.tsx PopTexts.tsx LoadingBar.tsx DailyGift.tsx AttPrePrompt.tsx
    platform/                   ← oyun kodu plugin'leri asla doğrudan çağırmaz
      ads.ts purchases.ts save.ts haptics.ts gamecenter.ts consent.ts
  assets/                       ← sadece kullanılan .glb + işlenmiş dokular + hdri + LICENSE'lar
  scripts/build-assets.mjs      ← GLB seçimi (allPaths listesinden), PNG → RGBA/KTX2
  ios/                          ← commit edilir; GameCenterModule.swift, PrivacyInfo.xcprivacy
  CREDITS.md
```

## 4. Kurulum (sıfırdan)

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

Bundle id: `com.emredardagan.pawcrossing` (App Store Connect ile aynı). Xcode'da `assets/` klasörü **folder reference** olarak eklenir (glb/hdr dosyaları MainBundle'dan okunur).

## 5. Port adımları (kritik dönüşümler)

1. **Teknik spike (ilk iş, 1–2 gün):** react-native-wgpu üzerinde bir animasyonlu cube-pet + gölge + HDRI + ACES; ardından tam sahne (Neon City gece + fırtına) iPhone 11'de fps ölçümü. Hedef 60 fps; olmazsa Low kaliteyi varsayılan yap.
2. `toybox.js` → `engine/`: `createStage` canvas yerine RN wgpu context alır; `resize` → `onLayout`; `addEventListener('resize')` kaldırılır.
3. `ShaderMaterial` su + baloncuk → TSL (`time`, `positionWorld`, noise fonksiyonu, fresnel). `#include <tonemapping_fragment>` gerekmez.
4. `glowTexture` → saf JS `DataTexture`.
5. `Bursts` sprite havuzu aynen (SpriteNodeMaterial veya SpriteMaterial).
6. `rain` LineSegments aynen.
7. Tüm DOM erişimi (`$('score').textContent` vb.) → `game/store.ts` üzerinden UI'a event; UI sadece okur.
8. `store.get/set` → `platform/save.ts` (MMKV, aynı `paw.*` anahtarları).
9. `performance.now`, `requestAnimationFrame`, `Math.random` RN'de mevcut — döngü JS thread'inde kalır.
10. Klavye girdisi kaldırılır; dokunma kuralları aynen.
11. `index.html` linki ("← All games") kaldırılır; yerine Settings/Shop butonları.

## 6. Platform katmanı API

```ts
// platform/ads.ts
initAds(): Promise<void>                  // UMP → (ilk run sonrası) ATT → MobileAds().initialize()
canShowInterstitial(): boolean            // no_ads yoksa ve limitler uygunsa
maybeShowInterstitial(reason): Promise<void>
showRewarded(placement): Promise<boolean> // sadece EARNED_REWARD olayında true
rewardedReady(): boolean
// platform/purchases.ts
initPurchases(); getShopPackages(); buy(pkg); restore(); has(ent); onEntitlementsChanged(cb)
// platform/save.ts
loadSave(); save(patch)
// platform/haptics.ts
hop(); coin(); hit(); success()
// platform/gamecenter.ts
signIn(); submitBest(score); unlock(id); showLeaderboard()
```

RevenueCat: `Purchases.configure({ apiKey })`, `getOfferings`, `purchasePackage`, `getCustomerInfo`, `restorePurchases`, `addCustomerInfoUpdateListener`.
AdMob: `AdsConsent.requestInfoUpdate/loadAndShowConsentFormIfRequired`, `MobileAds().setRequestConfiguration({ maxAdContentRating: G })`, `InterstitialAd.createForAdRequest`, `RewardedAd.createForAdRequest` + `RewardedAdEventType.EARNED_REWARD`, `AdEventType.CLOSED` → sonraki reklamı preload.

## 7. Ürünler (RevenueCat + App Store Connect) — mevcut plan ile aynı

| Ürün | Tür | Entitlement | Fiyat |
| --- | --- | --- | --- |
| `remove_ads` | Non-consumable | `no_ads` | $2.99 |
| `paw_club` | Non-consumable | `no_ads` + `paw_club` | $6.99 |
| `pack_safari` | Non-consumable | `pack_safari` (lion, tiger, elephant, giraffe) | $1.99 |
| `pack_legendary` | Non-consumable | `pack_legendary` (caterpillar, fish + Golden Dog) | $3.99 |
| `coins_500/1500/4000` | Consumable | coin | $0.99 / $2.99 / $4.99 |

Paw Club: interstitial yok, 2× coin (coin, gem, sezon bonusu, görev ödülü), günlük hediye ×3, Golden Dog, skor yanında pati rozeti.
Kurallar: entitlement'lar tek doğruluk kaynağı; consumable coin'ler transaction id loglanarak (MMKV) asla iki kez verilmez; Settings'te **Restore Purchases**; fiyatlar her zaman Offering'den (`priceString`), asla hard-code değil; tek "default" Offering.

## 8. Reklamlar (AdMob) — mevcut plan ile aynı

Koşu sırasında **asla** reklam yok. Rewarded: Continue (skor ≥ 10, koşu başına 1, "Too slow" hariç, son güvenli kareye 2 sn kalkanla dirilt — mevcut `rescue()` mantığı yeniden kullanılır), Double coins, Shop +15 coin (günde 5), Günlük hediye ×2, Görev 2×. Interstitial: her 3. bitmiş koşu, son interstitial'dan ≥ 120 sn, ilk oturumda ve ilk 3 koşuda yok, o ekranda rewarded izlendiyse yok. `no_ads` tüm interstitial'ları kapatır. Limitler tek config objesinde; override'lar RevenueCat Offering **metadata**'sından. Reklam sırasında loop + `Sfx` durur. Debug/TestFlight'ta Google test ID'leri (`ca-app-pub-3940256099942544~1458002511`, `/4411468910`, `/1712485313`), release'te gerçek ID'ler (build config ile).

## 9. Gizlilik ve uyumluluk

Açılış sırası: UMP formu (EEA/UK) → ilk koşudan sonra ATT ön-ekranı + sistem ATT → `MobileAds().initialize()`. `Info.plist`: `GADApplicationIdentifier`, `NSUserTrackingUsageDescription`, `SKAdNetworkItems` (Google'ın güncel listesi). `PrivacyInfo.xcprivacy` (MMKV/UserDefaults, dosya zaman damgası API'leri) + SDK manifestlerinin varlığı kontrol edilir. AdMob: max rating **G**, hassas kategoriler engelli, child-directed tag yok. Privacy label'ları: reklam için tanımlayıcı/kullanım verisi, satın alma geçmişi. Settings: ses, haptik, kalite, restore, gizlilik seçimleri (UMP formunu yeniden aç), credits.

## 10. Native cila

Game Center (`best_score` leaderboard; başarımlar: her sezon, ilk stampede, buzda 10 kayma, tam koleksiyon, 100 close call). Haptik: hop hafif, coin soft, ölüm heavy, görev/satın alma success. Kalite: **High** (AO açık, 2048 gölge, pixelRatio 2) / **Low** (AO kapalı, 1024 gölge, pixelRatio 1.5, daha az yağmur/parçacık), cihaza göre otomatik. App icon, mavi splash, oyunda status bar gizli, arka plana geçince ses/loop durur.

## 11. Kilometre taşları (her biri TestFlight build ile biter)

| # | Taş | Bitti sayılır |
| --- | --- | --- |
| 0 | Hesaplar | Apple Dev, ASC kaydı + ürünler, RevenueCat proje/entitlement/Offering, AdMob app + unit'ler |
| 1 | Spike | wgpu + three: animasyonlu pet, gölge, HDRI, cihazda; fps ölçümü |
| 2 | Port | Tüm oyun cihazda offline, web ile birebir; modüllere bölünmüş; MMKV kayıt; safe area, portrait, pause/resume; ses |
| 3 | Performans | Kalite ayarı; iPhone 11'de Neon City gece+fırtınada 60 fps |
| 4 | Satın alma | Shop ekranı, sandbox'ta tüm ürünler, canlı entitlement, restore, coin çift verilmez |
| 5 | Reklamlar | UMP + ATT, Continue + Double coins, limitli interstitial, `no_ads`, debug'da test ID |
| 6 | Paw Club + günlük hediye | Tüm perkler |
| 7 | Native cila | Game Center, haptik, ikon, splash, Settings, Credits |
| 8 | Yayın | Ekran görüntüleri (6.9" + 6.5"), önizleme videosu, açıklama, privacy label, review notları, submit |

## 12. Test listesi

- Temiz kurulum: consent → ilk koşu → ATT ön-ekranı → ilk oturumda interstitial yok
- StoreKit Configuration dosyası ile tüm ürünler, sonra TestFlight sandbox tester
- İkinci cihazda restore: non-consumable'lar gelir, coin gelmez
- Uçak modu: oyun tamamen oynanır, shop "offline", rewarded butonları gizli
- Interstitial limitleri: 3 koşu / 120 sn / rewarded sonrası yok
- Continue: koşu başına 1, güvenli kare, kalkan; kütük, buz ve teknede çalışır
- Hop/reklam/satın alma ortasında arka plana alma
- iPhone 11 ve en yeni cihaz: fps, ısınma, bellek (WebGPU doku/bellek limitleri)
- Uygulama güncellemesinde kayıt korunur (MMKV `paw.*` anahtarları sabit)
- Web ile yan yana görsel karşılaştırma: her sezon, gece, fırtına, kar fırtınası, stampede, kartal

## 13. Riskler / doğrulanacaklar

- react-native-wgpu + three WebGPURenderer olgunluğu (shadow, SkinnedMesh, PostProcessing) → Spike (taş 1) bunu erken doğrular.
- Simulator'da WebGPU sınırlı olabilir; asıl test gerçek cihazda.
- `react-native-audio-api`'nin `exponentialRampToValueAtTime`, `BiquadFilter` desteği → spike'ta ses de denenir.
- Paket versiyonları (RN, wgpu, purchases, google-mobile-ads) — kurulum anında güncel dokümanlarla doğrula.
- Google'ın güncel `SKAdNetworkItems` listesi.


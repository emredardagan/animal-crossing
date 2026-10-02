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
| Kayıt | Yerelde MMKV + cihazlar arası iCloud key-value senkronu; coin'ler defter olarak tutulur, kaybolmaz ve kopyalanmaz (§6.1) |
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
| Kayıt | `localStorage` | **`react-native-mmkv`** (senkron → `store.get/set` aynı API) + iCloud key-value senkronu (bkz. §6.1) |
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
      ads.ts purchases.ts save.ts cloudsave.ts haptics.ts gamecenter.ts consent.ts
  assets/                       ← sadece kullanılan .glb + işlenmiş dokular + hdri + LICENSE'lar
  scripts/build-assets.mjs      ← GLB seçimi (allPaths listesinden), PNG → RGBA/KTX2
  ios/                          ← commit edilir; GameCenterModule.swift, CloudSaveModule.swift, PrivacyInfo.xcprivacy
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
8. `store.get/set` → `platform/save.ts` (MMKV, versiyonlu `paw.save` formatı; web'deki `paw.*` anahtarlarından migrate, bkz. §6.1).
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
loadSave(); save(patch); migrate(raw)
// platform/cloudsave.ts
pull(); push(save); merge(a, b); onExternalChange(cb)
// platform/haptics.ts
hop(); coin(); hit(); success()
// platform/gamecenter.ts
signIn(); submitBest(score); unlock(id); showLeaderboard()
```

RevenueCat: `Purchases.configure({ apiKey })`, `getOfferings`, `purchasePackage`, `getCustomerInfo`, `restorePurchases`, `addCustomerInfoUpdateListener`.
AdMob: `AdsConsent.requestInfoUpdate/loadAndShowConsentFormIfRequired`, `MobileAds().setRequestConfiguration({ maxAdContentRating: G })`, `InterstitialAd.createForAdRequest`, `RewardedAd.createForAdRequest` + `RewardedAdEventType.EARNED_REWARD`, `AdEventType.CLOSED` → sonraki reklamı preload.

## 6.1 Kayıt ve senkronizasyon

Yerel depo **MMKV**'dir. Tek başına bir zaafı var: her şey tek cihazda durur. Oyuncu uygulamayı silerse ya da yeni telefona geçerse coin'ler, rekor ve açılmış pet'ler kaybolur. Non-consumable ürünler (Remove Ads, Paw Club, pet paketleri) RevenueCat restore ile geri gelir, ama **consumable coin paketleri gelmez**. Yani oyuncu gerçek parayla aldığı coin'leri kaybedebilir. Bu yüzden kayıt verisi iCloud ile de senkronlanır.

**Katmanlar**

| Katman | Ne | Nerede |
| --- | --- | --- |
| 1. Yerel (oyun sırasında doğruluk kaynağı) | Her şey, senkron okuma/yazma | MMKV (`paw.*` anahtarları) |
| 2. iCloud yedek / cihazlar arası | İlerleme ve coin defteri | `NSUbiquitousKeyValueStore` (iCloud key-value store), küçük Swift TurboModule (`ios/CloudSaveModule.swift`) |
| 3. Satın almalar | Non-consumable entitlement'lar | RevenueCat (restore) |
| 4. (Opsiyon) Sunucu tarafı coin | Satın alınan coin bakiyesi | RevenueCat virtual currency, kilometre taşı 4'te değerlendirilir |

**Kayıt formatı (`paw.save`, versiyonlu)**

```ts
type SaveV1 = {
  v: 1;                                   // paw.saveVersion: her format değişikliğinde migrate
  best: number;
  owned: string[];                        // açılmış pet'ler
  mlevel: number; missions: Mission[];
  coins: {                                // tek bir bakiye değil, defter
    earned: Record<DeviceId, number>;     // sadece artar; her cihaz yalnızca kendi anahtarını yazar
    spent:  Record<DeviceId, number>;     // sadece artar; her cihaz yalnızca kendi anahtarını yazar
    iap:    Record<TransactionId, number>;// satın alınan coin paketleri: transaction id → miktar
  };
  daily: { lastClaimDay: string };
  stats: Record<string, number>;          // başarım sayaçları (close call, kayma…)
  rcUserId: string;                       // sabit RevenueCat app user id (aşağıda)
};
// bakiye = Σearned + Σiap − Σspent
```

Sadece cihaza ait, senkronlanmayan ayarlar: `muted`, `haptics`, `quality`, seçili pet, reklam sayaçları ve interstitial bekleme süresi.

**Birleştirme kuralları (yerel ⊕ iCloud)**: deterministik ve sıradan bağımsız, böylece iki cihaz her zaman aynı sonuca varır.

- `best`, `mlevel`, `stats.*`, `daily.lastClaimDay` → **max**
- `owned` → **birleşim**
- `coins.earned[d]`, `coins.spent[d]` → **anahtar başına max** (her cihaz sadece kendi sayaçlarını artırır → coin kaybolmaz, kopyalanmaz)
- `coins.iap` → **transaction id'ye göre birleşim** → bir coin paketi cihazlar arasında bile asla iki kez verilmez
- `missions` → `mlevel`'i yüksek olan taraftan alınır (eşitse yerel)

**Akış**

1. Açılış: MMKV oku → iCloud'da `synchronize()` çağır → birleştir → sonucu hem MMKV'ye hem iCloud'a yaz.
2. Oyun sırasında sadece MMKV yazılır. iCloud'a koşu sonunda, satın alma sonrası, pet açınca ve uygulama arka plana geçince yazılır (debounce'lu, iCloud throttling'inden kaçınır).
3. `NSUbiquitousKeyValueStoreDidChangeExternallyNotification` gelince native modül JS'e event gönderir → birleştir → UI güncellenir.
4. iCloud kapalı ya da dolu: oyun sadece MMKV ile çalışmaya devam eder; iCloud gelince otomatik senkronlanır.
5. Coin paketi satın alma: `purchasePackage` başarılı → `iap[transactionId] = miktar` yaz → hemen MMKV + iCloud'a kaydet. Açılışta `getCustomerInfo().nonSubscriptionTransactions` içinde defterde olmayan consumable işlem varsa verilir (satın alma ortasında çökme durumu).

**Sabit RevenueCat kullanıcı id'si:** ilk açılışta bir UUID üretilir, `rcUserId`'ye yazılır ve `Purchases.configure({ appUserID })` ile verilir. iCloud ile taşındığı için aynı Apple ID'nin yeni cihazında aynı RevenueCat müşterisi olur. Virtual currency opsiyonu kullanılacaksa bu şarttır.

**RevenueCat virtual currency (opsiyon, kilometre taşı 4'te karar):** satın alınan coin bakiyesini RevenueCat sunucusunda tutar; cihazda düzenlenemez. Oyunda kazanılan coin'ler yerel + iCloud'da kalır, dolayısıyla iki bakiye birlikte gösterilip harcanmalıdır. Karar öncesi özelliğin güncel durumu (beta/GA), fiyatı ve SDK API'si kontrol edilir. Uygun değilse yukarıdaki iCloud defteri cihaz değişimini ve çift vermeyi zaten çözer.

**Limitler:** iCloud KV toplam 1 MB ve 1.024 anahtar. Bu kayıt birkaç KB, rahatça sığar. Xcode'da ve App ID'de "iCloud → Key-value storage" capability gerekir.

## 7. Ürünler (RevenueCat + App Store Connect) — mevcut plan ile aynı

| Ürün | Tür | Entitlement | Fiyat |
| --- | --- | --- | --- |
| `remove_ads` | Non-consumable | `no_ads` | $2.99 |
| `paw_club` | Non-consumable | `no_ads` + `paw_club` | $6.99 |
| `pack_safari` | Non-consumable | `pack_safari` (lion, tiger, elephant, giraffe) | $1.99 |
| `pack_legendary` | Non-consumable | `pack_legendary` (caterpillar, fish + Golden Dog) | $3.99 |
| `coins_500/1500/4000` | Consumable | coin | $0.99 / $2.99 / $4.99 |

Paw Club: interstitial yok, 2× coin (coin, gem, sezon bonusu, görev ödülü), günlük hediye ×3, Golden Dog, skor yanında pati rozeti.
Kurallar: entitlement'lar tek doğruluk kaynağı; consumable coin'ler asla iki kez verilmez (transaction id `coins.iap` defterinde, iCloud ile senkron, §6.1); Settings'te **Restore Purchases**; fiyatlar her zaman Offering'den (`priceString`), asla hard-code değil; tek "default" Offering.

## 8. Reklamlar (AdMob) — mevcut plan ile aynı

Koşu sırasında **asla** reklam yok. Rewarded: Continue (skor ≥ 10, koşu başına 1, "Too slow" hariç, son güvenli kareye 2 sn kalkanla dirilt — mevcut `rescue()` mantığı yeniden kullanılır), Double coins, Shop +15 coin (günde 5), Günlük hediye ×2, Görev 2×. Interstitial: her 3. bitmiş koşu, son interstitial'dan ≥ 120 sn, ilk oturumda ve ilk 3 koşuda yok, o ekranda rewarded izlendiyse yok. `no_ads` tüm interstitial'ları kapatır. Limitler tek config objesinde; override'lar RevenueCat Offering **metadata**'sından. Reklam sırasında loop + `Sfx` durur. Debug/TestFlight'ta Google test ID'leri (`ca-app-pub-3940256099942544~1458002511`, `/4411468910`, `/1712485313`), release'te gerçek ID'ler (build config ile).

## 9. Gizlilik ve uyumluluk

Açılış sırası: UMP formu (EEA/UK) → ilk koşudan sonra ATT ön-ekranı + sistem ATT → `MobileAds().initialize()`. `Info.plist`: `GADApplicationIdentifier`, `NSUserTrackingUsageDescription`, `SKAdNetworkItems` (Google'ın güncel listesi). `PrivacyInfo.xcprivacy` (MMKV/UserDefaults, dosya zaman damgası API'leri) + SDK manifestlerinin varlığı kontrol edilir. AdMob: max rating **G**, hassas kategoriler engelli, child-directed tag yok. Privacy label'ları: reklam için tanımlayıcı/kullanım verisi, satın alma geçmişi. iCloud KV verisi kullanıcının kendi iCloud'unda kalır, bizim tarafımızdan toplanmaz. Settings: ses, haptik, kalite, restore, gizlilik seçimleri (UMP formunu yeniden aç), credits.

## 10. Native cila

Game Center (`best_score` leaderboard; başarımlar: her sezon, ilk stampede, buzda 10 kayma, tam koleksiyon, 100 close call). Haptik: hop hafif, coin soft, ölüm heavy, görev/satın alma success. Kalite: **High** (AO açık, 2048 gölge, pixelRatio 2) / **Low** (AO kapalı, 1024 gölge, pixelRatio 1.5, daha az yağmur/parçacık), cihaza göre otomatik. App icon, mavi splash, oyunda status bar gizli, arka plana geçince ses/loop durur.

## 11. Kilometre taşları (her biri TestFlight build ile biter)

| # | Taş | Bitti sayılır |
| --- | --- | --- |
| 0 | Hesaplar | Apple Dev, ASC kaydı + ürünler, RevenueCat proje/entitlement/Offering, AdMob app + unit'ler |
| 1 | Spike | wgpu + three: animasyonlu pet, gölge, HDRI, cihazda; fps ölçümü |
| 2 | Port | Tüm oyun cihazda offline, web ile birebir; modüllere bölünmüş; MMKV kayıt + `paw.save` v1; safe area, portrait, pause/resume; ses |
| 3 | Performans | Kalite ayarı; iPhone 11'de Neon City gece+fırtınada 60 fps |
| 4 | Satın alma | Shop ekranı, sandbox'ta tüm ürünler, canlı entitlement, restore, coin çift verilmez; iCloud senkronu; virtual currency kararı |
| 5 | Reklamlar | UMP + ATT, Continue + Double coins, limitli interstitial, `no_ads`, debug'da test ID |
| 6 | Paw Club + günlük hediye | Tüm perkler |
| 7 | Native cila | Game Center, haptik, ikon, splash, Settings, Credits |
| 8 | Yayın | Ekran görüntüleri (6.9" + 6.5"), önizleme videosu, açıklama, privacy label, review notları, submit |

## 12. Test listesi

- Temiz kurulum: consent → ilk koşu → ATT ön-ekranı → ilk oturumda interstitial yok
- StoreKit Configuration dosyası ile tüm ürünler, sonra TestFlight sandbox tester
- İkinci cihazda restore: non-consumable'lar RevenueCat ile gelir; coin'ler restore ile değil, sadece iCloud senkronu ile gelir
- Uçak modu: oyun tamamen oynanır, shop "offline", rewarded butonları gizli
- Interstitial limitleri: 3 koşu / 120 sn / rewarded sonrası yok
- Continue: koşu başına 1, güvenli kare, kalkan; kütük, buz ve teknede çalışır
- Hop/reklam/satın alma ortasında arka plana alma
- iPhone 11 ve en yeni cihaz: fps, ısınma, bellek (WebGPU doku/bellek limitleri)
- Uygulama güncellemesinde kayıt korunur (`paw.save` versiyon migrasyonu)
- Sil-yeniden kur / aynı Apple ID ile yeni cihaz: coin'ler (kazanılan + satın alınan), rekor, pet'ler geri gelir
- İki cihaz offline oynayıp sonra online: birleştirme iki cihazda da aynı sonucu verir, coin kaybolmaz/kopyalanmaz
- iCloud kapalı: oyun çalışır, tekrar açılınca senkronlanır
- Coin satın alma ortasında çökme: bir sonraki açılışta coin bir kez verilir
- Web ile yan yana görsel karşılaştırma: her sezon, gece, fırtına, kar fırtınası, stampede, kartal

## 13. Riskler / doğrulanacaklar

- react-native-wgpu + three WebGPURenderer olgunluğu (shadow, SkinnedMesh, PostProcessing) → Spike (taş 1) bunu erken doğrular.
- Simulator'da WebGPU sınırlı olabilir; asıl test gerçek cihazda.
- `react-native-audio-api`'nin `exponentialRampToValueAtTime`, `BiquadFilter` desteği → spike'ta ses de denenir.
- Paket versiyonları (RN, wgpu, purchases, google-mobile-ads) — kurulum anında güncel dokümanlarla doğrula.
- Google'ın güncel `SKAdNetworkItems` listesi.
- RevenueCat virtual currency: durum, fiyat ve API (§6.1).
- iCloud KV senkron gecikmesi ve throttling (saniyeler–dakikalar sürebilir; birleştirme zamanlamaya bağlı olmamalı).


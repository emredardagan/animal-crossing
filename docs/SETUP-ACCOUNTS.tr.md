# Paw Crossing: Hesaplar ve App Review'a gönderim

Kod, build ve gönderim hattı hazır. Bu listede **yalnızca senin yapabileceğin** adımlar var: hesaplara giriş, sözleşmeler, ödeme bilgisi ve anahtar oluşturma. Sırayla ilerle. Her adımın sonunda neyi nereye yapıştıracağın yazıyor.

> Oturumu kendi Mac'inde açarsan (Claude Desktop ya da repo klasöründe `claude remote-control`), 7. adımdaki build'i Xcode'unla da alabilirim. GitHub Actions yolu Mac gerektirmez.

## 1. Apple Developer ve App Store Connect

1. **Apple Developer Program** üyeliği aktif olmalı (developer.apple.com → Account).
2. **Team ID**: developer.apple.com → Account → Membership details → *Team ID* (10 karakter). → GitHub secret `APPLE_TEAM_ID`
3. **Sözleşmeler**: App Store Connect → Business (Agreements, Tax, and Banking) → **Paid Apps** sözleşmesini kabul et, banka ve vergi formlarını doldur. Bu yapılmadan uygulama içi satın almalar sandbox'ta bile çalışmaz.
4. **Bundle ID**: developer.apple.com → Certificates, IDs & Profiles → Identifiers → **+** → App IDs → App:
   - Description: `Paw Crossing`
   - Bundle ID (Explicit): `com.emredardagan.pawcrossing`
   - Capabilities: **iCloud** (yanındaki kutu; "Include CloudKit support" seçme) ve **In-App Purchase** (varsayılan olarak açık).
5. **Uygulama kaydı**: App Store Connect → Apps → **+** → New App:
   - Platform iOS, Name `Paw Crossing` (alınmışsa `Paw Crossing: Hop` gibi bir isim seç ve `fastlane/metadata/en-US/name.txt` dosyasını da güncelle)
   - Primary language English (U.S.), Bundle ID `com.emredardagan.pawcrossing`, SKU `pawcrossing-ios`, User access: Full Access
6. **API anahtarı** (build, TestFlight, ürünler ve gönderim için):
   - App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → **+**
   - Name `paw-ci`, Access **Admin**. Xcode'un imzalama sertifikasını ve profili kendisinin oluşturabilmesi için Admin gerekiyor.
   - `.p8` dosyasını indir. Bu dosya yalnızca bir kez indirilebilir.
   - Secret'lar:
     - `ASC_KEY_ID`: Key ID
     - `ASC_ISSUER_ID`: sayfanın üstündeki Issuer ID
     - `ASC_KEY_P8`: `base64 -i AuthKey_XXXX.p8 | pbcopy` çıktısı (Windows'ta `certutil -encode`)
7. **Uygulama gizliliği** (API ile doldurulamıyor, elle doldurulacak): App Store Connect → uygulama → App Privacy:
   - Privacy Policy URL: `https://emredardagan.github.io/animal-crossing/privacy.html`
   - Data collection: **Yes**. Google AdMob'un önerdiği tipler:

     | Veri | Amaç | Kimliğe bağlı mı | Takip |
     | --- | --- | --- | --- |
     | Identifiers › Device ID | Third-Party Advertising, Analytics | Hayır | **Evet** |
     | Usage Data › Product Interaction, Advertising Data | Third-Party Advertising, Analytics | Hayır | **Evet** |
     | Location › Coarse Location | Third-Party Advertising | Hayır | **Evet** |
     | Diagnostics › Crash Data, Performance Data, Other Diagnostic Data | Analytics | Hayır | Hayır |
     | Purchases › Purchase History | App Functionality (RevenueCat) | Hayır | Hayır |

8. **Fiyat ve ülkeler**: Pricing and Availability → **Free**, tüm ülkeler.
9. **Sandbox test hesabı**: Users and Access → Sandbox → Test Accounts → **+**. Satın almaları telefonda bununla denersin.

## 2. RevenueCat

1. app.revenuecat.com → **Create project** `Paw Crossing`.
2. Project → Apps → **+ App Store**:
   - Bundle ID `com.emredardagan.pawcrossing`
   - **In-App Purchase Key**: App Store Connect → Users and Access → Integrations → **In-App Purchase** → **+** ile oluştur ve `.p8` dosyasını, Key ID'yi ve Issuer ID'yi RevenueCat'e yükle.
   - İstersen ürünleri otomatik içe aktarmak için 1.6'daki API anahtarını da ekle.
3. **Products**: 4. adımda `iap` lane'i çalıştıktan sonra Product catalog → Products → Import ile 7 ürünü içe al: `paw_club`, `remove_ads`, `pack_safari`, `pack_legendary`, `coins_500`, `coins_1500`, `coins_4000`.
4. **Entitlements** (isimler birebir aynı olmalı):
   - `no_ads` ← `remove_ads`, `paw_club`
   - `paw_club` ← `paw_club`
   - `pack_safari` ← `pack_safari`
   - `pack_legendary` ← `pack_legendary`
   - Coin paketleri hiçbir entitlement'a bağlanmaz.
5. **Offerings**: `default` adında bir offering oluştur, **Current** yap ve 7 ürünün her birini bir package olarak ekle (Custom identifier: ürün id'si). Reklam limitlerini uzaktan değiştirmek istersen offering **Metadata**'sına şöyle bir JSON ekleyebilirsin: `{"ads": {"interstitialEveryRuns": 3}}`.
6. Project settings → API keys → **Public app-specific key** (`appl_...`) → `src/platform/keys.ts` → `revenueCatIos`.

## 3. Google AdMob

1. admob.google.com → Apps → **Add app** → iOS → "Is the app listed on a supported app store?" **No** → adı `Paw Crossing`. Uygulama yayına girince App Store'daki kaydıyla bağla.
2. **App ID** (`ca-app-pub-…~…`) iki yere yazılır:
   - `app.json` → `react-native-google-mobile-ads.ios_app_id`
   - `ios/PawCrossing/Info.plist` → `GADApplicationIdentifier`
3. Ad units → **Rewarded** ve **Interstitial** oluştur → `src/platform/keys.ts` → `admob.rewarded`, `admob.interstitial`.
   - Debug build her zaman Google'ın test reklamlarını kullanır.
   - Release build gerçek ID'ler girilmeden reklam göstermez.
4. Privacy & messaging → **European regulations** → mesaj oluştur, uygulamayı seç ve yayınla. İstersen **IDFA explainer** da ekleyebilirsin. Bu yapılmazsa UMP formu çıkmaz.
5. Blocking controls → Sensitive categories → hassas kategorileri kapat. App settings → Max ad content rating **G** (kod da `G` istiyor).
6. Google'ın güncel **SKAdNetwork** listesini (developers.google.com/admob/ios/3p-skadnetworks) `app.json` → `sk_ad_network_items` ve `Info.plist` → `SKAdNetworkItems` alanlarına ekle. Şu an sadece Google'ın kendi kimliği var.
7. `app-ads.txt`: AdMob'un verdiği satırı geliştirici sitenin köküne koy (örneğin `emredardagan.github.io` reposunun köküne `app-ads.txt`).

## 4. GitHub

1. Repo → Settings → Secrets and variables → Actions → New repository secret:
   - Anahtarlar: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID`
   - App Review iletişim bilgileri: `REVIEW_FIRST_NAME`, `REVIEW_LAST_NAME`, `REVIEW_PHONE` (`+90…` formatında), `REVIEW_EMAIL`
2. Bu branch'i `main`'e merge et. GitHub, `workflow_dispatch` ile tetiklenen workflow'ları yalnızca varsayılan branch'te gösterir.
3. Settings → Pages → Source: *Deploy from a branch* → `main` / `/docs`. Gizlilik ve destek sayfaları `https://emredardagan.github.io/animal-crossing/` altında yayınlanır.

## 5. Gönderim (Actions → iOS release → Run workflow)

| Sıra | Lane | Ne yapar |
| --- | --- | --- |
| 1 | `iap` | 7 ürünü App Store Connect'te oluşturur: isim, açıklama, ABD fiyatı, tüm ülkeler |
| 2 | `beta` | İmzalı build alır ve TestFlight'a yükler (~25 dk) |
| 3 | — | Telefonda TestFlight'tan kur, sandbox hesabıyla satın almaları ve reklamları dene. **Mağaza ekranının ekran görüntüsünü** al, `fastlane/iap-review.png` olarak repoya ekle ve `iap` lane'ini tekrar çalıştır (Apple her ürün için bir inceleme görüntüsü istiyor). |
| 4 | `metadata` | Açıklama, anahtar kelimeler, ekran görüntüleri, yaş derecesi ve inceleme notlarını yükler |
| 5 | `release` | Build alır, işlenmesini bekler ve **App Review'a gönderir** (onaydan sonra yayını elle başlatırsın) |

**İlk gönderim için not:** İlk uygulama içi ürünler sürümle birlikte incelenir. `release` lane'inden önce App Store Connect'te sürüm sayfasındaki **In-App Purchases** bölümünde 7 ürünün seçili olduğundan emin ol. Script göndermeyi dener; Apple reddederse ürünleri bu sayfadan elle ekle.

## Notlar

- **Yaş derecesi**: `fastlane/rating_config.json` arabaların hayvanları "ezmesini" *Infrequent/Mild Cartoon Violence* olarak beyan ediyor (Crossy Road gibi). Sonuç büyük ihtimalle 9+ olur. 4+ istersen `violenceCartoonOrFantasy` değerini `NONE` yapabilirsin, ama dürüst beyan red riskini azaltır.
- **Telif**: `fastlane/metadata/copyright.txt` dosyasında `2026 Emre Dardagan` yazıyor, gerekirse düzelt.
- **Ekran görüntüleri** `fastlane/screenshots/en-US/` klasöründe. Oyunun aynı three.js sahnesi web build'inden render edildi. Telefondan alınmış görüntülerle değiştirmen tavsiye edilir: aynı isim ve 1320×2868 boyut.

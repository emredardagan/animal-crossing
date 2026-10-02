# Paw Crossing: accounts and App Review submission

The code, build and submission pipeline are ready. This list covers only the steps **only you can do**: signing in, agreements, banking and creating keys. Go in order. Each step says what to paste where.

> If you open this session on your own Mac (Claude Desktop, or `claude remote-control` in the repo folder), step 5's build can also run through your Xcode. The GitHub Actions route needs no Mac.

## 1. Apple Developer and App Store Connect

1. Your **Apple Developer Program** membership is active (developer.apple.com → Account).
2. **Team ID**: developer.apple.com → Account → Membership details → *Team ID* (10 characters). → GitHub secret `APPLE_TEAM_ID`
3. **Agreements**: App Store Connect → Business (Agreements, Tax, and Banking) → accept the **Paid Apps** agreement and fill in banking and tax. Without this, in-app purchases do not work, not even in the sandbox.
4. **Bundle ID**: developer.apple.com → Certificates, IDs & Profiles → Identifiers → **+** → App IDs → App:
   - Description: `Paw Crossing`
   - Bundle ID (Explicit): `com.emredardagan.pawcrossing`
   - Capabilities: **iCloud** (tick the box; do not tick "Include CloudKit support") and **In-App Purchase** (on by default).
5. **App record**: App Store Connect → Apps → **+** → New App:
   - Platform iOS, Name `Paw Crossing` (if it is taken, pick one like `Paw Crossing: Hop` and also update `fastlane/metadata/en-US/name.txt`)
   - Primary language English (U.S.), Bundle ID `com.emredardagan.pawcrossing`, SKU `pawcrossing-ios`, User access: Full Access
6. **API key** (for builds, TestFlight, products and submission):
   - App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → **+**
   - Name `paw-ci`, Access **Admin**. Admin is required so Xcode can create the signing certificate and profile itself.
   - Download the `.p8` file. You can only download it once.
   - Secrets:
     - `ASC_KEY_ID`: the Key ID
     - `ASC_ISSUER_ID`: the Issuer ID at the top of the page
     - `ASC_KEY_P8`: the output of `base64 -i AuthKey_XXXX.p8 | pbcopy` (on Windows, `certutil -encode`)
7. **App Privacy** (not available through the API, so fill it in by hand): App Store Connect → app → App Privacy:
   - Privacy Policy URL: `https://emredardagan.github.io/animal-crossing/privacy.html`
   - Data collection: **Yes**. These are the types Google AdMob recommends:

     | Data | Purpose | Linked to user | Tracking |
     | --- | --- | --- | --- |
     | Identifiers › Device ID | Third-Party Advertising, Analytics | No | **Yes** |
     | Usage Data › Product Interaction, Advertising Data | Third-Party Advertising, Analytics | No | **Yes** |
     | Location › Coarse Location | Third-Party Advertising | No | **Yes** |
     | Diagnostics › Crash Data, Performance Data, Other Diagnostic Data | Analytics | No | No |
     | Purchases › Purchase History | App Functionality (RevenueCat) | No | No |

8. **Price and availability**: Pricing and Availability → **Free**, all countries.
9. **Sandbox tester**: Users and Access → Sandbox → Test Accounts → **+**. Use it to test purchases on your phone.

## 2. RevenueCat

1. app.revenuecat.com → **Create project** `Paw Crossing`.
2. Project → Apps → **+ App Store**:
   - Bundle ID `com.emredardagan.pawcrossing`
   - **In-App Purchase Key**: create one in App Store Connect → Users and Access → Integrations → **In-App Purchase** → **+**, then upload the `.p8`, Key ID and Issuer ID to RevenueCat.
   - Optionally add the API key from step 1.6 so RevenueCat can import products automatically.
3. **Products**: after the `iap` lane has run (section 5), go to Product catalog → Products → Import and import all 7: `paw_club`, `remove_ads`, `pack_safari`, `pack_legendary`, `coins_500`, `coins_1500`, `coins_4000`.
4. **Entitlements** (the names must match exactly):
   - `no_ads` ← `remove_ads`, `paw_club`
   - `paw_club` ← `paw_club`
   - `pack_safari` ← `pack_safari`
   - `pack_legendary` ← `pack_legendary`
   - Coin packs are not attached to any entitlement.
5. **Offerings**: create an offering named `default`, make it **Current**, and add each of the 7 products as a package (Custom identifier: the product id). To change ad limits remotely, you can add JSON like this to the offering's **Metadata**: `{"ads": {"interstitialEveryRuns": 3}}`.
6. Project settings → API keys → **Public app-specific key** (`appl_...`) → `src/platform/keys.ts` → `revenueCatIos`.

## 3. Google AdMob

1. admob.google.com → Apps → **Add app** → iOS → "Is the app listed on a supported app store?" **No** → name it `Paw Crossing`. Once the app is live, link it to its App Store listing.
2. The **App ID** (`ca-app-pub-…~…`) goes in two places:
   - `app.json` → `react-native-google-mobile-ads.ios_app_id`
   - `ios/PawCrossing/Info.plist` → `GADApplicationIdentifier`
3. Ad units → create a **Rewarded** and an **Interstitial** unit → `src/platform/keys.ts` → `admob.rewarded`, `admob.interstitial`.
   - Debug builds always use Google's test ads.
   - Release builds show no ads until the real IDs are filled in.
4. Privacy & messaging → **European regulations** → create a message, select the app and publish it. You can also add an **IDFA explainer**. Without this, the UMP form never appears.
5. Blocking controls → Sensitive categories → turn off the sensitive categories. App settings → Max ad content rating **G** (the code also requests `G`).
6. Add Google's current **SKAdNetwork** list (developers.google.com/admob/ios/3p-skadnetworks) to `app.json` → `sk_ad_network_items` and to `Info.plist` → `SKAdNetworkItems`. Right now only Google's own identifier is there.
7. `app-ads.txt`: put the line AdMob gives you at the root of your developer website (for example `app-ads.txt` at the root of your `emredardagan.github.io` repo).

## 4. GitHub

1. Repo → Settings → Secrets and variables → Actions → New repository secret:
   - Keys: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID`
   - App Review contact details: `REVIEW_FIRST_NAME`, `REVIEW_LAST_NAME`, `REVIEW_PHONE` (in `+90…` format), `REVIEW_EMAIL`
2. Merge this branch into `main`. GitHub only lists `workflow_dispatch` workflows that are on the default branch.
3. Settings → Pages → Source: *Deploy from a branch* → `main` / `/docs`. The privacy and support pages are published under `https://emredardagan.github.io/animal-crossing/`.

## 5. Shipping (Actions → iOS release → Run workflow)

| Order | Lane | What it does |
| --- | --- | --- |
| 1 | `iap` | Creates the 7 products in App Store Connect: name, description, US price, all countries |
| 2 | `beta` | Builds a signed build and uploads it to TestFlight (~25 min) |
| 3 | — | Install it from TestFlight on your phone and try purchases (with the sandbox tester) and ads. **Take a screenshot of the shop**, commit it as `fastlane/iap-review.png`, and run `iap` again (Apple wants a review image for each product). |
| 4 | `metadata` | Uploads the description, keywords, screenshots, age rating and review notes |
| 5 | `release` | Builds, waits for processing and **submits for App Review** (you start the release by hand after approval) |

**Note for the first submission:** the first in-app purchases are reviewed together with the app version. Before running `release`, check in App Store Connect that all 7 products are selected under **In-App Purchases** on the version page. The script tries to submit them; if Apple refuses, add them by hand on that page.

## Notes

- **Age rating**: `fastlane/rating_config.json` declares cars "squashing" animals as *Infrequent/Mild Cartoon Violence* (like Crossy Road). The result will most likely be 9+. If you want 4+, you can set `violenceCartoonOrFantasy` to `NONE`, but an honest declaration lowers the risk of rejection.
- **Copyright**: `fastlane/metadata/copyright.txt` says `2026 Emre Dardagan`. Change it if needed.
- **Screenshots** are in `fastlane/screenshots/en-US/`. They were rendered from the web build of the same three.js scene. Replacing them with captures from your phone is recommended: same file names, 1320×2868.

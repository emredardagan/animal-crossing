// Creates (or completes) Paw Crossing's in-app purchases in App Store Connect through the official API:
// product, en-US name/description, US base price, availability everywhere and the review screenshot.
// Safe to re-run: anything that already exists is left alone.
//
//   ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_KEY_P8=<base64 .p8> node scripts/asc-iap.mjs [--screenshot shop.png] [--submit]
//
// The app record (bundle id com.emredardagan.pawcrossing) must already exist in App Store Connect.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const BUNDLE_ID = 'com.emredardagan.pawcrossing';
export const PRODUCTS = [
  { productId: 'paw_club', type: 'NON_CONSUMABLE', price: '6.99', name: 'Paw Club', description: 'No ads, 2x coins, Golden Dog, triple daily gift.' },
  { productId: 'remove_ads', type: 'NON_CONSUMABLE', price: '2.99', name: 'Remove Ads', description: 'No more ads between runs.' },
  { productId: 'pack_safari', type: 'NON_CONSUMABLE', price: '1.99', name: 'Safari Pack', description: 'Unlock the lion, tiger, elephant and giraffe.' },
  { productId: 'pack_legendary', type: 'NON_CONSUMABLE', price: '3.99', name: 'Legendary Pack', description: 'The caterpillar, the fish and the Golden Dog.' },
  { productId: 'coins_500', type: 'CONSUMABLE', price: '0.99', name: '500 Coins', description: 'A pouch of 500 coins for new pets.' },
  { productId: 'coins_1500', type: 'CONSUMABLE', price: '2.99', name: '1,500 Coins', description: 'A bag of 1,500 coins for new pets.' },
  { productId: 'coins_4000', type: 'CONSUMABLE', price: '4.99', name: '4,000 Coins', description: 'A chest of 4,000 coins for new pets.' },
];

const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const SCREENSHOT = arg('--screenshot');
const SUBMIT = process.argv.includes('--submit');

function token() {
  const key = crypto.createPrivateKey(Buffer.from(process.env.ASC_KEY_P8 ?? '', 'base64').toString('utf8'));
  const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = enc({ alg: 'ES256', kid: process.env.ASC_KEY_ID, typ: 'JWT' });
  const body = enc({ iss: process.env.ASC_ISSUER_ID, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${head}.${body}.${sig}`;
}

async function api(method, url, body) {
  const res = await fetch(url.startsWith('http') ? url : `https://api.appstoreconnect.apple.com${url}`, {
    method, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${json.errors?.map(e => e.detail ?? e.title).join('; ') ?? text}`);
  return json;
}
async function all(url) {
  const out = [];
  for (let next = url; next;) { const r = await api('GET', next); out.push(...r.data); next = r.links?.next; }
  return out;
}

for (const v of ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8']) if (!process.env[v]) { console.error(`Missing ${v}`); process.exit(1); }

const app = (await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE_ID}`)).data[0];
if (!app) { console.error(`No App Store Connect app with bundle id ${BUNDLE_ID}. Create it first (docs/SETUP-ACCOUNTS).`); process.exit(1); }
console.log(`App ${app.attributes.name} (${app.id})`);

const existing = await all(`/v1/apps/${app.id}/inAppPurchasesV2?limit=200`);
const territories = (await all('/v1/territories?limit=200')).map(t => ({ type: 'territories', id: t.id }));

for (const p of PRODUCTS) {
  let iap = existing.find(e => e.attributes.productId === p.productId);
  if (!iap) {
    iap = (await api('POST', '/v2/inAppPurchases', { data: {
      type: 'inAppPurchases',
      attributes: { name: p.name, productId: p.productId, inAppPurchaseType: p.type, familySharable: false,
        reviewNote: 'Open the shop (storefront button on the title screen) to buy. Restore is in Settings.' },
      relationships: { app: { data: { type: 'apps', id: app.id } } },
    } })).data;
    console.log(`+ ${p.productId} created`);
  } else console.log(`= ${p.productId} exists (${iap.attributes.state})`);
  const id = iap.id;

  const locs = await all(`/v2/inAppPurchases/${id}/inAppPurchaseLocalizations`);
  if (!locs.some(l => l.attributes.locale === 'en-US')) {
    await api('POST', '/v1/inAppPurchaseLocalizations', { data: {
      type: 'inAppPurchaseLocalizations', attributes: { locale: 'en-US', name: p.name, description: p.description },
      relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id } } },
    } });
    console.log('  + en-US localization');
  }

  const schedule = await api('GET', `/v2/inAppPurchases/${id}/iapPriceSchedule`).catch(() => null);
  const hasPrice = schedule?.data && (await api('GET', `/v1/inAppPurchasePriceSchedules/${schedule.data.id}/manualPrices?limit=1`).catch(() => ({ data: [] }))).data.length > 0;
  if (!hasPrice) {
    const points = await all(`/v2/inAppPurchases/${id}/pricePoints?filter[territory]=USA&limit=200`);
    const point = points.find(pp => pp.attributes.customerPrice === p.price);
    if (!point) throw new Error(`No US price point ${p.price} for ${p.productId}`);
    await api('POST', '/v1/inAppPurchasePriceSchedules', {
      data: { type: 'inAppPurchasePriceSchedules', relationships: {
        inAppPurchase: { data: { type: 'inAppPurchases', id } },
        baseTerritory: { data: { type: 'territories', id: 'USA' } },
        manualPrices: { data: [{ type: 'inAppPurchasePrices', id: '${price}' }] },
      } },
      included: [{ type: 'inAppPurchasePrices', id: '${price}', attributes: { startDate: null },
        relationships: { inAppPurchasePricePoint: { data: { type: 'inAppPurchasePricePoints', id: point.id } } } }],
    });
    console.log(`  + price $${p.price} (US base, other storefronts follow Apple's equalization)`);
  }

  const avail = await api('GET', `/v2/inAppPurchases/${id}/inAppPurchaseAvailability`).catch(() => null);
  if (!avail?.data) {
    await api('POST', '/v1/inAppPurchaseAvailabilities', { data: {
      type: 'inAppPurchaseAvailabilities', attributes: { availableInNewTerritories: true },
      relationships: { inAppPurchase: { data: { type: 'inAppPurchases', id } }, availableTerritories: { data: territories } },
    } });
    console.log(`  + available in ${territories.length} storefronts`);
  }

  if (SCREENSHOT) {
    const shot = await api('GET', `/v2/inAppPurchases/${id}/appStoreReviewScreenshot`).catch(() => null);
    if (!shot?.data) {
      const file = fs.readFileSync(SCREENSHOT);
      const res = (await api('POST', '/v1/inAppPurchaseAppStoreReviewScreenshots', { data: {
        type: 'inAppPurchaseAppStoreReviewScreenshots', attributes: { fileName: path.basename(SCREENSHOT), fileSize: file.length },
        relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id } } },
      } })).data;
      for (const op of res.attributes.uploadOperations) {
        const r = await fetch(op.url, { method: op.method, headers: Object.fromEntries(op.requestHeaders.map(h => [h.name, h.value])), body: file.subarray(op.offset, op.offset + op.length) });
        if (!r.ok) throw new Error(`screenshot upload ${r.status}`);
      }
      await api('PATCH', `/v1/inAppPurchaseAppStoreReviewScreenshots/${res.id}`, { data: {
        type: 'inAppPurchaseAppStoreReviewScreenshots', id: res.id,
        attributes: { uploaded: true, sourceFileChecksum: crypto.createHash('md5').update(file).digest('hex') },
      } });
      console.log('  + review screenshot');
    }
  }

  if (SUBMIT) {
    try {
      await api('POST', '/v1/inAppPurchaseSubmissions', { data: { type: 'inAppPurchaseSubmissions', relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id } } } } });
      console.log('  + submitted for review');
    } catch (e) { console.warn(`  ! not submitted: ${e.message}`); }
  }
}
console.log('\nDone. In App Store Connect, open the app version and make sure all seven products are listed under "In-App Purchases" before submitting.');

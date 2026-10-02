// Public identifiers (safe to commit: they ship inside the app anyway).
// Fill these in from the RevenueCat and AdMob dashboards — see docs/SETUP-ACCOUNTS.md.
export const KEYS = {
  revenueCatIos: 'appl_REPLACE_ME',
  admob: {
    rewarded: 'ca-app-pub-REPLACE_ME/REPLACE_ME',
    interstitial: 'ca-app-pub-REPLACE_ME/REPLACE_ME',
  },
};
export const isSet = (v: string) => !v.includes('REPLACE_ME');

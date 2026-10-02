/**
 * Paw Crossing: React Native (no Expo), iOS.
 * The 3D game renders on a WebGPU canvas; everything on top of it is React Native.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BootSplash from 'react-native-bootsplash';
import { GameView } from './src/ui/GameView';
import { Hud, Toast, ZoneBanner, Flash, PopTexts, Loading } from './src/ui/Overlays';
import { TitleScreen } from './src/ui/TitleScreen';
import { GameOver } from './src/ui/GameOver';
import { Shop } from './src/ui/Shop';
import { Settings } from './src/ui/Settings';
import { DailyGift, giftAvailable } from './src/ui/DailyGift';
import { AttPrompt } from './src/ui/AttPrompt';
import { useUi } from './src/game/ui';
import type { Game } from './src/game/Game';
import { startSync, sync } from './src/platform/save';
import * as purchases from './src/platform/purchases';
import * as ads from './src/platform/ads';

function entitlementsFor() {
  return { club: purchases.has('paw_club'), safari: purchases.has('pack_safari'), legendary: purchases.has('pack_legendary') };
}

export default function App() {
  const phase = useUi(u => u.phase);
  const screen = useUi(u => u.screen);
  const [gift, setGift] = useState(false);
  const [att, setAtt] = useState<null | (() => void)>(null);

  // boot order: iCloud merge (bounded), RevenueCat (needs the synced appUserID), consent + ads
  useEffect(() => {
    (async () => {
      startSync();
      await Promise.race([sync(), new Promise<void>(r => setTimeout(r, 2500))]);
      await purchases.initPurchases();
      purchases.getOffering().then(o => ads.applyRemoteLimits(o?.metadata)).catch(() => {});
      await ads.initAds();
    })().catch(e => console.warn('boot', e));
  }, []);

  const onReady = useCallback((g: Game) => {
    BootSplash.hide({ fade: true }).catch(() => {});
    g.setEntitlements(entitlementsFor());
    purchases.onEntitlementsChanged(() => g.setEntitlements(entitlementsFor()));
    ads.setAdHooks({ open: () => g.pause(), close: () => g.resume() });
    if (giftAvailable()) setGift(true);
  }, []);

  // leaving the game-over screen: ATT explainer once (after the first run), then maybe an interstitial
  const onLeave = useCallback(async (then: () => void) => {
    if (await ads.shouldAskAtt()) {
      setAtt(() => async () => { setAtt(null); await ads.askAtt(); await ads.finishRun(); then(); });
      return;
    }
    await ads.finishRun();
    then();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar hidden={phase === 'play'} barStyle="dark-content" />
      <View style={styles.root}>
        <GameView onReady={onReady} />
        <PopTexts />
        <Flash />
        {phase === 'play' && <Hud />}
        {phase === 'title' && !screen && <TitleScreen />}
        {phase === 'dead' && <GameOver onLeave={onLeave} />}
        <ZoneBanner />
        <Toast />
        {phase === 'title' && gift && !screen && <DailyGift onDone={() => setGift(false)} />}
        {screen === 'shop' && <Shop />}
        {screen === 'settings' && <Settings />}
        {att && <AttPrompt onDone={att} />}
        <Loading />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#bfe7ff' } });

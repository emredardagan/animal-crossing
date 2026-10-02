import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { Crown, FilmSlate, Prohibit, Sparkle, Tree } from './icons';
import { useUi } from '../game/ui';
import { game } from '../game/instance';
import * as purchases from '../platform/purchases';
import * as ads from '../platform/ads';
import * as store from '../platform/save';
import { haptics } from '../platform/haptics';
import { CoinDot, Cta, CtaText } from './bits';
import { Sheet, SectionTitle } from './Sheet';
import { C, F, s } from './theme';

const ITEMS: Record<string, { title: string; text: string; ent?: purchases.Entitlement; icon: React.ReactNode }> = {
  paw_club: { title: 'Paw Club', ent: 'paw_club', icon: <Crown size={28} weight="fill" color={C.accent2} />,
    text: 'No interstitial ads, 2× coins from everything, triple daily gift, the Golden Dog and a paw badge. Yours forever.' },
  remove_ads: { title: 'Remove Ads', ent: 'no_ads', icon: <Prohibit size={28} weight="bold" color={C.bad} />,
    text: 'No more ads between runs. Rewarded ads stay optional.' },
  pack_safari: { title: 'Safari Pack', ent: 'pack_safari', icon: <Tree size={28} weight="bold" color={C.good} />,
    text: 'Unlock the lion, tiger, elephant and giraffe at once.' },
  pack_legendary: { title: 'Legendary Pack', ent: 'pack_legendary', icon: <Sparkle size={28} weight="fill" color="#8a5cff" />,
    text: 'The caterpillar, the fish and the Golden Dog.' },
};
const COINS = ['coins_500', 'coins_1500', 'coins_4000'];

export function Shop() {
  const close = () => useUi.setState({ screen: null });
  const bank = useUi(u => u.bank);
  const [pkgs, setPkgs] = useState<PurchasesPackage[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, force] = useState(0);
  const [adsLeft, setAdsLeft] = useState(ads.shopCoinsLeft());

  useEffect(() => {
    purchases.getOffering().then(o => { setPkgs(o?.availablePackages ?? []); ads.applyRemoteLimits(o?.metadata); });
    return purchases.onEntitlementsChanged(() => force(n => n + 1));
  }, []);

  const byId = (id: string) => pkgs?.find(p => p.product.identifier === id);
  const buy = async (id: string) => {
    const pkg = byId(id);
    if (!pkg || busy) return;
    setBusy(id);
    try {
      if (await purchases.buy(pkg)) {
        haptics.success();
        useUi.setState({ bank: store.coins() });
        if (!COINS.includes(id)) game()?.celebrate();
      }
    } catch (e) {
      Alert.alert('Purchase failed', (e as Error).message ?? 'Please try again.');
    } finally { setBusy(null); }
  };
  const freeCoins = async () => {
    if (busy) return;
    setBusy('ad');
    try {
      if (await ads.showRewarded()) {
        ads.useShopCoins(); store.earn(ads.LIMITS.shopCoinsReward);
        useUi.setState({ bank: store.coins() }); haptics.success();
      }
    } finally { setAdsLeft(ads.shopCoinsLeft()); setBusy(null); }
  };

  const offline = pkgs !== null && pkgs.length === 0;
  return (
    <Sheet title="Shop" onClose={close}>
      <View style={[s.pill, { alignSelf: 'flex-start' }]}><CoinDot /><Text style={st.bank}>{bank}</Text></View>
      {pkgs === null && <ActivityIndicator style={{ marginTop: 20 }} />}
      {offline && <Text style={s.dim}>The shop is offline right now. Check your connection and try again.</Text>}

      {pkgs && pkgs.length > 0 && <>
        {Object.entries(ITEMS).map(([id, it]) => {
          const pkg = byId(id); if (!pkg) return null;
          const owned = it.ent ? purchases.has(it.ent) : false;
          return (
            <View key={id} style={[st.item, id === 'paw_club' && st.club]}>
              {it.icon}
              <View style={{ flex: 1 }}>
                <Text style={st.itemT}>{it.title}</Text>
                <Text style={st.itemS}>{it.text}</Text>
              </View>
              {owned ? <Text style={st.owned}>Owned</Text>
                : <Cta small onPress={() => buy(id)} disabled={!!busy} label={`Buy ${it.title} for ${pkg.product.priceString}`}>
                    {busy === id ? <ActivityIndicator color="#fff" /> : <CtaText small>{pkg.product.priceString}</CtaText>}
                  </Cta>}
            </View>
          );
        })}
        <SectionTitle>Coins</SectionTitle>
        {COINS.map(id => {
          const pkg = byId(id); if (!pkg) return null;
          const n = purchases.COIN_PACKS[id];
          return (
            <View key={id} style={st.item}>
              <CoinDot size={28} />
              <Text style={[st.itemT, { flex: 1 }]}>{n.toLocaleString()} coins</Text>
              <Cta small onPress={() => buy(id)} disabled={!!busy} label={`Buy ${n} coins for ${pkg.product.priceString}`}>
                {busy === id ? <ActivityIndicator color="#fff" /> : <CtaText small>{pkg.product.priceString}</CtaText>}
              </Cta>
            </View>
          );
        })}
      </>}

      {ads.rewardedReady() && adsLeft > 0 && (
        <View style={st.item}>
          <FilmSlate size={28} weight="bold" color={C.accent} />
          <View style={{ flex: 1 }}>
            <Text style={st.itemT}>Free coins</Text>
            <Text style={st.itemS}>Watch a short ad for {ads.LIMITS.shopCoinsReward} coins ({adsLeft} left today)</Text>
          </View>
          <Cta alt small onPress={freeCoins} disabled={!!busy}><CtaText alt small>+{ads.LIMITS.shopCoinsReward}</CtaText></Cta>
        </View>
      )}
      <Text style={[s.dim, { fontSize: 12, marginTop: 8 }]}>One-time purchases, no subscriptions. Restore them anytime in Settings.</Text>
    </Sheet>
  );
}

const st = StyleSheet.create({
  bank: { fontFamily: F.bold, fontSize: 20, color: C.gold },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.soft, borderRadius: 18, padding: 14 },
  club: { backgroundColor: '#fff4d6', borderWidth: 2, borderColor: C.accent2 },
  itemT: { fontFamily: F.bold, fontSize: 17, color: C.ink },
  itemS: { fontFamily: F.medium, fontSize: 13, color: C.dim, marginTop: 2 },
  owned: { fontFamily: F.bold, fontSize: 15, color: C.good },
});

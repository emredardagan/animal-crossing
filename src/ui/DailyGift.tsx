import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { FilmSlate, Gift } from './icons';
import * as ads from '../platform/ads';
import * as store from '../platform/save';
import { haptics } from '../platform/haptics';
import { useUi, toast } from '../game/ui';
import { CoinDot, Cta, CtaText } from './bits';
import { C, s } from './theme';

export const GIFT_COINS = 20;
export const today = () => new Date().toISOString().slice(0, 10);
export const giftAvailable = () => store.getSave().lastClaimDay !== today();

export function DailyGift({ onDone }: { onDone: () => void }) {
  const club = useUi(u => u.club);
  const amount = GIFT_COINS * (club ? 3 : 1);
  const [busy, setBusy] = useState(false);
  const claim = (n: number) => {
    store.earn(n);
    store.save({ lastClaimDay: today() }, { syncNow: true });
    useUi.setState({ bank: store.coins() });
    haptics.success();
    toast('gift', 'Daily gift', `+${n}`);
    onDone();
  };
  return (
    <View style={st.wrap}>
      <Animated.View entering={ZoomIn.springify().damping(12)} style={s.panel}>
        <Gift size={48} weight="fill" color={C.accent} />
        <Text style={[s.h2, { fontSize: 30, marginTop: 6 }]}>Daily gift!</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 14 }}>
          <CoinDot size={28} /><Text style={[s.h2, { fontSize: 34, color: C.gold }]}>{amount}</Text>
          {club && <Text style={[s.dim, { fontSize: 13 }]}>Paw Club ×3</Text>}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Cta onPress={() => claim(amount)} disabled={busy}><CtaText>Claim</CtaText></Cta>
          {ads.rewardedReady() && (
            <Cta alt disabled={busy} label="Watch an ad to double the gift" onPress={async () => {
              setBusy(true);
              try { if (await ads.showRewarded()) claim(amount * 2); } finally { setBusy(false); }
            }}>
              <FilmSlate size={18} weight="bold" color={C.accent} /><CtaText alt>×2</CtaText>
            </Cta>
          )}
        </View>
      </Animated.View>
    </View>
  );
}
const st = StyleSheet.create({ wrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'rgba(43,45,66,0.35)' } });

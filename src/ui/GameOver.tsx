import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { ArrowCounterClockwise, FilmSlate, PawPrint } from './icons';
import { useUi } from '../game/ui';
import { game } from '../game/instance';
import * as ads from '../platform/ads';
import { Cta, CtaText } from './bits';
import { Missions } from './Missions';
import { C, F, s } from './theme';

export function GameOver({ onLeave }: { onLeave: (then: () => void) => void }) {
  const over = useUi(u => u.over);
  const [busy, setBusy] = useState(false);
  const [adReady, setAdReady] = useState(ads.rewardedReady());
  useEffect(() => { const t = setInterval(() => setAdReady(ads.rewardedReady()), 500); return () => clearInterval(t); }, []);
  const glow = useSharedValue(0);
  useEffect(() => { glow.value = withRepeat(withTiming(1, { duration: 600 }), -1, true); }, [glow]);
  const glowStyle = useAnimatedStyle(() => ({ shadowColor: '#ffc23d', shadowOpacity: over?.canBuy ? glow.value * 0.9 : 0.25, shadowRadius: 10 }));
  if (!over) return null;

  const watch = async (then: () => void) => {
    if (busy) return;
    setBusy(true);
    try { if (await ads.showRewarded()) then(); } finally { setBusy(false); }
  };

  return (
    <View style={st.wrap} pointerEvents="box-none">
      <Animated.View entering={ZoomIn.springify().damping(12)} style={s.panel}>
        <Text style={s.h2}>{over.title}</Text>
        <Text style={[s.dim, { marginTop: 6, marginBottom: 16, textAlign: 'center' }]}>{over.why}</Text>
        <View style={st.stats}>
          <View style={[st.stat, over.isBest && { backgroundColor: '#fff4d6' }]}>
            <Text style={st.statS}>Score{over.isBest ? <Text style={{ color: C.accent }}> · new!</Text> : null}</Text>
            <Text style={st.statB}>{over.score}</Text>
          </View>
          <View style={st.stat}><Text style={st.statS}>Coins{over.doubled ? <Text style={{ color: C.accent }}> · ×2</Text> : null}</Text><Text style={st.statB}>{over.coins}</Text></View>
        </View>
        <View style={{ alignSelf: 'stretch', marginBottom: 16 }}><Missions /></View>

        {(over.canContinue || over.canDouble) && adReady && (
          <View style={[st.actions, { marginBottom: 12 }]}>
            {over.canContinue && (
              <Cta alt small disabled={busy} onPress={() => watch(() => game()?.revive())} label="Watch an ad to continue">
                <FilmSlate size={18} weight="bold" color={C.accent} /><CtaText alt small>Continue</CtaText>
              </Cta>
            )}
            {over.canDouble && (
              <Cta alt small disabled={busy} onPress={() => watch(() => game()?.doubleCoins())} label="Watch an ad to double this run's coins">
                <FilmSlate size={18} weight="bold" color={C.accent} /><CtaText alt small>Coins ×2</CtaText>
              </Cta>
            )}
          </View>
        )}

        <View style={st.actions}>
          <Cta disabled={busy} onPress={() => onLeave(() => game()?.start())}><ArrowCounterClockwise size={20} weight="bold" color="#fff" /><CtaText>Hop again</CtaText></Cta>
          <Animated.View style={[{ borderRadius: 99 }, glowStyle]}>
            <Cta alt disabled={busy} onPress={() => onLeave(() => game()?.toPets())}><PawPrint size={20} weight="bold" color={C.ink} /><CtaText alt>Pets</CtaText></Cta>
          </Animated.View>
        </View>
        {over.canBuy && <Text style={st.hint}>You have enough coins for a new pet!</Text>}
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 16 },
  stats: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  stat: { backgroundColor: C.soft, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 16, minWidth: 100, alignItems: 'center' },
  statS: { fontFamily: F.semi, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', color: C.dim },
  statB: { fontFamily: F.bold, fontSize: 30, color: C.ink },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
  hint: { marginTop: 12, fontFamily: F.semi, fontSize: 14, color: C.goldText },
});

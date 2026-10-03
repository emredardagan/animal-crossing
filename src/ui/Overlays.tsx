// Things that float over the game: HUD, toast, season banner, lightning flash, pop-up text, loading bar.
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, FadeOut,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle, CloudLightning, Gift, Heart, Info, LockSimple, Magnet, MoonStars, PawPrint, Snowflake, SpeakerHigh, SpeakerSlash } from './icons';
import { useUi, usePops, popFrames, POP_SLOTS, type ToastMsg } from '../game/ui';
import { game } from '../game/instance';
import { CoinDot, Pill, RoundBtn } from './bits';
import { C, F, s, shadow } from './theme';

export function Hud() {
  const insets = useSafeAreaInsets();
  const { score, best, bank, shield, magnetT, muted, club } = useUi();
  return (
    <View pointerEvents="box-none" style={[st.hud, { paddingTop: Math.max(14, insets.top), paddingLeft: 14, paddingRight: 14 }]}>
      <View pointerEvents="none" style={st.row}>
        <Pill label="Score" value={<Text style={{ fontSize: 34 }}>{score}</Text>}>
          {club ? <PawPrint size={18} weight="fill" color={C.accent2} /> : null}
        </Pill>
        <Pill label="Best" value={<Text style={{ fontSize: 20 }}>{best}</Text>} />
      </View>
      <View pointerEvents="box-none" style={st.row}>
        {shield && <View style={s.pill}><Heart size={20} weight="bold" color="#ff5d8a" /><Text style={st.powerT}>×1</Text></View>}
        {magnetT > 0 && <View style={s.pill}><Magnet size={20} weight="bold" color="#8a5cff" /><Text style={st.powerT}>{magnetT}</Text></View>}
        <View style={s.pill}><CoinDot /><Text style={[st.powerT, { color: C.gold }]}>{bank}</Text></View>
        <RoundBtn label={muted ? 'Sound on' : 'Sound off'} onPress={() => game()?.toggleMute()}>
          {muted ? <SpeakerSlash size={22} weight="bold" color={C.ink} /> : <SpeakerHigh size={22} weight="bold" color={C.ink} />}
        </RoundBtn>
      </View>
    </View>
  );
}

const TOAST_ICON: Record<ToastMsg['icon'], [React.ComponentType<{ size: number; weight: 'bold'; color: string }>, string]> = {
  check: [CheckCircle, C.good], lock: [LockSimple, C.dim], moon: [MoonStars, '#6f86d8'], storm: [CloudLightning, '#5b6b8a'],
  snow: [Snowflake, '#5fb4e8'], gift: [Gift, C.accent], info: [Info, C.dim],
};

export function Toast() {
  const insets = useSafeAreaInsets();
  const t = useUi(u => u.toast);
  const y = useSharedValue(-20), o = useSharedValue(0);
  useEffect(() => {
    if (!t) return;
    y.value = -20; o.value = 0;
    y.value = withSequence(withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) }), withDelay(2100, withTiming(-20, { duration: 250 })));
    o.value = withSequence(withTiming(1, { duration: 250 }), withDelay(2100, withTiming(0, { duration: 250 })));
  }, [t, y, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value }] }));
  if (!t) return null;
  const [Icon, color] = TOAST_ICON[t.icon];
  return (
    <View pointerEvents="none" style={[st.toastWrap, { top: Math.max(84, insets.top + 74) }]}>
      <Animated.View style={[s.pill, st.toast, anim]} accessibilityLiveRegion="polite">
        <Icon size={20} weight="bold" color={color} />
        <Text style={st.toastT} numberOfLines={1}>{t.text}{t.em ? <Text style={{ color: C.goldText }}> {t.em}</Text> : null}</Text>
      </Animated.View>
    </View>
  );
}

export function ZoneBanner() {
  const b = useUi(u => u.banner);
  const sc = useSharedValue(0.92), o = useSharedValue(0), ty = useSharedValue(0);
  useEffect(() => {
    if (!b) { o.value = withTiming(0, { duration: 150 }); return; }
    sc.value = 0.92; o.value = 0; ty.value = 0;
    sc.value = withTiming(1, { duration: 310, easing: Easing.out(Easing.cubic) });
    o.value = withSequence(withTiming(1, { duration: 310 }), withDelay(1770, withTiming(0, { duration: 520 })));
    ty.value = withDelay(2080, withTiming(-30, { duration: 520 }));
  }, [b, sc, o, ty]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: ty.value }, { scale: sc.value }] }));
  if (!b) return null;
  return (
    <View pointerEvents="none" style={st.bannerWrap}>
      <Animated.View style={[{ alignItems: 'center' }, anim]}>
        <Outlined size={52} stroke={7} style={{ transform: [{ rotate: '-3deg' }] }}>{b.name}</Outlined>
        <View style={[s.pill, { marginTop: 6, paddingVertical: 4, borderRadius: 99 }]}><Text style={st.sub}>{b.sub}</Text></View>
      </Animated.View>
    </View>
  );
}

/** White text with a thick ink outline (the web version's -webkit-text-stroke). */
export function Outlined({ children, size, stroke = 6, color = '#fff', style }: { children: React.ReactNode; size: number; stroke?: number; color?: string; style?: object }) {
  const offs: [number, number][] = [];
  for (let a = 0; a < 16; a++) offs.push([Math.cos(a / 8 * Math.PI) * stroke * 0.5, Math.sin(a / 8 * Math.PI) * stroke * 0.5]);
  const base = { fontFamily: F.bold, fontSize: size, lineHeight: size * 1.05, textAlign: 'center' as const };
  return (
    <View style={style}>
      {offs.map(([x, y], k) => <Text key={k} style={[base, { position: 'absolute', left: x, top: y, right: -x, color: C.ink }]}>{children}</Text>)}
      <Text style={[base, { color }]}>{children}</Text>
    </View>
  );
}

export function Flash() {
  const n = useUi(u => u.flash);
  const o = useSharedValue(0);
  useEffect(() => {
    if (!n) return;
    o.value = withSequence(withTiming(0.55, { duration: 0 }), withTiming(0.1, { duration: 90 }), withTiming(0.4, { duration: 60 }), withTiming(0, { duration: 450, easing: Easing.out(Easing.quad) }));
  }, [n, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#eef3ff' }, anim]} />;
}

function Pop({ slot, text, cls }: { slot: number; text: string; cls: string }) {
  const anim = useAnimatedStyle(() => {
    const f = popFrames.value, o = slot * 4;
    return { opacity: f[o + 3], transform: [{ translateX: f[o] - 150 }, { translateY: f[o + 1] - 30 }, { scale: f[o + 2] }] };
  });
  const big = cls.includes('big'), color = cls.includes('gold') ? '#ffd23d' : cls.includes('good') ? '#7cf0a8' : '#fff';
  return (
    <Animated.View pointerEvents="none" style={[st.pop, anim]}>
      <Outlined size={big ? 34 : 22} stroke={big ? 6 : 5} color={color}>{text}</Outlined>
    </Animated.View>
  );
}
export function PopTexts() {
  const slots = usePops(p => p.slots);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {slots.slice(0, POP_SLOTS).map((p, k) => p ? <Pop key={p.id} slot={k} text={p.text} cls={p.cls} /> : null)}
    </View>
  );
}

export function Loading() {
  const { phase, loadProgress } = useUi();
  if (phase !== 'loading') return null;
  return (
    <Animated.View exiting={FadeOut.duration(500)} style={[StyleSheet.absoluteFill, st.loading]}>
      {loadProgress < 0
        ? <Text style={[s.text, { textAlign: 'center', padding: 24 }]}>Paw Crossing could not start its graphics. Please restart the app.</Text>
        : <View style={st.bar}><View style={[st.barFill, { width: `${Math.round(loadProgress * 100)}%` }]} /></View>}
    </Animated.View>
  );
}

const st = StyleSheet.create({
  hud: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  powerT: { fontFamily: F.bold, fontSize: 22, color: C.ink, fontVariant: ['tabular-nums'] },
  toastWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: { borderRadius: 99, paddingHorizontal: 18, paddingVertical: 10, maxWidth: '100%' },
  toastT: { fontFamily: F.bold, fontSize: 15, color: C.ink, flexShrink: 1 },
  bannerWrap: { position: 'absolute', left: 0, right: 0, top: '24%', alignItems: 'center' },
  sub: { fontFamily: F.semi, fontSize: 14, color: C.ink },
  pop: { position: 'absolute', left: 0, top: 0, width: 300, height: 60, alignItems: 'center', justifyContent: 'center' },
  loading: { backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  bar: { width: 240, height: 14, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.7)', overflow: 'hidden', ...shadow },
  barFill: { height: '100%', borderRadius: 99, backgroundColor: C.accent },
});

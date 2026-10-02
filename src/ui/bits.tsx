// Small shared pieces: buttons, pills, the coin.
import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { C, F, s, shadow } from './theme';

export function CoinDot({ size = 22 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#ffc23d', borderWidth: size * 0.09, borderColor: '#e39a00', overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: size * 0.16, top: size * 0.14, width: size * 0.38, height: size * 0.32, borderRadius: size, backgroundColor: '#fff3a8', opacity: 0.9 }} />
    </View>
  );
}

export function RoundBtn({ onPress, children, label, style }: { onPress: () => void; children: React.ReactNode; label: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
      style={({ pressed }) => [st.round, pressed && { transform: [{ translateY: 3 }, { scale: 0.96 }] }, style]}>
      {children}
    </Pressable>
  );
}

/** The chunky orange call-to-action. `alt` = white variant. */
export function Cta({ onPress, children, alt, disabled, style, label, small, shakeKey }: {
  onPress: () => void; children: React.ReactNode; alt?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; label?: string; small?: boolean; shakeKey?: number;
}) {
  const x = useSharedValue(0);
  React.useEffect(() => {
    if (shakeKey) x.value = withSequence(withTiming(-8, { duration: 60 }), withTiming(8, { duration: 110 }), withTiming(0, { duration: 60 }));
  }, [shakeKey, x]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Animated.View style={[anim, style]}>
      <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
        style={({ pressed }) => [alt ? st.ctaAlt : st.cta, small && st.ctaSmall, disabled && { opacity: 0.6 }, pressed && { transform: [{ translateY: 4 }] }]}>
        <View style={st.ctaRow}>{children}</View>
      </Pressable>
    </Animated.View>
  );
}
export const CtaText = ({ children, alt, small }: { children: React.ReactNode; alt?: boolean; small?: boolean }) =>
  <Text style={[st.ctaText, alt && { color: C.ink }, small && { fontSize: 17 }]}>{children}</Text>;

export function Pill({ label, value, style, children }: { label?: string; value?: React.ReactNode; style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  return (
    <View style={[s.pill, style]}>
      {children}
      {label != null && <View><Text style={s.pillSmall}>{label}</Text><Text style={s.pillBig}>{value}</Text></View>}
    </View>
  );
}

const st = StyleSheet.create({
  round: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', ...shadow },
  cta: { backgroundColor: C.accent, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 34, borderBottomWidth: 6, borderBottomColor: '#d86a1f', shadowColor: '#d86a1f', shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 10 } },
  ctaAlt: { backgroundColor: '#fff', borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 6, borderBottomColor: '#d5d8e4', ...shadow },
  ctaSmall: { paddingVertical: 10, paddingHorizontal: 18 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { fontFamily: F.bold, fontSize: 22, color: '#fff' },
});

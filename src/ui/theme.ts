// toybox.css, as React Native styles.
import { StyleSheet } from 'react-native';

export const C = {
  ink: '#2b2d42', dim: '#7b7f9a', card: 'rgba(255,255,255,0.92)', accent: '#ff8a3d', accent2: '#ffc23d',
  good: '#3ccf7a', bad: '#ff5d6c', gold: '#e8a200', goldText: '#c07a00', sky: '#bfe7ff', soft: '#f3f5fb',
};
export const F = { regular: 'Fredoka-Regular', medium: 'Fredoka-Medium', semi: 'Fredoka-SemiBold', bold: 'Fredoka-Bold' };

export const shadow = {
  shadowColor: '#2b2d42', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
};

export const s = StyleSheet.create({
  pill: { backgroundColor: C.card, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8, ...shadow },
  pillSmall: { fontFamily: F.semi, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: C.dim },
  pillBig: { fontFamily: F.bold, fontSize: 26, color: C.ink, fontVariant: ['tabular-nums'] },
  panel: { backgroundColor: C.card, borderRadius: 28, paddingVertical: 24, paddingHorizontal: 24, alignItems: 'center', maxWidth: 420, width: '100%', ...shadow },
  h2: { fontFamily: F.bold, fontSize: 40, color: C.ink, lineHeight: 44 },
  text: { fontFamily: F.medium, fontSize: 15, color: C.ink },
  dim: { fontFamily: F.medium, fontSize: 15, color: C.dim },
});

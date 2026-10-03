// A full-screen card with a close button, used by Shop and Settings.
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from './icons';
import { RoundBtn } from './bits';
import { C, F } from './theme';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={st.dim}>
      <Animated.View entering={SlideInDown.duration(260).easing(Easing.out(Easing.cubic))} exiting={SlideOutDown.duration(200)}
        style={[st.card, { marginTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <View style={st.head}>
          <Text style={st.title} accessibilityRole="header">{title}</Text>
          <RoundBtn label="Close" onPress={onClose}><X size={20} weight="bold" color={C.ink} /></RoundBtn>
        </View>
        <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }}>{children}</ScrollView>
      </Animated.View>
    </View>
  );
}
export const SectionTitle = ({ children }: { children: React.ReactNode }) => <Text style={st.section}>{children}</Text>;

const st = StyleSheet.create({
  dim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(43,45,66,0.35)' },
  card: { flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16 },
  title: { fontFamily: F.bold, fontSize: 30, color: C.ink },
  section: { fontFamily: F.semi, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: C.dim, marginTop: 8 },
});

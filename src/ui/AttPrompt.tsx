// Our own explainer before the system App Tracking Transparency dialog (shown once, after the first run).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ShieldCheck } from './icons';
import { Cta, CtaText } from './bits';
import { C, s } from './theme';

export function AttPrompt({ onDone }: { onDone: () => void }) {
  return (
    <View style={st.wrap}>
      <Animated.View entering={FadeIn.duration(220)} style={s.panel}>
        <ShieldCheck size={44} weight="bold" color={C.accent} />
        <Text style={[s.h2, { fontSize: 28, marginTop: 8, textAlign: 'center' }]}>Keep Paw Crossing free</Text>
        <Text style={[s.dim, { textAlign: 'center', marginVertical: 14 }]}>
          Paw Crossing is free thanks to a few ads between runs. On the next screen you can choose whether ads may be more relevant to you. Either way, the game plays exactly the same.
        </Text>
        <Cta onPress={onDone}><CtaText>Continue</CtaText></Cta>
      </Animated.View>
    </View>
  );
}
const st = StyleSheet.create({ wrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'rgba(43,45,66,0.35)' } });

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CheckCircle, Target } from './icons';
import { useUi } from '../game/ui';
import { CoinDot } from './bits';
import { C, F } from './theme';

export function Missions({ compact }: { compact?: boolean }) {
  const missions = useUi(u => u.missions);
  const club = useUi(u => u.club);
  return (
    <View style={{ gap: 8 }}>
      <View style={st.h3}><Target size={14} weight="bold" color={C.dim} /><Text style={st.h3T}>Missions</Text></View>
      {missions.map((m, k) => (
        <View key={k} style={[st.mission, m.done && { backgroundColor: '#e3f8eb' }]}
          accessible accessibilityLabel={`${m.text}. ${m.done ? 'Done' : `${m.p} of ${m.n}`}`}>
          <View style={st.line}>
            {m.done ? <CheckCircle size={18} weight="bold" color={C.good} /> : <Target size={18} weight="bold" color={C.accent} />}
            <Text style={st.text}>{m.text}</Text>
            {m.done ? <Text style={st.em}>Done!</Text> : <View style={st.reward}><CoinDot size={14} /><Text style={st.em}>{m.reward * (club ? 2 : 1)}</Text></View>}
          </View>
          {!(compact && m.done) && (
            <View style={st.bar}><View style={[st.fill, { width: `${Math.round(m.p / m.n * 100)}%` }, m.done && { backgroundColor: C.good }]} /></View>
          )}
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  h3: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  h3T: { fontFamily: F.semi, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: C.dim },
  mission: { backgroundColor: C.soft, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, gap: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { flex: 1, fontFamily: F.semi, fontSize: 14, color: C.ink },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  em: { fontFamily: F.semi, fontSize: 13, color: C.goldText },
  bar: { marginLeft: 26, height: 6, borderRadius: 99, backgroundColor: '#e2e5ef', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 99, backgroundColor: C.accent },
});

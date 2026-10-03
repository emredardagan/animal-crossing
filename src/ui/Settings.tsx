import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useUi } from '../game/ui';
import { game } from '../game/instance';
import * as purchases from '../platform/purchases';
import * as ads from '../platform/ads';
import { hapticsOn, setHaptics } from '../platform/haptics';
import { prefs } from '../platform/save';
import { Cta, CtaText } from './bits';
import { Sheet, SectionTitle } from './Sheet';
import { C, F, s } from './theme';
import { version } from '../../package.json';

type Q = 'auto' | 'high' | 'low';

export function Settings() {
  const close = () => useUi.setState({ screen: null });
  const muted = useUi(u => u.muted);
  const [haptic, setHaptic] = useState(hapticsOn());
  const [quality, setQuality] = useState<Q>(prefs.get<Q>('quality', 'auto'));
  const [privacy, setPrivacy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => { ads.privacyOptionsRequired().then(setPrivacy); }, []);

  const pickQuality = (q: Q) => {
    setQuality(q); prefs.set('quality', q);
    game()?.setQuality(q === 'auto' ? prefs.get<'high' | 'low'>('autoQuality', 'high') : q);
  };
  const restore = async () => {
    setRestoring(true);
    try { await purchases.restore(); Alert.alert('Purchases restored', 'Everything you bought is unlocked again.'); }
    catch (e) { Alert.alert('Could not restore', (e as Error).message ?? 'Please try again.'); }
    finally { setRestoring(false); }
  };

  return (
    <Sheet title="Settings" onClose={close}>
      <Row label="Sound"><Switch value={!muted} onValueChange={() => game()?.toggleMute()} /></Row>
      <Row label="Haptics"><Switch value={haptic} onValueChange={v => { setHaptic(v); setHaptics(v); }} /></Row>
      <Row label="Graphics">
        <View style={st.seg}>
          {(['auto', 'high', 'low'] as Q[]).map(q => (
            <Pressable key={q} onPress={() => pickQuality(q)} accessibilityRole="button" accessibilityState={{ selected: quality === q }}
              style={[st.segBtn, quality === q && st.segOn]}>
              <Text style={[st.segT, quality === q && { color: '#fff' }]}>{q[0].toUpperCase() + q.slice(1)}</Text>
            </Pressable>
          ))}
        </View>
      </Row>

      <SectionTitle>Purchases</SectionTitle>
      <Cta alt small onPress={restore} disabled={restoring}><CtaText alt small>{restoring ? 'Restoring…' : 'Restore Purchases'}</CtaText></Cta>

      {privacy && <>
        <SectionTitle>Privacy</SectionTitle>
        <Cta alt small onPress={ads.showPrivacyOptions}><CtaText alt small>Privacy choices</CtaText></Cta>
      </>}
      <Pressable onPress={() => Linking.openURL('https://emredardagan.github.io/animal-crossing/privacy.html')}>
        <Text style={[st.link]}>Privacy Policy</Text>
      </Pressable>

      <SectionTitle>Credits</SectionTitle>
      <Text style={s.dim}>
        3D models by Kenney (kenney.nl, CC0). Sky by Poly Haven (CC0). Fredoka font (SIL Open Font License). Icons by Phosphor (MIT). Built with three.js (MIT) and React Native.
      </Text>
      <Text style={[s.dim, { fontSize: 12, marginTop: 12 }]}>Paw Crossing {version}</Text>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={st.row}><Text style={st.label}>{label}</Text>{children}</View>;
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.soft, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  label: { fontFamily: F.semi, fontSize: 17, color: C.ink },
  seg: { flexDirection: 'row', backgroundColor: '#e2e5ef', borderRadius: 99, padding: 3 },
  segBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 },
  segOn: { backgroundColor: C.accent },
  segT: { fontFamily: F.semi, fontSize: 14, color: C.ink },
  link: { fontFamily: F.semi, fontSize: 15, color: C.accent, textDecorationLine: 'underline', marginTop: 4 },
});

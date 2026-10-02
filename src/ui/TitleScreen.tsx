import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretLeft, CaretRight, Gear, LockSimple, PawPrint, Storefront, Target } from './icons';
import { useUi } from '../game/ui';
import { game } from '../game/instance';
import { CoinDot, Cta, CtaText, RoundBtn } from './bits';
import { Missions } from './Missions';
import { Outlined } from './Overlays';
import { C, F, s } from './theme';

export function TitleScreen() {
  const insets = useSafeAreaInsets();
  const u = useUi();
  const [showMissions, setShowMissions] = useState(false);
  const canUnlock = u.bank >= u.petPrice;
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} pointerEvents="box-none" style={[StyleSheet.absoluteFill, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }]}>
      {/* top bar */}
      <View pointerEvents="box-none" style={st.top}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => setShowMissions(v => !v)} accessibilityRole="button" accessibilityState={{ expanded: showMissions }} style={s.pill}>
            <Target size={18} weight="bold" color={C.accent} /><Text style={st.pillT}>Missions</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={s.pill}><CoinDot /><Text style={[st.pillT, { fontSize: 20, color: C.gold }]}>{u.bank}</Text></View>
          <RoundBtn label="Shop" onPress={() => useUi.setState({ screen: 'shop' })}><Storefront size={22} weight="bold" color={C.ink} /></RoundBtn>
          <RoundBtn label="Settings" onPress={() => useUi.setState({ screen: 'settings' })}><Gear size={22} weight="bold" color={C.ink} /></RoundBtn>
        </View>
      </View>
      {showMissions && <Animated.View entering={FadeIn.duration(150)} style={st.missions}><Missions compact /></Animated.View>}

      <View pointerEvents="none" style={st.logo}>
        <View style={{ transform: [{ rotate: '-3deg' }] }}>
          <Outlined size={64} stroke={10}>Paw</Outlined>
          <Outlined size={64} stroke={10} color={C.accent2}>Crossing</Outlined>
        </View>
        <View style={[s.pill, { borderRadius: 99, marginTop: 14 }]}><Text style={st.pillT}>Hop across roads and rivers. Don't look back.</Text></View>
      </View>

      <View pointerEvents="box-none" style={st.picker}>
        <View style={st.pickRow}>
          <RoundBtn label="Previous animal" onPress={() => game()?.prevPet()}><CaretLeft size={22} weight="bold" color={C.ink} /></RoundBtn>
          <View style={st.petName}><Text style={st.petNameT}>{u.petName}</Text></View>
          <RoundBtn label="Next animal" onPress={() => game()?.nextPet()}><CaretRight size={22} weight="bold" color={C.ink} /></RoundBtn>
        </View>
        <View style={st.collection}>
          <PawPrint size={14} weight="bold" color={C.ink} />
          <Text style={st.collectionT}>{u.ownedCount} / {u.totalPets} pets</Text>
          {!u.petOwned && <View style={st.tag}><Text style={st.tagT}>{u.petTier}</Text></View>}
        </View>
        {u.petOwned ? (
          <Cta onPress={() => game()?.tapPlay()}><CtaText>Let's go!</CtaText></Cta>
        ) : u.petLocked === 'iap' ? (
          <Cta onPress={() => useUi.setState({ screen: 'shop' })} label="Get Paw Club to unlock"><PawPrint size={22} weight="fill" color="#fff" /><CtaText>Paw Club</CtaText></Cta>
        ) : (
          <Cta onPress={() => game()?.tapPlay()} shakeKey={u.nope} label={canUnlock ? `Unlock for ${u.petPrice} coins` : `Locked, costs ${u.petPrice} coins`}>
            {canUnlock ? <CtaText>Unlock</CtaText> : <LockSimple size={22} weight="bold" color="#fff" />}
            <CoinDot /><CtaText>{u.petPrice}</CtaText>
          </Cta>
        )}
        <Text style={st.hint}>Swipe to steer · tap to hop forward</Text>
      </View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 14 },
  pillT: { fontFamily: F.semi, fontSize: 15, color: C.ink },
  missions: { position: 'absolute', top: 120, left: 16, right: 16, maxWidth: 340, backgroundColor: C.card, borderRadius: 22, padding: 12, zIndex: 5 },
  logo: { alignItems: 'center', marginTop: 28 },
  picker: { position: 'absolute', left: 0, right: 0, bottom: 36, alignItems: 'center', gap: 14 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  petName: { minWidth: 160, alignItems: 'center', backgroundColor: C.card, borderRadius: 99, paddingVertical: 8, paddingHorizontal: 18 },
  petNameT: { fontFamily: F.bold, fontSize: 22, color: C.ink },
  collection: { flexDirection: 'row', alignItems: 'center', gap: 5, opacity: 0.8, marginTop: -6 },
  collectionT: { fontFamily: F.semi, fontSize: 13, color: C.ink },
  tag: { backgroundColor: '#fff4d6', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 2 },
  tagT: { fontFamily: F.bold, fontSize: 13, color: C.goldText },
  hint: { fontFamily: F.medium, fontSize: 14, color: C.ink, opacity: 0.75 },
});

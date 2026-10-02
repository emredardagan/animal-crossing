// The WebGPU canvas, the frame loop and touch input (swipe to steer, tap to hop forward).
import React, { useEffect, useRef } from 'react';
import { AppState, PixelRatio, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { Canvas, type CanvasRef } from 'react-native-webgpu';
import { createStage, type Quality } from '../engine/stage';
import { Game } from '../game/Game';
import { setGame } from '../game/instance';
import { ui, toast } from '../game/ui';
import { prefs } from '../platform/save';

export function GameView({ onReady }: { onReady: (g: Game) => void }) {
  const ref = useRef<CanvasRef>(null);
  const size = useRef({ w: 0, h: 0 });
  const started = useRef(false);
  const cleanup = useRef<() => void>(() => {});
  const touch = useRef<{ x: number; y: number } | null>(null);
  const gameRef = useRef<Game | null>(null);

  async function boot() {
    if (started.current || !size.current.w) return;
    const context = ref.current?.getContext('webgpu');
    if (!context) return;
    started.current = true;
    const { w, h } = size.current;
    let quality = prefs.get<Quality | 'auto'>('quality', 'auto');
    const stage = await createStage(context, { width: w, height: h, pixelRatio: PixelRatio.get(), quality: quality === 'low' ? 'low' : 'high' });
    const game = new Game(stage, quality === 'low' ? 'low' : 'high');
    gameRef.current = game;
    setGame(game);
    await game.boot(k => ui.set({ loadProgress: k }));
    onReady(game);

    // frame loop; on 'auto' quality, drop to Low if the first seconds of play run slow
    let last = performance.now(), raf = 0, probeT = 0, probeFrames = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now(), dt = (now - last) / 1000; last = now;
      if (quality === 'auto' && game.state === 'play' && !game.paused) {
        probeT += dt; probeFrames++;
        if (probeT > 6) {
          const fps = probeFrames / probeT;
          quality = fps < 45 ? 'low' : 'high';
          prefs.set('quality', 'auto');
          if (quality === 'low') { game.setQuality('low'); toast('info', 'Switched to Low graphics for smoother play'); }
        }
      }
      try { game.tick(dt, size.current.w, size.current.h); } catch (e) { console.error(e); }
    };
    raf = requestAnimationFrame(frame);

    const sub = AppState.addEventListener('change', st => {
      if (st === 'active') { last = performance.now(); game.resume(); } else game.pause();
    });
    cleanup.current = () => { cancelAnimationFrame(raf); sub.remove(); stage.dispose(); setGame(null); };
  }

  useEffect(() => () => cleanup.current(), []);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    size.current = { w: width, h: height };
    if (started.current) gameRef.current?.stage.resize(width, height);
    else boot().catch(err => { console.error(err); ui.set({ phase: 'loading', loadProgress: -1 }); });
  };

  const onStart = (e: GestureResponderEvent) => { touch.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }; };
  const onEnd = (e: GestureResponderEvent) => {
    const t = touch.current; touch.current = null;
    if (!t) return;
    gameRef.current?.swipe(e.nativeEvent.pageX - t.x, e.nativeEvent.pageY - t.y);
  };

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout}
      onStartShouldSetResponder={() => true} onResponderGrant={onStart} onResponderRelease={onEnd} onResponderTerminate={() => { touch.current = null; }}>
      <Canvas ref={ref} style={StyleSheet.absoluteFill} />
    </View>
  );
}

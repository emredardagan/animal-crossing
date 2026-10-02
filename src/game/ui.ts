// The bridge between the game loop and React: the game writes, the UI only reads.
// (Replaces every `$('id').textContent = …` of the web version.)
import { create } from 'zustand';
import { makeMutable } from 'react-native-reanimated';
import type { Mission } from '../platform/saveModel';

export type Phase = 'loading' | 'title' | 'play' | 'dead';
export type Screen = null | 'shop' | 'settings' | 'credits';

export interface ToastMsg { id: number; icon: 'check' | 'lock' | 'moon' | 'storm' | 'snow' | 'gift' | 'info'; text: string; em?: string }
export interface MissionView extends Mission { text: string }

export interface Over {
  title: string; why: string; score: number; coins: number; isBest: boolean; canBuy: boolean;
  canContinue: boolean; canDouble: boolean; doubled: boolean;
}

export interface UiState {
  phase: Phase;
  screen: Screen;
  loadProgress: number;
  score: number; best: number; bank: number;
  shield: boolean; magnetT: number;
  petName: string; petOwned: boolean; petPrice: number; petTier: string; petLocked: 'coins' | 'iap' | null;
  ownedCount: number; totalPets: number;
  missions: MissionView[];
  over: Over | null;
  toast: ToastMsg | null;
  banner: { id: number; name: string; sub: string } | null;
  flash: number;
  nope: number;
  muted: boolean;
  club: boolean;
  gift: null | { amount: number; doubled: boolean };
}

export const useUi = create<UiState>(() => ({
  phase: 'loading', screen: null, loadProgress: 0,
  score: 0, best: 0, bank: 0, shield: false, magnetT: 0,
  petName: 'Dog', petOwned: true, petPrice: 0, petTier: 'Common', petLocked: null, ownedCount: 4, totalPets: 24,
  missions: [], over: null, toast: null, banner: null, flash: 0, nope: 0, muted: false, club: false, gift: null,
}));
export const ui = {
  set: (p: Partial<UiState>) => useUi.setState(p),
  get: () => useUi.getState(),
};

let seq = 1;
export function toast(icon: ToastMsg['icon'], text: string, em?: string) { ui.set({ toast: { id: seq++, icon, text, em } }); }
export function banner(name: string, sub: string) { ui.set({ banner: { id: seq++, name, sub } }); }

// ---------- pop-up text that tracks a 3D point ----------
// The game projects each pop to screen space every frame and writes it here; the UI thread animates from it.
export const POP_SLOTS = 8;
export interface PopSlot { id: number; text: string; cls: string }
export const usePops = create<{ slots: (PopSlot | null)[] }>(() => ({ slots: Array(POP_SLOTS).fill(null) }));
/** [x, y, scale, opacity] per slot, in points */
export const popFrames = makeMutable<number[]>(Array(POP_SLOTS * 4).fill(0));

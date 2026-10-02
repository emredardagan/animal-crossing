import type { Game } from './Game';

// The one running game, for UI callbacks.
let current: Game | null = null;
export const setGame = (g: Game | null) => { current = g; };
export const game = () => current;

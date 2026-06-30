export const RANDOM_PICK_ROULETTE_FILE = 'random_pick_roulette.wav';
export const RANDOM_PICK_DECIDE_FILE = 'random_pick_decide.wav';
export const RANDOM_PICK_PANEL_LAND_FILE = 'random_pick_panel_land.wav';

export function randomPickSoundUrls(baseUrl: string): {
  roulette: string;
  decide: string;
  panelLand: string;
} {
  return {
    roulette: `${baseUrl}audio/${RANDOM_PICK_ROULETTE_FILE}`,
    decide: `${baseUrl}audio/${RANDOM_PICK_DECIDE_FILE}`,
    panelLand: `${baseUrl}audio/${RANDOM_PICK_PANEL_LAND_FILE}`,
  };
}

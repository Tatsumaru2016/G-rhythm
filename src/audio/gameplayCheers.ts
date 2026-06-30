export const GAMEPLAY_CHEER_FILES = [
  'cheer_yellow_scream.wav',
  'cheer_applause.wav',
  'cheer_yatta.wav',
  'cheer_waa.wav',
  'cheer_stadium.wav',
  'cheer_stadium2.wav',
] as const;

export type GameplayCheerId = (typeof GAMEPLAY_CHEER_FILES)[number];

export function gameplayCheerUrl(id: GameplayCheerId, baseUrl: string): string {
  return `${baseUrl}audio/${id}`;
}

export function allGameplayCheerUrls(baseUrl: string): string[] {
  return GAMEPLAY_CHEER_FILES.map((id) => gameplayCheerUrl(id, baseUrl));
}

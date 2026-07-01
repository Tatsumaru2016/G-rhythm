export function pickRandomCatalogIndex(catalogLength: number, currentIndex: number): number {
  if (catalogLength <= 0) return 0;

  if (catalogLength === 1) return 0;

  let index = Math.floor(Math.random() * catalogLength);

  while (index === currentIndex) {
    index = Math.floor(Math.random() * catalogLength);
  }

  return index;
}

/** ルーレットでたどる前後件数（選択曲を中心に ±N） */

export const RANDOM_PICK_ROULETTE_RADIUS = 10;

export const RANDOM_PICK_ROULETTE_STOP_MS = 420;

export const RANDOM_PICK_AUTO_START_MS = 3000;

export const RANDOM_PICK_FLY_MS = 520;

export const RANDOM_PICK_EXPAND_MS = 480;

export const RANDOM_PICK_FLASH_MS = 650;

export const RANDOM_PICK_DECIDE_FLASH_MS = 1200;

/**

 * 表示順リスト上で、選択曲の前後 RADIUS 件の範囲だけをスクロールして

 * あらかじめ決まった toCatalogIndex で止めるステップを生成する。

 */

export function buildRandomPickRouletteSteps(
  catalogIndices: readonly number[],

  fromCatalogIndex: number,

  toCatalogIndex: number,
): number[] {
  const len = catalogIndices.length;

  if (len <= 1) return [toCatalogIndex];

  let toPos = catalogIndices.indexOf(toCatalogIndex);

  let fromPos = catalogIndices.indexOf(fromCatalogIndex);

  if (toPos < 0) toPos = 0;

  if (fromPos < 0) fromPos = 0;

  const windowStart = Math.max(0, toPos - RANDOM_PICK_ROULETTE_RADIUS);

  const windowEnd = Math.min(len - 1, toPos + RANDOM_PICK_ROULETTE_RADIUS);

  const windowIndices = catalogIndices.slice(windowStart, windowEnd + 1);

  let startPos = Math.min(Math.max(fromPos, windowStart), windowEnd);

  if (startPos === toPos && toPos > windowStart) {
    startPos = Math.max(windowStart, toPos - 3);
  }

  const localFrom = startPos - windowStart;

  const localTo = toPos - windowStart;

  return buildWindowRouletteSteps(windowIndices, localFrom, localTo);
}

function buildWindowRouletteSteps(
  windowIndices: readonly number[],

  localFrom: number,

  localTo: number,
): number[] {
  const len = windowIndices.length;

  if (len <= 1) return [windowIndices[localTo]];

  if (localFrom === localTo) {
    const start = Math.max(0, localTo - 2);

    const steps: number[] = [];

    for (let p = start; p <= localTo; p++) steps.push(windowIndices[p]);

    return steps;
  }

  const dir = localTo > localFrom ? 1 : -1;

  const directDistance = Math.abs(localTo - localFrom);

  const minSteps = Math.min(9, Math.max(5, directDistance + 2));

  const steps: number[] = [];

  let pos = localFrom;

  const pullBack = pos - dir;

  if (directDistance < minSteps - 1 && pullBack >= 0 && pullBack < len) {
    steps.push(windowIndices[pullBack]);

    pos = pullBack;
  }

  while (pos !== localTo) {
    pos += dir;

    steps.push(windowIndices[pos]);
  }

  if (!steps.length || steps[steps.length - 1] !== windowIndices[localTo]) {
    steps.push(windowIndices[localTo]);
  }

  return steps;
}

export function randomRouletteStepDelay(stepIndex: number, totalSteps: number): number {
  const progress = stepIndex / Math.max(totalSteps - 1, 1);

  return Math.round(50 + progress * progress * 240);
}

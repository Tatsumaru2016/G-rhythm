/** 本番ビルド（WEB公開）向けの軽量設定 */

export const IS_PROD_WEB = import.meta.env.PROD;

export function menuBackgroundFps(): number {
  return IS_PROD_WEB ? 30 : 60;
}

/** WEB版はタイトル／曲選択の背景演出を簡略化 */

export function useLiteMenuBackground(): boolean {
  return IS_PROD_WEB;
}

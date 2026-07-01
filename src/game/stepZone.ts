import { clampDisplayTiming } from '../settings/displayTiming';

/** ステップゾーン中心から判定ラインまでのピクセルオフセット（マイナス=上方向） */
export function judgmentLineOffsetPx(zoneHeight: number, displayTiming: number): number {
  const half = zoneHeight / 2;
  return clampDisplayTiming(displayTiming) * half;
}

export function stepZoneTop(zoneCenterY: number, zoneHeight: number): number {
  return zoneCenterY - zoneHeight / 2;
}

export function stepZoneBottom(zoneCenterY: number, zoneHeight: number): number {
  return zoneCenterY + zoneHeight / 2;
}

/** ノーツ中心が到達すべき Y（表示タイミングでゾーン内を上下シフト） */
export function judgmentLineY(
  zoneCenterY: number,
  zoneHeight: number,
  displayTiming: number,
): number {
  return zoneCenterY + judgmentLineOffsetPx(zoneHeight, displayTiming);
}

import type { ChartData, GameStats } from '../types';
import { getGenreLabel, resolveGenre } from '../audio/musicGenre';
import { t } from '../i18n';
import { ACCURACY_MILESTONE_STYLE, getAccuracyTier } from './accuracyMilestone';

export interface PlayHudLayout {
  width: number;
  laneMarginRight: number;
  scoreCenterX: number;
  songDuration: number;
  scrollSpeed: number;
  time: number;
}

export function drawHudOutlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fillStyle: string,
  options?: { outlineWidth?: number; shadowColor?: string; shadowBlur?: number },
): void {
  const outlineWidth = options?.outlineWidth ?? 3;
  const prevFill = ctx.fillStyle;
  const prevStroke = ctx.strokeStyle;
  const prevWidth = ctx.lineWidth;
  const prevJoin = ctx.lineJoin;
  const prevMiter = ctx.miterLimit;
  const prevShadowColor = ctx.shadowColor;
  const prevShadowBlur = ctx.shadowBlur;

  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = outlineWidth;
  ctx.strokeStyle = '#000';
  ctx.shadowBlur = 0;
  ctx.strokeText(text, x, y);

  ctx.fillStyle = fillStyle;
  if (options?.shadowColor) {
    ctx.shadowColor = options.shadowColor;
    ctx.shadowBlur = options.shadowBlur ?? 0;
  }
  ctx.fillText(text, x, y);

  ctx.fillStyle = prevFill;
  ctx.strokeStyle = prevStroke;
  ctx.lineWidth = prevWidth;
  ctx.lineJoin = prevJoin;
  ctx.miterLimit = prevMiter;
  ctx.shadowColor = prevShadowColor;
  ctx.shadowBlur = prevShadowBlur;
}

export function drawPlayHud(
  ctx: CanvasRenderingContext2D,
  layout: PlayHudLayout,
  stats: GameStats,
  chart: ChartData,
): void {
  const hudRightX = layout.width - layout.laneMarginRight;
  const scoreX = layout.scoreCenterX;

  ctx.save();

  ctx.textAlign = 'right';
  ctx.font = '900 14px "Noto Sans JP", sans-serif';
  drawHudOutlinedText(ctx, chart.title, hudRightX, 30, 'rgba(255,255,255,0.92)');
  drawHudOutlinedText(
    ctx,
    `${chart.bpm} BPM · ${getGenreLabel(resolveGenre(chart))}`,
    hudRightX,
    50,
    'rgba(255,255,255,0.85)',
  );

  if (layout.songDuration > 0) {
    ctx.font = '900 12px "Noto Sans JP", sans-serif';
    const scrollBpm = Math.round(chart.bpm * layout.scrollSpeed);
    drawHudOutlinedText(
      ctx,
      `×${layout.scrollSpeed.toFixed(2)}  (${scrollBpm})`,
      hudRightX,
      70,
      'rgba(120, 220, 255, 0.92)',
    );
  }

  const total =
    (stats.marvelous ?? 0) + stats.perfect + stats.great + stats.good + stats.bad + stats.miss;
  if (total > 0) {
    const acc = (
      (((stats.marvelous ?? 0) + stats.perfect + stats.great * 0.7 + stats.good * 0.4) / total) *
      100
    ).toFixed(1);
    const tier = getAccuracyTier(stats);
    const tierStyle = tier ? ACCURACY_MILESTONE_STYLE[tier] : null;
    const tierPulse =
      tier === 95
        ? 0.22 + Math.sin(layout.time * 10) * 0.12
        : tier === 90
          ? 0.14 + Math.sin(layout.time * 8) * 0.08
          : tier === 80
            ? 0.08 + Math.sin(layout.time * 6) * 0.05
            : 0;

    ctx.font = '900 11px Orbitron, sans-serif';
    const accLabelColor = tierStyle ? tierStyle.color : 'rgba(255, 255, 255, 0.88)';
    drawHudOutlinedText(
      ctx,
      t('ui.acc'),
      hudRightX,
      92,
      accLabelColor,
      tierStyle
        ? {
            shadowColor: tierStyle.color,
            shadowBlur: 8 + tierPulse * 20,
          }
        : undefined,
    );
    ctx.font = '900 22px Orbitron, sans-serif';
    const accValueColor = tierStyle ? tierStyle.color : 'rgba(255, 255, 255, 0.95)';
    drawHudOutlinedText(
      ctx,
      `${acc}%`,
      hudRightX,
      116,
      accValueColor,
      tierStyle
        ? {
            shadowColor: tierStyle.color,
            shadowBlur: 12 + tierPulse * 28,
            outlineWidth: 3.5,
          }
        : undefined,
    );
  }

  const scoreLabelY = 50;
  const scoreValueY = 84;
  ctx.textAlign = 'center';
  ctx.font = 'bold 11px Orbitron, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.fillText(t('ui.score'), scoreX, scoreLabelY);
  ctx.font = 'bold 38px Orbitron, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 14;
  ctx.fillText(stats.score.toLocaleString(), scoreX, scoreValueY);
  ctx.shadowBlur = 0;

  ctx.restore();
}

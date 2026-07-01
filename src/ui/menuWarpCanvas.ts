/** メニュー画面のワープ背景キャンバス配置（select / result 共通） */

export interface MenuWarpCanvasSize {
  displayW: number;
  displayH: number;
  dpr: number;
}

/** フルスクリーン系メニュー画面の表示領域（result など host が未レイアウトのときのフォールバック） */
export function getMenuScreenViewportSize(
  host: HTMLElement,
  screenClass?: string,
): { w: number; h: number } {
  const screen = screenClass ? (host.closest(screenClass) as HTMLElement | null) : null;
  const rect = screen?.getBoundingClientRect() ?? host.getBoundingClientRect();
  const vv = window.visualViewport;
  const w = Math.max(
    1,
    Math.ceil(rect?.width ?? 0),
    Math.ceil(vv?.width ?? window.innerWidth),
    Math.ceil(window.innerWidth),
  );
  const h = Math.max(
    1,
    Math.ceil(rect?.height ?? 0),
    Math.ceil(vv?.height ?? window.innerHeight),
    Math.ceil(window.innerHeight),
  );
  return { w, h };
}

export function layoutMenuWarpCanvas(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  lite: boolean,
): MenuWarpCanvasSize {
  const rect = host.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2);
  const displayW = Math.max(1, rect.width);
  const displayH = Math.max(1, rect.height);

  canvas.width = Math.max(1, Math.floor(displayW * dpr));
  canvas.height = Math.max(1, Math.floor(displayH * dpr));
  canvas.style.width = `${displayW}px`;
  canvas.style.height = `${displayH}px`;

  return { displayW, displayH, dpr };
}

export function applyMenuCanvasTransform(ctx: CanvasRenderingContext2D, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function resizeMenuWarpCanvasHost(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D | null,
  host: HTMLElement,
  lite: boolean,
  options?: { screenClass?: string; clearCanvasStyle?: boolean },
): MenuWarpCanvasSize {
  const viewport = options?.screenClass
    ? getMenuScreenViewportSize(host, options.screenClass)
    : null;
  const rect = host.getBoundingClientRect();
  const displayW = Math.max(1, host.clientWidth || viewport?.w || rect.width || 1);
  const displayH = Math.max(1, host.clientHeight || viewport?.h || rect.height || 1);
  const dpr = Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2);

  canvas.width = Math.max(1, Math.floor(displayW * dpr));
  canvas.height = Math.max(1, Math.floor(displayH * dpr));
  if (options?.clearCanvasStyle) {
    canvas.style.removeProperty('width');
    canvas.style.removeProperty('height');
  } else {
    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;
  }
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

  return { displayW, displayH, dpr };
}

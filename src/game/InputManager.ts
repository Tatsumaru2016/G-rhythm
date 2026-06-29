import type { LaneIndex } from '../types';
import { LANE_ARROW_KEYS, LANE_KEYS } from '../types';

type KeyHandler = (lane: LaneIndex, pressed: boolean) => void;

export class InputManager {
  private pressed = [false, false, false, false];
  private handlers: KeyHandler[] = [];
  private touchLaneMap = new Map<number, LaneIndex>();

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  bindTouchZones(zones: HTMLElement[]) {
    zones.forEach((zone, i) => {
      const lane = i as LaneIndex;
      zone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) this.touchLaneMap.set(t.identifier, lane);
        this.setLane(lane, true);
      }, { passive: false });
      zone.addEventListener('touchend', (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (this.touchLaneMap.get(t.identifier) === lane) {
            this.touchLaneMap.delete(t.identifier);
            this.setLane(lane, false);
          }
        }
      }, { passive: false });
      zone.addEventListener('touchcancel', (e) => {
        for (const t of e.changedTouches) {
          if (this.touchLaneMap.get(t.identifier) === lane) {
            this.touchLaneMap.delete(t.identifier);
            this.setLane(lane, false);
          }
        }
      });
    });
  }

  onInput(handler: KeyHandler) {
    this.handlers.push(handler);
  }

  isPressed(lane: LaneIndex): boolean {
    return this.pressed[lane];
  }

  getPressedState(): boolean[] {
    return [...this.pressed];
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const lane = this.resolveLane(e.key);
    if (lane >= 0) {
      e.preventDefault();
      this.setLane(lane, true);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const lane = this.resolveLane(e.key);
    if (lane >= 0) {
      e.preventDefault();
      this.setLane(lane, false);
    }
  };

  private resolveLane(key: string): LaneIndex | -1 {
    const letter = LANE_KEYS.indexOf(key.toLowerCase() as typeof LANE_KEYS[number]);
    if (letter >= 0) return letter as LaneIndex;
    const arrow = LANE_ARROW_KEYS.indexOf(key as typeof LANE_ARROW_KEYS[number]);
    if (arrow >= 0) return arrow as LaneIndex;
    return -1;
  }

  private onBlur = () => {
    for (let i = 0; i < 4; i++) {
      if (this.pressed[i]) this.setLane(i as LaneIndex, false);
    }
  };

  private setLane(lane: LaneIndex, pressed: boolean) {
    if (this.pressed[lane] === pressed) return;
    this.pressed[lane] = pressed;
    for (const h of this.handlers) h(lane, pressed);
  }
}

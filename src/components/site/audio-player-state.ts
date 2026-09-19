/**
 * Pure audio-preview state machine (no DOM). Testable in isolation.
 *
 * States: idle → loading → playing ⇄ paused; error is terminal-until-retry.
 * Seek is expressed as a 0..1 ratio (UI progress bar) mapped to seconds.
 */

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export interface PlayerState {
  status: PlayerStatus;
  currentTime: number; // seconds
  duration: number; // seconds; 0 until known
  /** A monotonically increasing counter so consumers can detect changes. */
  revision: number;
}

export function initialPlayerState(): PlayerState {
  return { status: "idle", currentTime: 0, duration: 0, revision: 0 };
}

export type PlayerAction =
  | { type: "play" }
  | { type: "pause" }
  | { type: "loaded"; duration: number }
  | { type: "timeupdate"; currentTime: number }
  | { type: "seek"; ratio: number }
  | { type: "ended" }
  | { type: "error" }
  | { type: "reset" };

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

export function playerReducer(
  state: PlayerState,
  action: PlayerAction,
): PlayerState {
  const next = (patch: Partial<PlayerState>): PlayerState => ({
    ...state,
    ...patch,
    revision: state.revision + 1,
  });
  switch (action.type) {
    case "play":
      if (state.status === "playing") return state;
      // (Re)start: if loading, stay loading until 'loaded'; if ended, restart.
      if (state.status === "ended") {
        return next({ status: "loading", currentTime: 0 });
      }
      return next({ status: state.status === "loading" ? "loading" : "loading" });
    case "pause":
      if (state.status === "playing" || state.status === "loading") {
        return next({ status: "paused" });
      }
      return state;
    case "loaded":
      return next({ status: "playing", duration: action.duration || state.duration });
    case "timeupdate":
      return next({ currentTime: clamp(action.currentTime, 0, state.duration || action.currentTime) });
    case "seek": {
      const dur = state.duration || 0;
      const t = clamp(action.ratio, 0, 1) * dur;
      return next({ currentTime: t });
    }
    case "ended":
      if (state.status === "playing") return next({ status: "ended", currentTime: state.duration || 0 });
      return state;
    case "error":
      return next({ status: "error" });
    case "reset":
      return initialPlayerState();
    default:
      return state;
  }
}

/**
 * Single-active-preview coordinator. Only one preview may play at a time.
 * `requestPlay(id)` returns the id that must be paused (or null). Pure.
 */
export class SingleActivePreviewCoordinator {
  private activeId: string | null = null;

  requestPlay(id: string): string | null {
    if (this.activeId === id) return null; // already me
    const toPause = this.activeId;
    this.activeId = id;
    return toPause;
  }

  stop(id: string): void {
    if (this.activeId === id) this.activeId = null;
  }

  getActive(): string | null {
    return this.activeId;
  }
}

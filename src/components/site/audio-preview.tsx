"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import {
  initialPlayerState,
  playerReducer,
  SingleActivePreviewCoordinator,
} from "@/components/site/audio-player-state";
import { cn } from "@/lib/utils";

/**
 * Lightweight, accessible audio preview built on the native HTMLMediaElement.
 *
 * - Audio never autoplays. `preload="none"` so a card grid does NOT download
 *   preview bytes before the user presses play (verified by network test).
 * - Only one preview plays at a time across cards + the detail page (a
 *   module-level coordinator + pause-handler registry).
 * - Play/pause + seek (range) + elapsed/duration; loading + error states.
 * - Keyboard-operable; accessible names + states; meaning never depends on
 *   color or animation alone. Reduced motion respected (no decorative anim).
 * - Stops playback and releases listeners on unmount/navigation.
 * - A failure (missing/unsupported/expired) degrades to an honest error,
 *   never breaks the card/page.
 *
 * The component exposes a stable internal event boundary (`onPreviewEvent`)
 * that Step 8 can instrument without logging full URLs or personal data.
 */

const coordinator = new SingleActivePreviewCoordinator();
const pauseHandlers = new Map<string, () => void>();

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export interface AudioPreviewProps {
  /** Public Supabase storage URL for the compressed preview derivative. */
  src: string;
  /** Stable id (e.g. product slug) used for single-active coordination. */
  id: string;
  /** Accessible label, e.g. the product title. */
  label: string;
  variant?: "compact" | "full";
  className?: string;
  onPreviewEvent?: (kind: "play" | "pause" | "ended" | "error") => void;
}

export function AudioPreview({
  src,
  id,
  label,
  variant = "full",
  className,
  onPreviewEvent,
}: AudioPreviewProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, dispatch] = useReducer(playerReducer, null, initialPlayerState);
  const onPreviewEventRef = useRef(onPreviewEvent);
  useEffect(() => {
    onPreviewEventRef.current = onPreviewEvent;
  }, [onPreviewEvent]);

  const pause = useCallback(() => {
    const el = audioRef.current;
    if (el && !el.paused) {
      el.pause();
    }
    dispatch({ type: "pause" });
  }, []);

  // Register/unregister this player's pause handler for single-active.
  useEffect(() => {
    pauseHandlers.set(id, pause);
    return () => {
      pauseHandlers.delete(id);
      coordinator.stop(id);
    };
  }, [id, pause]);

  // Cleanup on unmount: stop + release.
  useEffect(() => {
    const el = audioRef.current;
    return () => {
      if (el) {
        el.pause();
        el.src = "";
      }
    };
  }, []);

  const handlePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    const toPause = coordinator.requestPlay(id);
    if (toPause && toPause !== id) {
      const handler = pauseHandlers.get(toPause);
      handler?.();
    }
    dispatch({ type: "play" });
    el.currentTime = state.currentTime > 0 && state.status === "ended" ? 0 : state.currentTime;
    void el.play().catch(() => dispatch({ type: "error" }));
    onPreviewEventRef.current?.("play");
  }, [id, state.currentTime, state.status]);

  const handlePause = useCallback(() => {
    pause();
    onPreviewEventRef.current?.("pause");
  }, [pause]);

  const handleSeek = useCallback((ratio: number) => {
    const el = audioRef.current;
    if (!el || !state.duration) return;
    el.currentTime = ratio * state.duration;
    dispatch({ type: "seek", ratio });
  }, [state.duration]);

  const isPlaying = state.status === "playing";
  const isLoading = state.status === "loading";
  const hasError = state.status === "error";

  const buttonAria = useMemo(() => {
    if (hasError) return `${label} — preview unavailable`;
    if (isPlaying) return `Pause preview: ${label}`;
    if (isLoading) return `Loading preview: ${label}`;
    return `Play preview: ${label}`;
  }, [hasError, isPlaying, isLoading, label]);

  if (hasError) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5",
          className,
        )}
        role="status"
      >
        <RotateCcw className="h-4 w-4 text-ink-muted" aria-hidden="true" />
        <span className="t-caption text-ink-muted">Preview unavailable</span>
        <button
          type="button"
          onClick={() => dispatch({ type: "reset" })}
          className="t-caption text-brand underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded"
        >
          Retry
        </button>
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border border-line bg-surface px-2.5 py-1.5",
        variant === "full" && "w-full",
        className,
      )}
    >
      {/* Previews are short, non-speech decorative audio; captions are N/A. */}
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        // No autoplay; not muted; controls are custom below.
        onLoadedMetadata={(e) => dispatch({ type: "loaded", duration: e.currentTarget.duration || 0 })}
        onTimeUpdate={(e) => dispatch({ type: "timeupdate", currentTime: e.currentTarget.currentTime })}
        onPlay={() => dispatch({ type: "loaded", duration: audioRef.current?.duration ?? state.duration })}
        onPause={() => dispatch({ type: "pause" })}
        onEnded={() => { dispatch({ type: "ended" }); onPreviewEventRef.current?.("ended"); }}
        onError={() => { dispatch({ type: "error" }); onPreviewEventRef.current?.("error"); }}
        className="hidden"
      >
        Your browser does not support audio preview.
      </audio>
      <button
        type="button"
        onClick={isPlaying ? handlePause : handlePlay}
        aria-label={buttonAria}
        aria-pressed={isPlaying}
        disabled={isLoading}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--canvas)] disabled:opacity-50"
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Play className="h-4 w-4 translate-x-px" aria-hidden="true" />
        )}
      </button>
      {variant === "full" ? (
        <>
          <input
            type="range"
            min={0}
            max={state.duration || 0}
            step={0.1}
            value={state.currentTime}
            onChange={(e) => handleSeek(Number(e.currentTarget.value) / (state.duration || 1))}
            aria-label={`Seek preview: ${label}`}
            className="h-1.5 flex-1 cursor-pointer accent-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded"
          />
          <span className="t-technical tabular text-ink-muted shrink-0">
            {formatTime(state.currentTime)} / {formatTime(state.duration)}
          </span>
        </>
      ) : (
        <div
          className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-inset"
          role="progressbar"
          aria-label={`Preview progress: ${label}`}
          aria-valuemin={0}
          aria-valuemax={state.duration || 0}
          aria-valuenow={state.currentTime}
        >
          <div
            className="h-full bg-brand transition-[width] duration-[var(--duration-fast)]"
            style={{ width: `${state.duration ? (state.currentTime / state.duration) * 100 : 0}%` }}
          />
        </div>
      )}
    </div>
  );
}

// Re-export for tests.
export { initialPlayerState, playerReducer, SingleActivePreviewCoordinator };

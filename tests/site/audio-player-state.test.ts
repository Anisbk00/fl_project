import { describe, it, expect } from "bun:test";
import {
  initialPlayerState,
  playerReducer,
  SingleActivePreviewCoordinator,
} from "@/components/site/audio-player-state";

describe("playerReducer state machine", () => {
  it("starts idle", () => {
    expect(initialPlayerState().status).toBe("idle");
  });

  it("play → loading; loaded → playing with duration", () => {
    let s = playerReducer(initialPlayerState(), { type: "play" });
    expect(s.status).toBe("loading");
    s = playerReducer(s, { type: "loaded", duration: 120 });
    expect(s.status).toBe("playing");
    expect(s.duration).toBe(120);
  });

  it("timeupdate advances currentTime (clamped to duration)", () => {
    let s = playerReducer(initialPlayerState(), { type: "play" });
    s = playerReducer(s, { type: "loaded", duration: 120 });
    s = playerReducer(s, { type: "timeupdate", currentTime: 30 });
    expect(s.currentTime).toBe(30);
    // Clamp to duration.
    s = playerReducer(s, { type: "timeupdate", currentTime: 9999 });
    expect(s.currentTime).toBe(120);
  });

  it("seek uses a 0..1 ratio mapped to duration", () => {
    let s = playerReducer(initialPlayerState(), { type: "play" });
    s = playerReducer(s, { type: "loaded", duration: 120 });
    s = playerReducer(s, { type: "seek", ratio: 0.5 });
    expect(s.currentTime).toBe(60);
    // Clamp ratio to 0..1.
    s = playerReducer(s, { type: "seek", ratio: 2 });
    expect(s.currentTime).toBe(120);
    s = playerReducer(s, { type: "seek", ratio: -1 });
    expect(s.currentTime).toBe(0);
  });

  it("ended → status ended at duration; play restarts at 0", () => {
    let s = playerReducer(initialPlayerState(), { type: "play" });
    s = playerReducer(s, { type: "loaded", duration: 120 });
    s = playerReducer(s, { type: "ended" });
    expect(s.status).toBe("ended");
    expect(s.currentTime).toBe(120);
    s = playerReducer(s, { type: "play" });
    expect(s.status).toBe("loading");
    expect(s.currentTime).toBe(0);
  });

  it("pause from playing/loading → paused", () => {
    let s = playerReducer(initialPlayerState(), { type: "play" });
    s = playerReducer(s, { type: "pause" });
    expect(s.status).toBe("paused");
  });

  it("error is terminal until reset", () => {
    let s = playerReducer(initialPlayerState(), { type: "play" });
    s = playerReducer(s, { type: "error" });
    expect(s.status).toBe("error");
    s = playerReducer(s, { type: "reset" });
    expect(s.status).toBe("idle");
  });

  it("revision increments on every change", () => {
    const a = initialPlayerState();
    const b = playerReducer(a, { type: "play" });
    expect(b.revision).toBeGreaterThan(a.revision);
  });
});

describe("SingleActivePreviewCoordinator", () => {
  it("returns null on first play, then the previous id to pause", () => {
    const c = new SingleActivePreviewCoordinator();
    expect(c.requestPlay("a")).toBeNull();
    expect(c.getActive()).toBe("a");
    expect(c.requestPlay("b")).toBe("a");
    expect(c.getActive()).toBe("b");
    // Requesting the same id again is a no-op (returns null).
    expect(c.requestPlay("b")).toBeNull();
  });

  it("stop clears only the active id", () => {
    const c = new SingleActivePreviewCoordinator();
    c.requestPlay("a");
    c.requestPlay("b");
    c.stop("a"); // not active, no effect
    expect(c.getActive()).toBe("b");
    c.stop("b");
    expect(c.getActive()).toBeNull();
  });
});

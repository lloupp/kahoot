import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCountdown } from "./useCountdown";

describe("useCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 when there is no deadline", () => {
    const { result } = renderHook(() => useCountdown(null));
    expect(result.current).toBe(0);
  });

  it("counts down towards a future deadline", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const { result } = renderHook(() => useCountdown(now + 5000));
    expect(result.current).toBeGreaterThan(4900);
    expect(result.current).toBeLessThanOrEqual(5000);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBeGreaterThan(2900);
    expect(result.current).toBeLessThanOrEqual(3100);
  });

  it("never goes below zero once the deadline has passed", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const { result } = renderHook(() => useCountdown(now + 1000));

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(0);
  });

  it("resets when the deadline prop changes", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const { result, rerender } = renderHook(({ endsAt }) => useCountdown(endsAt), {
      initialProps: { endsAt: now + 1000 },
    });
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(result.current).toBeLessThan(200);

    rerender({ endsAt: now + 900 + 10000 });
    expect(result.current).toBeGreaterThan(9500);
  });
});

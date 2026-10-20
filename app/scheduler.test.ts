import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleTask } from "./scheduler.server";

describe("scheduleTask", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs the task on every interval", async () => {
    const task = vi.fn(async () => {});
    const timer = scheduleTask("t", 1000, task);
    await vi.advanceTimersByTimeAsync(3500);
    expect(task).toHaveBeenCalledTimes(3);
    clearInterval(timer);
  });

  it("skips a tick while the previous run is still going", async () => {
    let release!: () => void;
    const task = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const timer = scheduleTask("slow", 1000, task);
    await vi.advanceTimersByTimeAsync(3500); // three ticks, the first never finishes
    expect(task).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);
    clearInterval(timer);
  });

  it("keeps running after a task fails", async () => {
    const task = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    const timer = scheduleTask("flaky", 1000, task);
    await vi.advanceTimersByTimeAsync(2500);
    expect(task).toHaveBeenCalledTimes(2);
    clearInterval(timer);
  });
});

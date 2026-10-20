import { processJobs } from "./restock/jobs.server";
import { reconcile } from "./restock/reconcile.server";
import { runReports } from "./reports/reports.server";
import { env } from "./utils/env.server";
import { logger } from "./utils/logger.server";

/**
 * Runs `task` every `everyMs`. A run that is still going when the next one is due is skipped, and a
 * failing run is logged instead of stopping the schedule (an unhandled rejection would otherwise take
 * the whole server down).
 */
export function scheduleTask(name: string, everyMs: number, task: () => Promise<unknown>): NodeJS.Timeout {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await task();
    } catch (err) {
      logger.error({ err, task: name }, "scheduled task failed");
    } finally {
      running = false;
    }
  }, everyMs);
  // A timer alone must not keep the process alive when the server is shutting down.
  timer.unref();
  return timer;
}

const MINUTE = 60_000;

/**
 * The jobs the app used to need an outside cron for, run inside the server instead:
 *   - queued restock emails (retries), every minute
 *   - report check (each shop's own schedule decides whether a report is due; safe to ask often), every 10 minutes
 *   - the stock check that catches missed webhooks, every 6 hours
 * The cron endpoints still exist for anyone who prefers an external scheduler: set DISABLE_SCHEDULER=true then.
 * Assumes one app instance (like the in-memory rate limiter).
 */
export function startScheduler(): void {
  const g = globalThis as { __trekivaNotifyScheduler?: boolean };
  // Once per process, even when the dev server reloads this module; never during tests.
  if (g.__trekivaNotifyScheduler || env.NODE_ENV === "test" || env.DISABLE_SCHEDULER === "true") return;
  g.__trekivaNotifyScheduler = true;

  scheduleTask("process-jobs", MINUTE, () => processJobs());
  scheduleTask("reports", 10 * MINUTE, () => runReports());
  scheduleTask("reconcile", 6 * 60 * MINUTE, () => reconcile());

  // After a restart, do not wait a full interval: a report that came due while the app was down goes out soon.
  setTimeout(() => {
    runReports().catch((err) => logger.error({ err, task: "reports" }, "scheduled task failed"));
  }, MINUTE).unref();
  logger.info("scheduler started (jobs every 1 min, reports every 10 min, stock check every 6 h)");
}

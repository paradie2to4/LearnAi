/**
 * Pure streak-calculation helpers, deliberately decoupled from Prisma so they
 * can be unit-tested with plain Date arrays (no DB, no broker).
 *
 * Known simplification (documented per the task brief): a "day" is the UTC
 * calendar day of an activity's `occurredAt` timestamp. We do not adjust for
 * the student's local timezone — a student active at 11:59pm and 12:01am
 * local time could see two different UTC days depending on their offset.
 */

export interface StreakResult {
  currentStreakDays: number;
  longestStreakDays: number;
  lastActivityDate: Date | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayKeyToDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/**
 * Computes current + longest streak (in distinct UTC calendar days) from a
 * list of activity timestamps.
 *
 * - `longestStreakDays` is the longest run of consecutive calendar days ever
 *   observed across the full history passed in (recomputed in-memory each
 *   time from the queried ActivityEvent rows for the relevant scope — no
 *   SQL window functions needed at this data scale).
 * - `currentStreakDays` counts consecutive days backward from "today" (per
 *   the `now` param). The most recent activity day is allowed to be today OR
 *   yesterday — i.e. a student who was active yesterday but hasn't done
 *   anything yet today still sees their streak intact. If the most recent
 *   activity is older than yesterday, the current streak is 0.
 */
export function computeStreak(activityTimestamps: Date[], now: Date = new Date()): StreakResult {
  if (activityTimestamps.length === 0) {
    return { currentStreakDays: 0, longestStreakDays: 0, lastActivityDate: null };
  }

  const dayKeysDescending = Array.from(new Set(activityTimestamps.map(toUtcDayKey))).sort((a, b) =>
    a < b ? 1 : a > b ? -1 : 0,
  );
  const dayKeysAscending = [...dayKeysDescending].reverse();

  let longestStreakDays = 1;
  let run = 1;
  for (let i = 1; i < dayKeysAscending.length; i++) {
    const diffDays = Math.round(
      (dayKeyToDate(dayKeysAscending[i]).getTime() - dayKeyToDate(dayKeysAscending[i - 1]).getTime()) /
        MS_PER_DAY,
    );
    run = diffDays === 1 ? run + 1 : 1;
    longestStreakDays = Math.max(longestStreakDays, run);
  }

  const mostRecentKey = dayKeysDescending[0];
  const todayKey = toUtcDayKey(now);
  const daysSinceMostRecent = Math.round(
    (dayKeyToDate(todayKey).getTime() - dayKeyToDate(mostRecentKey).getTime()) / MS_PER_DAY,
  );

  let currentStreakDays = 0;
  if (daysSinceMostRecent <= 1) {
    currentStreakDays = 1;
    for (let i = 1; i < dayKeysDescending.length; i++) {
      const diffDays = Math.round(
        (dayKeyToDate(dayKeysDescending[i - 1]).getTime() - dayKeyToDate(dayKeysDescending[i]).getTime()) /
          MS_PER_DAY,
      );
      if (diffDays === 1) {
        currentStreakDays += 1;
      } else {
        break;
      }
    }
  }

  return {
    currentStreakDays,
    longestStreakDays,
    lastActivityDate: dayKeyToDate(mostRecentKey),
  };
}

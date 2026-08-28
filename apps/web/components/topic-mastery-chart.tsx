import type { TopicMasteryDto } from '@learnai/shared';

function tierColor(score: number): string {
  if (score < 50) return 'bg-red-500';
  if (score < 70) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function tierLabel(score: number): string {
  if (score < 50) return 'Needs work';
  if (score < 70) return 'Improving';
  return 'Strong';
}

export function TopicMasteryChart({ topics }: { topics: TopicMasteryDto[] }) {
  return (
    <ul className="space-y-5">
      {topics.map((topic) => {
        const clamped = Math.min(100, Math.max(0, topic.masteryScore));
        return (
          <li key={topic.topicId}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="font-medium text-slate-800">{topic.topicName}</span>
              <span className="text-sm text-slate-500">
                {Math.round(topic.masteryScore)}% &middot; {tierLabel(topic.masteryScore)}
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={Math.round(topic.masteryScore)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${topic.topicName} mastery score`}
              className="h-3 w-full overflow-hidden rounded-full bg-slate-100"
            >
              <div
                className={`h-full rounded-full transition-all duration-500 ${tierColor(topic.masteryScore)}`}
                style={{ width: `${clamped}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {topic.attemptsCount} attempt{topic.attemptsCount === 1 ? '' : 's'} · last activity{' '}
              {new Date(topic.lastActivityAt).toLocaleDateString()}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

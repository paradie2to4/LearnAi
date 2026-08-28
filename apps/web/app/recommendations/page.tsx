'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RecommendationDto, WeakTopicDto } from '@learnai/shared';
import { RecommendationStatus } from '@learnai/shared';
import { api, ApiError } from '../../lib/api-client';
import { AppShell } from '../../components/app-shell';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardDescription, CardTitle } from '../../components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/states';

const statusTone: Record<string, 'brand' | 'success' | 'neutral'> = {
  [RecommendationStatus.ACTIVE]: 'brand',
  [RecommendationStatus.COMPLETED]: 'success',
  [RecommendationStatus.DISMISSED]: 'neutral',
};

// Severity is a numeric score without documented bounds; treat it as a 0-10 scale
// (consistent with detection heuristics elsewhere) and tier it for the badge.
function severityTone(severity: number): 'danger' | 'warning' | 'neutral' {
  if (severity >= 7) return 'danger';
  if (severity >= 4) return 'warning';
  return 'neutral';
}

function severityLabel(severity: number): string {
  if (severity >= 7) return 'High severity';
  if (severity >= 4) return 'Medium severity';
  return 'Low severity';
}

export default function RecommendationsPage() {
  const [recommendations, setRecommendations] = useState<RecommendationDto[] | null>(null);
  const [recLoading, setRecLoading] = useState(true);
  const [recError, setRecError] = useState<string | null>(null);
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());

  const [weakTopics, setWeakTopics] = useState<WeakTopicDto[] | null>(null);
  const [weakLoading, setWeakLoading] = useState(true);
  const [weakError, setWeakError] = useState<string | null>(null);

  const loadRecommendations = useCallback(() => {
    setRecLoading(true);
    setRecError(null);
    api
      .get<RecommendationDto[]>('/recommendations/me')
      .then(setRecommendations)
      .catch((err) => setRecError(err instanceof ApiError ? err.message : 'Failed to load recommendations.'))
      .finally(() => setRecLoading(false));
  }, []);

  const loadWeakTopics = useCallback(() => {
    setWeakLoading(true);
    setWeakError(null);
    api
      .get<WeakTopicDto[]>('/weak-topics/me')
      .then((topics) => setWeakTopics([...topics].sort((a, b) => b.severity - a.severity)))
      .catch((err) => setWeakError(err instanceof ApiError ? err.message : 'Failed to load weak topics.'))
      .finally(() => setWeakLoading(false));
  }, []);

  // Fired together on mount so both requests are in flight in parallel.
  useEffect(() => {
    loadRecommendations();
    loadWeakTopics();
  }, [loadRecommendations, loadWeakTopics]);

  async function handleDismiss(id: string) {
    setDismissingIds((prev) => new Set(prev).add(id));
    const previous = recommendations;
    setRecommendations((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    try {
      await api.patch(`/recommendations/${id}/dismiss`);
    } catch {
      setRecommendations(previous ?? null);
    } finally {
      setDismissingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const activeRecommendations = (recommendations ?? []).filter((r) => r.status === RecommendationStatus.ACTIVE);

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-slate-900">Recommendations</h1>
      <p className="mt-1 text-sm text-slate-500">Personalized next steps based on your activity.</p>

      <section className="mt-8" aria-labelledby="recs-heading">
        <h2 id="recs-heading" className="mb-3 text-lg font-semibold text-slate-900">
          Recommended for you
        </h2>
        {recLoading && (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}
        {!recLoading && recError && <ErrorState message={recError} onRetry={loadRecommendations} />}
        {!recLoading &&
          !recError &&
          (activeRecommendations.length === 0 ? (
            <EmptyState
              title="You're all caught up"
              description="No active recommendations right now — keep learning and we'll surface new ones."
            />
          ) : (
            <ul className="space-y-3">
              {activeRecommendations.map((rec) => (
                <li key={rec.id}>
                  <Card className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <Badge tone={statusTone[rec.status] ?? 'neutral'}>{rec.status}</Badge>
                        <span className="text-xs text-slate-400">{new Date(rec.generatedAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm text-slate-800">{rec.narrative}</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      isLoading={dismissingIds.has(rec.id)}
                      onClick={() => handleDismiss(rec.id)}
                    >
                      Dismiss
                    </Button>
                  </Card>
                </li>
              ))}
            </ul>
          ))}
      </section>

      <section className="mt-10" aria-labelledby="weak-topics-heading">
        <h2 id="weak-topics-heading" className="mb-3 text-lg font-semibold text-slate-900">
          Weak topics
        </h2>
        {weakLoading && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {!weakLoading && weakError && <ErrorState message={weakError} onRetry={loadWeakTopics} />}
        {!weakLoading &&
          !weakError &&
          (!weakTopics || weakTopics.length === 0 ? (
            <EmptyState
              title="No weak topics detected yet"
              description="Keep taking quizzes — we'll flag topics that need extra review as soon as we spot one."
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {weakTopics.map((topic) => (
                <li key={topic.id}>
                  <Card>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle>{topic.topicName}</CardTitle>
                      <Badge tone={severityTone(topic.severity)}>{severityLabel(topic.severity)}</Badge>
                    </div>
                    <CardDescription>Mastery score: {Math.round(topic.masteryScore)}%</CardDescription>
                    <p className="mt-1 text-xs text-slate-400">Detected {new Date(topic.detectedAt).toLocaleDateString()}</p>
                  </Card>
                </li>
              ))}
            </ul>
          ))}
      </section>
    </AppShell>
  );
}

'use client';

import { useState } from 'react';
import type { AiDraftQuestionDto } from '@learnai/shared';
import { api, ApiError } from '../lib/api-client';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';

export function DraftReviewCard({
  draft,
  onResolved,
}: {
  draft: AiDraftQuestionDto;
  onResolved: (draftId: string) => void;
}) {
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | 'publish' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: 'approve' | 'reject' | 'publish') {
    setPendingAction(action);
    setError(null);
    try {
      await api.post(`/ai/drafts/${draft.id}/${action}`, action === 'reject' ? {} : undefined);
      onResolved(draft.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${action} this draft.`);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge tone="brand">{draft.type.replace('_', ' ')}</Badge>
        <Badge tone="neutral">{draft.status}</Badge>
      </div>
      <p className="text-sm font-medium text-slate-900">{draft.prompt}</p>

      {draft.options.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {draft.options.map((option) => (
            <li
              key={option.id}
              className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
            >
              <span>{option.text}</span>
              {option.isCorrect && (
                <span className="ml-auto text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Correct
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {draft.explanation && <p className="mt-3 text-sm text-slate-500">{draft.explanation}</p>}

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          isLoading={pendingAction === 'approve'}
          disabled={pendingAction !== null}
          onClick={() => run('approve')}
        >
          Approve
        </Button>
        <Button
          variant="danger"
          size="sm"
          isLoading={pendingAction === 'reject'}
          disabled={pendingAction !== null}
          onClick={() => run('reject')}
        >
          Reject
        </Button>
        <Button
          variant="primary"
          size="sm"
          isLoading={pendingAction === 'publish'}
          disabled={pendingAction !== null}
          onClick={() => run('publish')}
        >
          Publish
        </Button>
      </div>
    </Card>
  );
}

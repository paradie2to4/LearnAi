'use client';

import { useCallback, useEffect, useState } from 'react';
import type { UserDto } from '@learnai/shared';
import { Role } from '@learnai/shared';
import { api, ApiError } from '../../lib/api-client';
import { AppShell } from '../../components/app-shell';
import { Card } from '../../components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/states';

const ROLE_OPTIONS = Object.values(Role);

function formatStatLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

function formatStatValue(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
  }
  return String(value);
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserDto[] | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [roleUpdating, setRoleUpdating] = useState<Set<string>>(new Set());

  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const loadUsers = useCallback(() => {
    setUsersLoading(true);
    setUsersError(null);
    api
      .get<UserDto[]>('/users')
      .then(setUsers)
      .catch((err) => setUsersError(err instanceof ApiError ? err.message : 'Failed to load users.'))
      .finally(() => setUsersLoading(false));
  }, []);

  const loadStats = useCallback(() => {
    setStatsLoading(true);
    setStatsError(null);
    api
      .get<Record<string, unknown>>('/analytics/platform')
      .then(setStats)
      .catch((err) => setStatsError(err instanceof ApiError ? err.message : 'Failed to load platform stats.'))
      .finally(() => setStatsLoading(false));
  }, []);

  useEffect(() => {
    loadUsers();
    loadStats();
  }, [loadUsers, loadStats]);

  async function handleRoleChange(userId: string, nextRole: Role) {
    const previous = users;
    setRoleUpdating((prev) => new Set(prev).add(userId));
    setUsers((prev) => (prev ? prev.map((u) => (u.id === userId ? { ...u, role: nextRole } : u)) : prev));
    try {
      await api.patch(`/users/${userId}/role`, { role: nextRole });
    } catch {
      setUsers(previous ?? null);
    } finally {
      setRoleUpdating((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }

  // Shape of GET /analytics/platform isn't fully pinned down; render whatever
  // numeric/string fields come back as a generic stat grid rather than assuming
  // exact field names.
  const statEntries = stats
    ? Object.entries(stats).filter(([, v]) => typeof v === 'number' || typeof v === 'string')
    : [];

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-slate-900">Admin</h1>
      <p className="mt-1 text-sm text-slate-500">Platform-wide stats and user management.</p>

      <section className="mt-8" aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="mb-3 text-lg font-semibold text-slate-900">
          Platform stats
        </h2>
        {statsLoading && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {!statsLoading && statsError && <ErrorState message={statsError} onRetry={loadStats} />}
        {!statsLoading &&
          !statsError &&
          (statEntries.length === 0 ? (
            <EmptyState title="No stats available" description="Platform analytics haven't been recorded yet." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {statEntries.map(([key, value]) => (
                <Card key={key}>
                  <p className="text-sm text-slate-500">{formatStatLabel(key)}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{formatStatValue(value)}</p>
                </Card>
              ))}
            </div>
          ))}
      </section>

      <section className="mt-10" aria-labelledby="users-heading">
        <h2 id="users-heading" className="mb-3 text-lg font-semibold text-slate-900">
          Users
        </h2>
        {usersLoading && (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {!usersLoading && usersError && <ErrorState message={usersError} onRetry={loadUsers} />}
        {!usersLoading &&
          !usersError &&
          (!users || users.length === 0 ? (
            <EmptyState title="No users found" />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Email
                    </th>
                    <th scope="col" className="px-4 py-3">
                      First name
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Last name
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Role
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-3 text-slate-700">{u.email}</td>
                      <td className="px-4 py-3 text-slate-700">{u.firstName}</td>
                      <td className="px-4 py-3 text-slate-700">{u.lastName}</td>
                      <td className="px-4 py-3">
                        <label htmlFor={`role-${u.id}`} className="sr-only">
                          Role for {u.email}
                        </label>
                        <select
                          id={`role-${u.id}`}
                          value={u.role}
                          disabled={roleUpdating.has(u.id)}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                          className="focus-ring rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-50"
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </section>
    </AppShell>
  );
}

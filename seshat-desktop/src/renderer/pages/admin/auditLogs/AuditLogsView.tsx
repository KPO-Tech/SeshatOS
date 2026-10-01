import { useState } from 'react'
import { Left, Right, Refresh } from '@icon-park/react'
import { AdminEmptyRow, AdminStatusBadge, AdminTable, AdminTd, AdminTh, AdminTr } from '../shared/AdminTable'
import { AUDIT_LIMIT, useAdminAuditLogs } from './useAdminAuditLogs'

function statusTone(status: string): 'success' | 'danger' | 'neutral' {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'danger'
  return 'neutral'
}

export function AuditLogsView() {
  const [offset, setOffset] = useState(0)
  const { data, loading, error, refetch } = useAdminAuditLogs(offset)

  const hasNext = data ? data.count > offset + AUDIT_LIMIT : false
  const hasPrev = offset > 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div className="text-[17px] font-semibold text-[var(--text-primary)]">Audit Logs</div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={loading}
          className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-soft)] bg-transparent px-2.5 py-1.5 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-50"
        >
          <Refresh size={12} /> Refresh
        </button>
      </div>

      <AdminTable head={<><AdminTh>Time</AdminTh><AdminTh>Actor</AdminTh><AdminTh>Action</AdminTh><AdminTh>Resource</AdminTh><AdminTh>IP</AdminTh><AdminTh>Status</AdminTh></>}>
        {loading ? (
          <AdminEmptyRow colSpan={6}>Loading…</AdminEmptyRow>
        ) : error ? (
          <AdminEmptyRow colSpan={6}>{error}</AdminEmptyRow>
        ) : !data?.logs.length ? (
          <AdminEmptyRow colSpan={6}>No logs found</AdminEmptyRow>
        ) : (
          data.logs.map((e) => (
            <AdminTr key={e.id}>
              <AdminTd muted>{new Date(e.created_at).toLocaleString()}</AdminTd>
              <AdminTd mono>{e.actor_user_id}</AdminTd>
              <AdminTd mono>{e.action}</AdminTd>
              <AdminTd muted>{e.resource_type ? `${e.resource_type}${e.resource_id ? ':' + e.resource_id.slice(0, 8) : ''}` : '—'}</AdminTd>
              <AdminTd muted mono>{e.ip_address ?? '—'}</AdminTd>
              <AdminTd><AdminStatusBadge tone={statusTone(e.status)}>{e.status}</AdminStatusBadge></AdminTd>
            </AdminTr>
          ))
        )}
      </AdminTable>

      {(hasPrev || hasNext) && (
        <div className="mt-3 flex shrink-0 items-center justify-center gap-3">
          <button type="button" onClick={() => setOffset((o) => Math.max(0, o - AUDIT_LIMIT))} disabled={!hasPrev} className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-[var(--border-soft)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-40">
            <Left size={12} />
          </button>
          <span className="text-[12px] text-[var(--text-muted)]">
            {offset + 1}-{Math.min(offset + AUDIT_LIMIT, data?.count ?? 0)} of {data?.count ?? 0}
          </span>
          <button type="button" onClick={() => setOffset((o) => o + AUDIT_LIMIT)} disabled={!hasNext} className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-[var(--border-soft)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-40">
            <Right size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

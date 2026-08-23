import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

type PageStateProps = {
  tone?: 'loading' | 'error' | 'empty';
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionPending?: boolean;
};

export function PageState({
  tone = 'empty',
  title,
  description,
  actionLabel,
  onAction,
  actionPending = false,
}: PageStateProps) {
  const isLoading = tone === 'loading';
  const isError = tone === 'error';

  return (
    <div className={`panel page-state ${tone}-state`} role={isError ? 'alert' : 'status'} aria-live="polite">
      <div className="page-state-icon" aria-hidden="true">
        {isLoading ? <Loader2 size={18} className="page-state-spinner" /> : <span>{isError ? '!' : '—'}</span>}
      </div>
      <div className="page-state-copy">
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </div>
      {actionLabel && onAction && !isLoading && (
        <button className="button button-quiet small-button page-state-action" type="button" onClick={onAction} disabled={actionPending}>
          {actionPending ? <Loader2 size={14} className="page-state-spinner" /> : <RefreshCw size={14} />}
          {actionPending ? 'กำลังลองใหม่…' : actionLabel}
        </button>
      )}
    </div>
  );
}

export default PageState;

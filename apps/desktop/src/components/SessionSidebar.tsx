import React, { useState, useRef, useEffect } from 'react';
import type { Session } from '../domain/session';

interface Props {
  sessions: Session[];
  selectedSession: Session | null;
  onSelectSession: (session: Session) => void;
  onNewSession: () => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onDeleteSession: (sessionId: string) => void;
  isRecording: boolean;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface SessionItemProps {
  session: Session;
  isSelected: boolean;
  isRecording: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}

function SessionItem({ session, isSelected, isRecording, onSelect, onRename, onDelete }: SessionItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep draft in sync if title changes externally
  useEffect(() => {
    if (!editing) setDraft(session.title);
  }, [session.title, editing]);

  function startEditing(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(session.title);
    setEditing(true);
  }

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== session.title) {
      onRename(trimmed);
    } else {
      setDraft(session.title);
    }
    setEditing(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') { setDraft(session.title); setEditing(false); }
  }

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const isLive = session.state === 'recording' && isRecording;

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmingDelete(true);
  }

  function handleDeleteConfirm(e: React.MouseEvent) {
    e.stopPropagation();
    onDelete();
  }

  function handleDeleteCancel(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmingDelete(false);
  }

  return (
    <div
      className={`session-item ${isSelected ? 'active' : ''}`}
      onClick={onSelect}
    >
      {editing ? (
        <input
          ref={inputRef}
          className="session-rename-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          onClick={e => e.stopPropagation()}
          maxLength={80}
        />
      ) : (
        <div className="session-item-title-row">
          <span className="session-item-title">{session.title}</span>
          {!isLive && (
            <button
              className="session-rename-btn"
              onClick={startEditing}
              title="Rename session"
              tabIndex={-1}
            >
              ✎
            </button>
          )}
        </div>
      )}

      <div className="session-item-meta">{formatDate(session.createdAt)}</div>

      <div className="session-item-footer">
        <span className={`session-state-badge ${session.state}`}>
          {isLive ? 'live' : session.state}
        </span>
        {!isLive && !confirmingDelete && (
          <button
            className="session-delete-btn"
            onClick={handleDeleteClick}
            title="Delete session"
            tabIndex={-1}
          >
            🗑
          </button>
        )}
        {confirmingDelete && (
          <div className="session-delete-confirm" onClick={e => e.stopPropagation()}>
            <span className="session-delete-confirm-label">Delete?</span>
            <button className="session-delete-confirm-yes" onClick={handleDeleteConfirm}>Yes</button>
            <button className="session-delete-confirm-no" onClick={handleDeleteCancel}>No</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function SessionSidebar({
  sessions,
  selectedSession,
  onSelectSession,
  onNewSession,
  onRenameSession,
  onDeleteSession,
  isRecording,
}: Props) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">Sessions</div>
        <button
          className="btn-new-session"
          onClick={onNewSession}
          title="Start a new recording session"
        >
          + New Session
        </button>
      </div>
      <div className="session-list">
        {sessions.length === 0 && (
          <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '12px' }}>
            No sessions yet. Click "New Session" to start.
          </div>
        )}
        {sessions.map(session => (
          <SessionItem
            key={session.id}
            session={session}
            isSelected={selectedSession?.id === session.id}
            isRecording={isRecording}
            onSelect={() => onSelectSession(session)}
            onRename={title => onRenameSession(session.id, title)}
            onDelete={() => onDeleteSession(session.id)}
          />
        ))}
      </div>
    </div>
  );
}

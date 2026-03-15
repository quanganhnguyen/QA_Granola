import React from 'react';
import type { Session } from '../domain/session';

interface Props {
  isRecording: boolean;
  segmentCount: number;
  session: Session | null;
}

export function StatusBar({ isRecording, segmentCount, session }: Props) {
  return (
    <div className="status-bar">
      <div className="status-indicator">
        <span className={`status-dot ${isRecording ? 'recording' : session ? 'ready' : ''}`} />
        <span>
          {isRecording ? 'Recording' : session ? 'Ready' : 'No session'}
        </span>
      </div>
      {segmentCount > 0 && (
        <span>{segmentCount} segment{segmentCount !== 1 ? 's' : ''}</span>
      )}
      {session && (
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
          {session.id.slice(0, 8)}
        </span>
      )}
    </div>
  );
}

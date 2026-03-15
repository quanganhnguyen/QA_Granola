import React from 'react';
import type { Session } from '../domain/session';
import type { QualityProfile } from '../services/transcription/QualityProfile';

interface Props {
  session: Session | null;
  isRecording: boolean;
  isMerging: boolean;
  notesVisible: boolean;
  transcriptVisible: boolean;
  summaryVisible: boolean;
  hasMerged: boolean;
  captureSystemAudio: boolean;
  systemAudioError: string | null;
  qualityProfile: QualityProfile;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onToggleNotes: () => void;
  onToggleTranscript: () => void;
  onToggleSummary: () => void;
  onRunMerge: () => void;
  onIncludeSystemAudio: (include: boolean) => void;
  onSetQualityProfile: (profile: QualityProfile) => void;
}

const PROFILE_LABELS: Record<QualityProfile, string> = {
  fast: 'Fast',
  balanced: 'Balanced',
  max: 'Max Quality',
};

export function SessionToolbar({
  session,
  isRecording,
  isMerging,
  notesVisible,
  transcriptVisible,
  summaryVisible,
  hasMerged,
  captureSystemAudio,
  systemAudioError,
  qualityProfile,
  onStartRecording,
  onStopRecording,
  onToggleNotes,
  onToggleTranscript,
  onToggleSummary,
  onRunMerge,
  onIncludeSystemAudio,
  onSetQualityProfile,
}: Props) {
  const canMerge = session && !isRecording && !isMerging;

  return (
    <div className="session-toolbar">
      <span className="session-toolbar-title">
        {session?.title ?? 'No session selected'}
      </span>

      {isRecording ? (
        <button
          className="btn-record stop"
          onClick={onStopRecording}
          title="Stop recording"
        >
          <span>■</span> Stop
        </button>
      ) : (
        <button
          className="btn-record start"
          onClick={onStartRecording}
          title={session?.state === 'stopped' ? 'Resume recording' : 'Start recording'}
        >
          <span className="record-dot" />
          {session?.state === 'stopped' ? 'Resume' : 'Record'}
        </button>
      )}

      {isRecording && (
        <span className="system-audio-group">
          <button
            className={`btn-notes-toggle ${captureSystemAudio ? 'active' : ''} ${captureSystemAudio && systemAudioError ? 'error' : ''}`}
            onClick={() => onIncludeSystemAudio(!captureSystemAudio)}
            title={
              captureSystemAudio && systemAudioError
                ? systemAudioError
                : captureSystemAudio
                  ? 'System audio capture active. Set Mac output to "QA Nola Loopback" to capture computer audio.'
                  : 'Capture computer audio (requires BlackHole). Set Mac output to "QA Nola Loopback" when recording.'
            }
          >
            {captureSystemAudio
              ? systemAudioError ? 'System audio !' : 'System audio ✓'
              : 'Meeting audio'}
          </button>
          {captureSystemAudio && systemAudioError && (
            <span className="system-audio-error" title={systemAudioError}>
              {systemAudioError}
            </span>
          )}
        </span>
      )}

      <select
        className="quality-profile-select"
        value={qualityProfile}
        onChange={(e) => onSetQualityProfile(e.target.value as QualityProfile)}
        title="Transcription quality profile"
        disabled={isRecording}
      >
        {(Object.keys(PROFILE_LABELS) as QualityProfile[]).map((p) => (
          <option key={p} value={p}>{PROFILE_LABELS[p]}</option>
        ))}
      </select>

      <div className="toolbar-divider" />

      <button
        className={`btn-notes-toggle ${transcriptVisible ? 'active' : ''}`}
        onClick={onToggleTranscript}
        title="Toggle transcript panel"
      >
        Transcript
      </button>

      <button
        className={`btn-notes-toggle ${notesVisible ? 'active' : ''}`}
        onClick={onToggleNotes}
        title="Toggle notes panel"
      >
        Notes
      </button>

      {(hasMerged || isMerging) && (
        <button
          className={`btn-notes-toggle ${summaryVisible ? 'active' : ''}`}
          onClick={onToggleSummary}
          title="Toggle AI summary panel"
        >
          Summary
        </button>
      )}

      {canMerge && (
        <button
          className="btn-merge"
          onClick={onRunMerge}
          disabled={isMerging}
          title="Generate AI summary using Claude"
        >
          {isMerging ? (
            <><span className="loading-spinner" /> Summarising…</>
          ) : (
            hasMerged ? 'Regenerate Summary' : 'AI Summary'
          )}
        </button>
      )}
    </div>
  );
}

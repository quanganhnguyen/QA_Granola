import React, { useRef, useCallback } from 'react';
import { useQaNola } from './useQaNola';
import { useMicCapture } from './useMicCapture';
import { useSystemAudioCapture } from './useSystemAudioCapture';
import { SessionSidebar } from '../components/SessionSidebar';
import { SessionToolbar } from '../components/SessionToolbar';
import { TranscriptPanel } from '../components/TranscriptPanel';
import { NotesPanel } from '../components/NotesPanel';
import { MergedPanel } from '../components/MergedPanel';
import { StatusBar } from '../components/StatusBar';

interface ResizerProps {
  onResize: (dx: number) => void;
}

function PanelResizer({ onResize }: ResizerProps) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastX.current = e.clientX;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      onResize(ev.clientX - lastX.current);
      lastX.current = ev.clientX;
    };
    const onMouseUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [onResize]);

  return <div className="panel-resizer" onMouseDown={onMouseDown} />;
}

const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 400;
const PANEL_MIN = 180;

export default function App() {
  const state = useQaNola();
  useMicCapture(state.isRecording, state.qualityProfile);
  const { systemAudioError } = useSystemAudioCapture(state.isRecording, state.captureSystemAudio, state.qualityProfile);

  const [sidebarWidth, setSidebarWidth] = React.useState(220);
  const [summaryWidth, setSummaryWidth] = React.useState(400);
  const [notesWidth, setNotesWidth] = React.useState(380);

  const showSummary = !state.isRecording && (state.mergedContent !== null || !!state.mergeError) && state.summaryVisible;
  const showNotes = state.notesVisible && !!state.selectedSession;

  return (
    <div className="app">
      <div className="titlebar">
        <span className="titlebar-title">QA Nola</span>
      </div>
      <div className="main-layout">
        <div className="sidebar" style={{ width: sidebarWidth, minWidth: SIDEBAR_MIN, flexShrink: 0 }}>
          <SessionSidebar
            sessions={state.sessions}
            selectedSession={state.selectedSession}
            onSelectSession={state.selectSession}
            onNewSession={state.newSession}
            onRenameSession={state.renameSession}
            onDeleteSession={state.deleteSession}
            isRecording={state.isRecording}
          />
        </div>

        <PanelResizer onResize={dx => setSidebarWidth(w => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w + dx)))} />

        <div className="content-area">
          <SessionToolbar
            session={state.selectedSession}
            isRecording={state.isRecording}
            isMerging={state.isMerging}
            notesVisible={state.notesVisible}
            transcriptVisible={state.transcriptVisible}
            summaryVisible={state.summaryVisible}
            hasMerged={state.mergedContent !== null}
            captureSystemAudio={state.captureSystemAudio}
            systemAudioError={systemAudioError}
            qualityProfile={state.qualityProfile}
            availableQualityProfiles={state.availableQualityProfiles}
            onStartRecording={state.startRecording}
            onStopRecording={state.stopRecording}
            onToggleNotes={state.toggleNotes}
            onToggleTranscript={state.toggleTranscript}
            onToggleSummary={state.toggleSummary}
            onRunMerge={state.runMerge}
            onIncludeSystemAudio={state.setCaptureSystemAudio}
            onSetQualityProfile={state.setQualityProfile}
          />
          <div className="session-panels">
            {state.transcriptVisible && (
              <>
                <div className="panel-wrap" style={{ flex: 1 }}>
                  <TranscriptPanel
                    segments={state.segments}
                    isRecording={state.isRecording}
                  />
                </div>
                {(showSummary || showNotes) && (
                  <PanelResizer
                    onResize={(dx) => {
                      if (showSummary) {
                        setSummaryWidth((w) => Math.max(PANEL_MIN, w - dx));
                      } else if (showNotes) {
                        setNotesWidth((w) => Math.max(PANEL_MIN, w - dx));
                      }
                    }}
                  />
                )}
              </>
            )}

            {showSummary && (
              <>
                <div
                  className="panel-wrap"
                  style={
                    state.transcriptVisible || showNotes
                      ? { width: summaryWidth }
                      : { flex: 1 }
                  }
                >
                  {state.mergeError ? (
                    <div className="merge-error-panel">
                      <div className="panel-header">AI Summary</div>
                      <div className="merge-error-body">
                        <span className="merge-error-icon">⚠</span>
                        <p>{state.mergeError}</p>
                      </div>
                    </div>
                  ) : (
                    <MergedPanel content={state.mergedContent!} />
                  )}
                </div>
                {showNotes && (
                  <PanelResizer onResize={dx => setNotesWidth(w => Math.max(PANEL_MIN, w - dx))} />
                )}
              </>
            )}

            {showNotes && (
              <div
                className="panel-wrap"
                style={
                  state.transcriptVisible || showSummary
                    ? { width: notesWidth }
                    : { flex: 1 }
                }
              >
                <NotesPanel
                  content={state.notes}
                  onChange={state.saveNotes}
                  disabled={false}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <StatusBar
        isRecording={state.isRecording}
        segmentCount={state.segments.length}
        session={state.selectedSession}
      />
    </div>
  );
}

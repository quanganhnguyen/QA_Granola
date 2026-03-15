import { useState, useEffect, useCallback, useRef } from 'react';
import type { Session, TranscriptSegment } from '../domain/session';
import { type QualityProfile, DEFAULT_PROFILE } from '../services/transcription/QualityProfile';

declare global {
  interface Window {
    qaNola: {
      getWorkletUrl: () => Promise<string>;
      systemAudio: {
        setup: () => Promise<{ available: boolean; deviceLabel?: string; blackholeUID?: string; error?: string }>;
        teardown: () => Promise<void>;
      };
      session: {
        startRecording: (sessionId?: string) => Promise<Session>;
        stopRecording: (sessionId: string) => Promise<Session>;
        newSession: () => Promise<Session>;
        getActive: () => Promise<Session | null>;
        getAll: () => Promise<Session[]>;
        getById: (id: string) => Promise<Session | null>;
        rename: (sessionId: string, title: string) => Promise<Session>;
      delete: (sessionId: string) => Promise<void>;
      };
      notes: {
        save: (sessionId: string, content: string) => Promise<void>;
        get: (sessionId: string) => Promise<{ content: string } | null>;
      };
      merge: {
        run: (sessionId: string) => Promise<{ content: string }>;
        getResult: (sessionId: string) => Promise<{ content: string } | null>;
      };
      transcript: {
        getSegments: (sessionId: string) => Promise<TranscriptSegment[]>;
        onSegment: (cb: (segment: TranscriptSegment) => void) => () => void;
      };
      audio: {
        sendChunk: (buffer: ArrayBuffer, source?: 'microphone' | 'system') => Promise<void>;
      };
      transcription: {
        setProfile: (profile: QualityProfile) => Promise<QualityProfile>;
        getProfile: () => Promise<QualityProfile>;
      };
    };
  }
}

export interface QaNolaState {
  sessions: Session[];
  activeSession: Session | null;
  selectedSession: Session | null;
  segments: TranscriptSegment[];
  notes: string;
  mergedContent: string | null;
  mergeError: string | null;
  isRecording: boolean;
  isMerging: boolean;
  notesVisible: boolean;
  transcriptVisible: boolean;
  summaryVisible: boolean;
  captureSystemAudio: boolean;
  qualityProfile: QualityProfile;
}

export interface QaNolaActions {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  newSession: () => Promise<void>;
  selectSession: (session: Session) => Promise<void>;
  saveNotes: (content: string) => void;
  runMerge: () => Promise<void>;
  toggleNotes: () => void;
  setCaptureSystemAudio: (value: boolean) => void;
  setQualityProfile: (profile: QualityProfile) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  toggleTranscript: () => void;
  toggleSummary: () => void;
}

export function useQaNola(): QaNolaState & QaNolaActions {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [notes, setNotes] = useState('');
  const [mergedContent, setMergedContent] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const isMergingRef = useRef(false);
  const [notesVisible, setNotesVisible] = useState(false);
  const [transcriptVisible, setTranscriptVisible] = useState(true);
  const [summaryVisible, setSummaryVisible] = useState(true);
  const [captureSystemAudio, setCaptureSystemAudio] = useState(false);
  const [qualityProfile, setQualityProfileState] = useState<QualityProfile>(DEFAULT_PROFILE);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.qaNola) return;
    loadSessions();
    // Sync quality profile from main process
    window.qaNola.transcription?.getProfile().then((p) => {
      if (p) setQualityProfileState(p);
    }).catch(() => {});
    const unsub = window.qaNola.transcript.onSegment((segment) => {
      setSegments(prev => [...prev, segment]);
    });
    return unsub;
  }, []);

  async function loadSessions() {
    if (!window.qaNola) return;
    try {
      const all = await window.qaNola.session.getAll();
      setSessions(all);
      const active = await window.qaNola.session.getActive();
      if (active) {
        if (active.state === 'recording') {
          // Don't open with recording on — stop any session left recording from a previous run
          try {
            const stopped = await window.qaNola.session.stopRecording(active.id);
            setActiveSession(stopped);
            setSessions(prev => prev.map(s => (s.id === stopped.id ? stopped : s)));
            setSelectedSession(stopped);
            await selectSessionData(stopped);
          } catch {
            setActiveSession(active);
            await selectSessionData(active);
          }
          setIsRecording(false);
        } else {
          setActiveSession(active);
          await selectSessionData(active);
        }
      }
    } catch (err) {
      console.error('Load sessions failed:', err);
    }
  }

  async function selectSessionData(session: Session) {
    if (!window.qaNola) return;
    setSelectedSession(session);
    const segs = await window.qaNola.transcript.getSegments(session.id);
    setSegments(segs);
    const n = await window.qaNola.notes.get(session.id);
    setNotes(n?.content ?? '');
    const merged = await window.qaNola.merge.getResult(session.id);
    setMergedContent(merged?.content ?? null);
  }

  const startRecording = useCallback(async () => {
    if (!window.qaNola) {
      console.error('App API not available');
      return;
    }
    try {
      const sessionId = activeSession?.state === 'stopped' ? activeSession.id : undefined;
      const session = await window.qaNola.session.startRecording(sessionId);
      setActiveSession(session);
      setIsRecording(true);
      setSessions(prev => {
        const idx = prev.findIndex(s => s.id === session.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = session;
          return next;
        }
        return [session, ...prev];
      });
      await selectSessionData(session);
    } catch (err) {
      console.error('Start recording failed:', err);
      setIsRecording(false);
    }
  }, [activeSession]);

  const stopRecording = useCallback(async () => {
    if (!activeSession || !window.qaNola) return;
    try {
      const stopped = await window.qaNola.session.stopRecording(activeSession.id);
      setActiveSession(stopped);
      setIsRecording(false);
      setCaptureSystemAudio(false);
      setSessions(prev => prev.map(s => s.id === stopped.id ? stopped : s));
      setSelectedSession(stopped);
    } catch (err) {
      console.error('Stop recording failed:', err);
      setIsRecording(false);
      setCaptureSystemAudio(false);
    }
  }, [activeSession]);

  const newSession = useCallback(async () => {
    if (!window.qaNola) return;
    if (isRecording && activeSession) {
      await window.qaNola.session.stopRecording(activeSession.id);
    }
    const session = await window.qaNola.session.startRecording();
    setActiveSession(session);
    setIsRecording(true);
    setSegments([]);
    setNotes('');
    setMergedContent(null);
    setSessions(prev => [session, ...prev]);
    setSelectedSession(session);
  }, [isRecording, activeSession]);

  const selectSession = useCallback(async (session: Session) => {
    await selectSessionData(session);
  }, []);

  const saveNotes = useCallback((content: string) => {
    setNotes(content);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const sessionId = selectedSession?.id;
      if (sessionId && window.qaNola) {
        await window.qaNola.notes.save(sessionId, content);
      }
    }, 500);
  }, [selectedSession]);

  const runMerge = useCallback(async () => {
    if (!selectedSession || !window.qaNola) return;
    if (isMergingRef.current) return;
    isMergingRef.current = true;
    setIsMerging(true);
    setMergeError(null);
    try {
      const result = await window.qaNola.merge.run(selectedSession.id);
      setMergedContent(result.content);
      const updated = await window.qaNola.session.getById(selectedSession.id);
      if (updated) {
        setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
        setSelectedSession(updated);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('credit balance')) {
        setMergeError('Your Anthropic account has no credits. Add credits at console.anthropic.com → Plans & Billing.');
      } else {
        setMergeError(`AI Summary failed: ${msg}`);
      }
    } finally {
      isMergingRef.current = false;
      setIsMerging(false);
    }
  }, [selectedSession]);

  const toggleNotes = useCallback(() => {
    setNotesVisible(v => !v);
  }, []);

  const toggleTranscript = useCallback(() => {
    setTranscriptVisible(v => !v);
  }, []);

  const toggleSummary = useCallback(() => {
    setSummaryVisible(v => !v);
  }, []);

  const setQualityProfile = useCallback(async (profile: QualityProfile) => {
    if (!window.qaNola?.transcription) return;
    const confirmed = await window.qaNola.transcription.setProfile(profile);
    setQualityProfileState(confirmed ?? profile);
  }, []);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    if (!window.qaNola) return;
    const updated = await window.qaNola.session.rename(sessionId, title);
    setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
    if (selectedSession?.id === updated.id) setSelectedSession(updated);
    if (activeSession?.id === updated.id) setActiveSession(updated);
  }, [selectedSession, activeSession]);

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!window.qaNola) return;
    await window.qaNola.session.delete(sessionId);
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (selectedSession?.id === sessionId) {
      setSelectedSession(null);
      setSegments([]);
      setNotes('');
      setMergedContent(null);
      setMergeError(null);
    }
    if (activeSession?.id === sessionId) {
      setActiveSession(null);
      setIsRecording(false);
    }
  }, [selectedSession, activeSession]);

  return {
    sessions,
    activeSession,
    selectedSession,
    segments,
    notes,
    mergedContent,
    mergeError,
    isRecording,
    isMerging,
    notesVisible,
    transcriptVisible,
    summaryVisible,
    captureSystemAudio,
    qualityProfile,
    startRecording,
    stopRecording,
    newSession,
    selectSession,
    saveNotes,
    runMerge,
    toggleNotes,
    setCaptureSystemAudio,
    setQualityProfile,
    renameSession,
    deleteSession,
    toggleTranscript,
    toggleSummary,
  };
}

import { ipcMain, BrowserWindow } from 'electron';
import type { SessionService } from '../src/services/SessionService';
import type { NotesService } from '../src/services/NotesService';
import type { ClaudeMergeService } from '../src/services/merge/ClaudeMergeService';
import type { AudioCaptureService } from '../src/services/audio/AudioCaptureService';
import type { TranscriptionRouter } from '../src/services/transcription/TranscriptionRouter';

interface HandlerDeps {
  sessionService: SessionService;
  notesService: NotesService;
  mergeService: ClaudeMergeService;
  audioCapture: AudioCaptureService;
  transcriptionRouter: TranscriptionRouter;
}

export function registerIpcHandlers(deps: HandlerDeps): void {
  const { sessionService, notesService, mergeService, audioCapture, transcriptionRouter } = deps;

  ipcMain.handle('session:new', async () => {
    return sessionService.createSession();
  });

  // Track the active segment listener so we can remove it before registering a new one.
  // Without this, every startRecording call stacks another listener and each segment
  // gets inserted into SQLite multiple times → UNIQUE constraint failures.
  let activeSegmentListener: ((segment: import('../src/domain/session').TranscriptSegment) => void) | null = null;

  ipcMain.handle('session:startRecording', async (_event, sessionId?: string) => {
    let listener: ((segment: import('../src/domain/session').TranscriptSegment) => void) | null = null;
    try {
      const session = sessionId
        ? await sessionService.resumeSession(sessionId)
        : await sessionService.createSession();

      // Remove any previously registered listener before adding a new one
      if (activeSegmentListener) {
        transcriptionRouter.removeSegmentListener(activeSegmentListener);
        activeSegmentListener = null;
      }

      listener = (segment) => {
        sessionService.appendTranscriptSegment(session.id, segment);
        BrowserWindow.getAllWindows()[0]?.webContents.send('transcript:segment', segment);
      };
      activeSegmentListener = listener;
      transcriptionRouter.onSegment(activeSegmentListener);

      await audioCapture.start(session.id);
      return session;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[IPC] session:startRecording failed:', message);
      if (listener && activeSegmentListener === listener) {
        transcriptionRouter.removeSegmentListener(listener);
        activeSegmentListener = null;
      }
      throw err;
    }
  });

  ipcMain.handle('session:stopRecording', async (_event, sessionId: string) => {
    await audioCapture.stop();
    // Clean up the segment listener when recording stops
    if (activeSegmentListener) {
      transcriptionRouter.removeSegmentListener(activeSegmentListener);
      activeSegmentListener = null;
    }
    return sessionService.stopSession(sessionId);
  });

  ipcMain.handle('session:getActive', async () => {
    return sessionService.getActiveSession();
  });

  ipcMain.handle('session:getAll', async () => {
    return sessionService.getAllSessions();
  });

  ipcMain.handle('session:getById', async (_event, id: string) => {
    return sessionService.getSessionById(id);
  });

  ipcMain.handle('session:rename', async (_event, sessionId: string, title: string) => {
    return sessionService.renameSession(sessionId, title);
  });

  ipcMain.handle('session:delete', async (_event, sessionId: string) => {
    return sessionService.deleteSession(sessionId);
  });

  ipcMain.handle('notes:save', async (_event, sessionId: string, content: string) => {
    return notesService.saveNotes(sessionId, content);
  });

  ipcMain.handle('notes:get', async (_event, sessionId: string) => {
    return notesService.getNotes(sessionId);
  });

  ipcMain.handle('merge:run', async (_event, sessionId: string) => {
    return mergeService.merge(sessionId);
  });

  ipcMain.handle('merge:getResult', async (_event, sessionId: string) => {
    return mergeService.getMergedOutput(sessionId);
  });

  ipcMain.handle('transcript:getSegments', async (_event, sessionId: string) => {
    return sessionService.getTranscriptSegments(sessionId);
  });

  let audioChunkCount = 0;
  ipcMain.handle('audio:chunk', (_event, arrayBuffer: ArrayBuffer, source?: 'microphone' | 'system') => {
    try {
      if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength === 0) return;
      audioChunkCount += 1;
      if (audioChunkCount <= 3 || audioChunkCount % 10 === 0) {
        console.log('[QA Nola] Main received audio chunk #' + audioChunkCount + ', size ' + arrayBuffer.byteLength + ' bytes, source ' + (source ?? 'microphone'));
      }
      audioCapture.feedChunk(Buffer.from(arrayBuffer), source ?? 'microphone');
    } catch (err) {
      console.error('[QA Nola] audio:chunk error:', err);
    }
  });

  ipcMain.handle('transcription:setProfile', (_event, profile: string) => {
    const valid = ['fast', 'balanced', 'max'] as const;
    if (!valid.includes(profile as typeof valid[number])) {
      console.warn(`[IPC] Invalid quality profile: ${profile}`);
      return;
    }
    transcriptionRouter.setQualityProfile(profile as typeof valid[number]);
    return transcriptionRouter.getQualityProfile();
  });

  ipcMain.handle('transcription:getProfile', () => {
    return transcriptionRouter.getQualityProfile();
  });
}

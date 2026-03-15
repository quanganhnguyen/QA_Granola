import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('qaNola', {
  getWorkletUrl: () => ipcRenderer.invoke('get-worklet-url') as Promise<string>,
  logToMain: (msg: string) => ipcRenderer.send('renderer-log', msg),
  systemAudio: {
    setup: () => ipcRenderer.invoke('system-audio:setup') as Promise<{ available: boolean; deviceLabel?: string; error?: string }>,
    teardown: () => ipcRenderer.invoke('system-audio:teardown') as Promise<void>,
  },
  session: {
    startRecording: (sessionId?: string) =>
      ipcRenderer.invoke('session:startRecording', sessionId),
    stopRecording: (sessionId: string) =>
      ipcRenderer.invoke('session:stopRecording', sessionId),
    newSession: () => ipcRenderer.invoke('session:new'),
    getActive: () => ipcRenderer.invoke('session:getActive'),
    getAll: () => ipcRenderer.invoke('session:getAll'),
    getById: (id: string) => ipcRenderer.invoke('session:getById', id),
    rename: (sessionId: string, title: string) =>
      ipcRenderer.invoke('session:rename', sessionId, title),
    delete: (sessionId: string) =>
      ipcRenderer.invoke('session:delete', sessionId),
  },
  notes: {
    save: (sessionId: string, content: string) =>
      ipcRenderer.invoke('notes:save', sessionId, content),
    get: (sessionId: string) =>
      ipcRenderer.invoke('notes:get', sessionId),
  },
  merge: {
    run: (sessionId: string) =>
      ipcRenderer.invoke('merge:run', sessionId),
    getResult: (sessionId: string) =>
      ipcRenderer.invoke('merge:getResult', sessionId),
  },
  transcript: {
    getSegments: (sessionId: string) =>
      ipcRenderer.invoke('transcript:getSegments', sessionId),
    onSegment: (callback: (segment: unknown) => void) => {
      const handler = (_: Electron.IpcRendererEvent, segment: unknown) =>
        callback(segment);
      ipcRenderer.on('transcript:segment', handler);
      return () => ipcRenderer.removeListener('transcript:segment', handler);
    },
  },
  audio: {
    sendChunk: (buffer: ArrayBuffer, source?: 'microphone' | 'system') =>
      ipcRenderer.invoke('audio:chunk', buffer, source),
  },
  transcription: {
    setProfile: (profile: 'fast' | 'balanced' | 'max') =>
      ipcRenderer.invoke('transcription:setProfile', profile),
    getProfile: () =>
      ipcRenderer.invoke('transcription:getProfile'),
  },
  window: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
  },
});

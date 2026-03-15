import { app, BrowserWindow, ipcMain, systemPreferences, dialog } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { SessionRepository } from '../src/storage/sqlite/SessionRepository';
import { NotesRepository } from '../src/storage/sqlite/NotesRepository';
import { TranscriptRepository } from '../src/storage/sqlite/TranscriptRepository';
import { MergedOutputRepository } from '../src/storage/sqlite/MergedOutputRepository';
import { DatabaseManager } from '../src/storage/sqlite/DatabaseManager';
import { SessionService } from '../src/services/SessionService';
import { NotesService } from '../src/services/NotesService';
import { TranscriptionRouter } from '../src/services/transcription/TranscriptionRouter';
import { ClaudeMergeService } from '../src/services/merge/ClaudeMergeService';
import { AudioCaptureService } from '../src/services/audio/AudioCaptureService';
import { ModelRegistry } from '../src/services/transcription/ModelRegistry';
import { registerIpcHandlers } from './ipcHandlers';

const isDev = process.env.NODE_ENV === 'development';

// Load Anthropic API key from file if not already set in environment.
// Must use only paths available before app ready (no app.getPath here).
if (!process.env.ANTHROPIC_API_KEY) {
  const keyPaths = [
    path.join(process.cwd(), 'anthropic_api_key.txt'),
    path.join(process.cwd(), '..', '..', 'anthropic_api_key.txt'),
    path.join(__dirname, '..', '..', 'anthropic_api_key.txt'),
    path.join(__dirname, '..', '..', '..', 'anthropic_api_key.txt'),
  ];
  for (const keyPath of keyPaths) {
    try {
      const key = fs.readFileSync(keyPath, 'utf8').trim();
      if (key) {
        process.env.ANTHROPIC_API_KEY = key;
        console.log('[QA Nola] Loaded Anthropic API key from', keyPath);
        break;
      }
    } catch { /* file not found, try next */ }
  }
}

const APP_NAME = 'QA Nola';

let startupLogPath: string | null = null;

function logStartup(msg: string, err?: unknown): void {
  const line = `[${new Date().toISOString()}] ${msg}${err != null ? ` ${err instanceof Error ? err.message : String(err)}` : ''}\n`;
  console.log('[QA Nola]', msg, err ?? '');
  if (startupLogPath) {
    try {
      fs.appendFileSync(startupLogPath, line);
    } catch { /* ignore */ }
  }
}

// Prevent uncaught errors in main process from quitting the app (e.g. during recording).
process.on('uncaughtException', (err) => {
  logStartup('Uncaught exception', err);
});

process.on('unhandledRejection', (reason, _promise) => {
  logStartup('Unhandled rejection', reason);
});

function getResourcePath(relativePath: string): string {
  if (isDev) {
    return path.join(process.cwd(), relativePath);
  }
  return path.join(process.resourcesPath, relativePath);
}

/** Resolve path to app files (renderer, preload). Use app path in production so it works from .app bundle. */
function getAppPath(relativePath: string): string {
  if (isDev) {
    return path.join(process.cwd(), relativePath);
  }
  return path.join(app.getAppPath(), relativePath);
}

async function createWindow(): Promise<BrowserWindow> {
  const preloadPath = getAppPath(path.join('dist', 'electron', 'preload.js'));
  const indexPath = getAppPath(path.join('dist', 'renderer', 'index.html'));

  logStartup('Creating window', { preloadPath, indexPath });

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setTitle(APP_NAME);

  if (isDev) {
    await win.loadURL('http://localhost:5173');
    // DevTools left closed by default to avoid "DevTools was disconnected" when
    // the renderer crashes; use View → Toggle Developer Tools when debugging.
    // win.webContents.openDevTools();
  } else {
    if (!fs.existsSync(indexPath)) {
      logStartup('Renderer index.html missing at ' + indexPath);
      throw new Error('App file missing: ' + indexPath);
    }
    await win.loadFile(indexPath);
  }

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Electron] Renderer process gone:', details.reason, 'exitCode:', details.exitCode);
  });
  win.webContents.on('unresponsive', () => {
    console.warn('[Electron] Renderer unresponsive');
  });

  return win;
}

async function bootstrap(): Promise<void> {
  const dbPath = path.join(app.getPath('userData'), 'qa_nola.db');
  const modelsPath = getResourcePath('models');

  const db = new DatabaseManager(dbPath);
  db.migrate();

  const sessionRepo = new SessionRepository(db);
  const notesRepo = new NotesRepository(db);
  const transcriptRepo = new TranscriptRepository(db);
  const mergedRepo = new MergedOutputRepository(db);

  const modelRegistry = new ModelRegistry(modelsPath);
  await modelRegistry.verify();

  const transcriptionRouter = new TranscriptionRouter(modelRegistry);
  const whisperCwdPath = isDev
    ? null
    : path.join(app.getAppPath().replace('app.asar', 'app.asar.unpacked'), 'node_modules', 'whisper-node', 'lib', 'whisper.cpp');
  const mainBinary = whisperCwdPath ? path.join(whisperCwdPath, 'main') : null;
  if (mainBinary) {
    try {
      logStartup('Whisper path: ' + whisperCwdPath + ', main exists: ' + fs.existsSync(mainBinary));
    } catch { /* ignore */ }
  }
  const audioCapture = new AudioCaptureService(transcriptionRouter, whisperCwdPath);
  const sessionService = new SessionService(sessionRepo, transcriptRepo);
  const notesService = new NotesService(notesRepo);
  const mergeService = new ClaudeMergeService(mergedRepo, transcriptRepo, notesRepo);

  registerIpcHandlers({
    sessionService,
    notesService,
    mergeService,
    audioCapture,
    transcriptionRouter,
  });

  ipcMain.on('renderer-log', (_event, msg: string) => {
    console.log('[Renderer]', msg);
  });

  // System audio loopback via BlackHole virtual audio driver
  ipcMain.handle('system-audio:setup', () => {
    try {
      // Resolve script relative to main process (dist/electron/main.js in dev) so it works regardless of cwd
      const scriptPath = isDev
        ? path.join(__dirname, '..', '..', 'scripts', 'setup-loopback.sh')
        : path.join(app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked'), 'scripts', 'setup-loopback.sh');
      console.log(`[QA Nola] system-audio:setup scriptPath=${scriptPath}, __dirname=${__dirname}, exists=${fs.existsSync(scriptPath)}`);
      if (!fs.existsSync(scriptPath)) {
        return { available: false, error: `Loopback setup script not found: ${scriptPath}` };
      }
      const result = execFileSync('/bin/bash', [scriptPath], { encoding: 'utf8', timeout: 30000 });
      console.log('[QA Nola] system-audio:setup result:', result.trim());
      return JSON.parse(result.trim());
    } catch (err) {
      console.error('[QA Nola] system-audio:setup failed:', err);
      return { available: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('system-audio:teardown', () => {
    // We no longer auto-switch output, so nothing to restore.
  });

  const devWorkletUrl = 'http://localhost:5173/pcm-capture-worklet.js';
  ipcMain.handle('get-worklet-url', () => {
    if (isDev) return devWorkletUrl;
    const unpackedDir = app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked');
    const workletPath = path.join(unpackedDir, 'dist', 'renderer', 'pcm-capture-worklet.js');
    return pathToFileURL(workletPath).href;
  });
}

app.whenReady().then(async () => {
  try {
    startupLogPath = path.join(app.getPath('userData'), 'startup.log');
    fs.writeFileSync(startupLogPath, `[${new Date().toISOString()}] QA Nola starting (${isDev ? 'dev' : 'prod'})\n`);
  } catch { /* ignore */ }

  app.setName(APP_NAME);
  logStartup('App ready, resourcesPath=' + (process as unknown as { resourcesPath?: string }).resourcesPath);

  if (process.platform === 'darwin') {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    if (micStatus !== 'granted') {
      await systemPreferences.askForMediaAccess('microphone');
    }
  }

  try {
    logStartup('Bootstrap starting');
    await bootstrap();
    logStartup('Bootstrap done');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    logStartup('Bootstrap failed', err);
    if (stack) {
      try { fs.appendFileSync(startupLogPath!, stack + '\n'); } catch { /* ignore */ }
    }
    await dialog.showMessageBox({
      type: 'error',
      title: APP_NAME,
      message: 'Failed to start',
      detail: message + (startupLogPath ? `\n\nLog: ${startupLogPath}` : '\n\nRun from Terminal to see the error: open -a "QA Nola"') + '\n\nmacOS log: ~/Library/Logs/QA Nola/',
    });
    app.quit();
    return;
  }

  let win: BrowserWindow;
  try {
    win = await createWindow();
    logStartup('Window created');
  } catch (err) {
    logStartup('Create window failed', err);
    await dialog.showMessageBox({
      type: 'error',
      title: APP_NAME,
      message: 'Could not open window',
      detail: err instanceof Error ? err.message : String(err) + (startupLogPath ? `\n\nLog: ${startupLogPath}` : ''),
    });
    app.quit();
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  ipcMain.on('window-minimize', () => win.minimize());
  ipcMain.on('window-maximize', () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window-close', () => win.close());

  if (!isDev) {
    setImmediate(() => {
      try {
        const { autoUpdater } = require('electron-updater');
        const updateUrl = process.env.QA_NOLA_UPDATE_URL;
        if (updateUrl) {
          autoUpdater.setFeedURL({ provider: 'generic', url: updateUrl });
        }
        autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
          logStartup('Auto-update check failed (ignore if no update server)', err);
        });
      } catch (err) {
        logStartup('Auto-updater init failed', err);
      }
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

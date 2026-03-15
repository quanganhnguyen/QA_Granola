import type { SessionState } from '../domain/session';

type SessionEvent =
  | 'startRecording'
  | 'stopRecording'
  | 'startMerge'
  | 'completeMerge';

type StateChangeListener = (from: SessionState, to: SessionState) => void;

const TRANSITIONS: Record<SessionState, Partial<Record<SessionEvent, SessionState>>> = {
  idle: {
    startRecording: 'recording',
  },
  recording: {
    stopRecording: 'stopped',
  },
  stopped: {
    startRecording: 'recording',
    startMerge: 'merging',
  },
  merging: {
    completeMerge: 'merged',
  },
  merged: {},
};

export class SessionStateMachine {
  private _state: SessionState;
  private listeners: StateChangeListener[] = [];

  constructor(initialState: SessionState) {
    this._state = initialState;
  }

  get state(): SessionState {
    return this._state;
  }

  canTransition(event: SessionEvent): boolean {
    return event in (TRANSITIONS[this._state] ?? {});
  }

  transition(event: SessionEvent): void {
    const next = TRANSITIONS[this._state]?.[event];
    if (!next) {
      throw new Error(
        `Invalid transition: ${event} from state ${this._state}`
      );
    }
    const prev = this._state;
    this._state = next;
    for (const listener of this.listeners) {
      listener(prev, next);
    }
  }

  onStateChange(listener: StateChangeListener): void {
    this.listeners.push(listener);
  }
}

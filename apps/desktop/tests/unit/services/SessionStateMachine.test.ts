import { SessionStateMachine } from '../../../src/services/SessionStateMachine';
import type { SessionState } from '../../../src/domain/session';

describe('SessionStateMachine', () => {
  test('initial state is idle', () => {
    const sm = new SessionStateMachine('idle');
    expect(sm.state).toBe('idle');
  });

  test('can transition idle -> recording', () => {
    const sm = new SessionStateMachine('idle');
    sm.transition('startRecording');
    expect(sm.state).toBe('recording');
  });

  test('can transition recording -> stopped', () => {
    const sm = new SessionStateMachine('recording');
    sm.transition('stopRecording');
    expect(sm.state).toBe('stopped');
  });

  test('can transition stopped -> recording (resume)', () => {
    const sm = new SessionStateMachine('stopped');
    sm.transition('startRecording');
    expect(sm.state).toBe('recording');
  });

  test('can transition stopped -> merging', () => {
    const sm = new SessionStateMachine('stopped');
    sm.transition('startMerge');
    expect(sm.state).toBe('merging');
  });

  test('can transition merging -> merged', () => {
    const sm = new SessionStateMachine('merging');
    sm.transition('completeMerge');
    expect(sm.state).toBe('merged');
  });

  test('throws on invalid transition from idle -> stopped', () => {
    const sm = new SessionStateMachine('idle');
    expect(() => sm.transition('stopRecording')).toThrow();
  });

  test('throws on invalid transition from recording -> merged', () => {
    const sm = new SessionStateMachine('recording');
    expect(() => sm.transition('completeMerge')).toThrow();
  });

  test('canTransition returns true for valid transition', () => {
    const sm = new SessionStateMachine('idle');
    expect(sm.canTransition('startRecording')).toBe(true);
  });

  test('canTransition returns false for invalid transition', () => {
    const sm = new SessionStateMachine('idle');
    expect(sm.canTransition('stopRecording')).toBe(false);
  });

  test('emits state change event on transition', () => {
    const sm = new SessionStateMachine('idle');
    const changes: Array<{ from: SessionState; to: SessionState }> = [];
    sm.onStateChange((from, to) => changes.push({ from, to }));
    sm.transition('startRecording');
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ from: 'idle', to: 'recording' });
  });
});

import { SessionStateMachine } from '../../../src/services/SessionStateMachine';

describe('SessionStateMachine branch coverage', () => {
  test('merged state has no valid transitions', () => {
    const sm = new SessionStateMachine('merged');
    expect(sm.canTransition('startRecording')).toBe(false);
    expect(sm.canTransition('stopRecording')).toBe(false);
    expect(sm.canTransition('startMerge')).toBe(false);
    expect(sm.canTransition('completeMerge')).toBe(false);
  });

  test('multiple listeners all receive state change', () => {
    const sm = new SessionStateMachine('idle');
    const events1: string[] = [];
    const events2: string[] = [];
    sm.onStateChange((_, to) => events1.push(to));
    sm.onStateChange((_, to) => events2.push(to));
    sm.transition('startRecording');
    expect(events1).toEqual(['recording']);
    expect(events2).toEqual(['recording']);
  });

  test('throws on invalid transition from merging', () => {
    const sm = new SessionStateMachine('merging');
    expect(() => sm.transition('startRecording')).toThrow(/invalid transition/i);
  });

  test('canTransition returns false for all events from merged state', () => {
    const sm = new SessionStateMachine('merged');
    const events = ['startRecording', 'stopRecording', 'startMerge', 'completeMerge'] as const;
    for (const event of events) {
      expect(sm.canTransition(event)).toBe(false);
    }
  });

  test('full lifecycle transitions work end-to-end', () => {
    const sm = new SessionStateMachine('idle');
    sm.transition('startRecording');
    expect(sm.state).toBe('recording');
    sm.transition('stopRecording');
    expect(sm.state).toBe('stopped');
    sm.transition('startMerge');
    expect(sm.state).toBe('merging');
    sm.transition('completeMerge');
    expect(sm.state).toBe('merged');
  });
});

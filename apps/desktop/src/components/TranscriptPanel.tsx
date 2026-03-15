import React, { useEffect, useRef } from 'react';
import type { TranscriptSegment } from '../domain/session';

interface Props {
  segments: TranscriptSegment[];
  isRecording: boolean;
}

/** Punctuation that should never have a space before it. */
const ATTACH_LEFT_RE = /^[.,!?;:)\]%'"]/;

/**
 * Join segment texts into one flowing paragraph with correct punctuation spacing.
 * Each segment is already a full sentence from the engine, so we join them
 * with a space — but strip any leading space before punctuation that bleeds
 * over from a previous segment boundary.
 */
function toContinuousText(segments: TranscriptSegment[]): string {
  if (segments.length === 0) return '';

  const parts = segments.map((s) => s.text.trim()).filter(Boolean);
  if (parts.length === 0) return '';

  let text = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const next = parts[i];
    const prevEndsWithSentencePunct = /[.!?]["']?\s*$/.test(text);

    if (ATTACH_LEFT_RE.test(next)) {
      // Punctuation token: attach without space
      text = text + next;
    } else if (prevEndsWithSentencePunct) {
      // Previous segment ended a sentence — start new one capitalized with a space
      const capitalized = next.charAt(0).toUpperCase() + next.slice(1);
      text = text + ' ' + capitalized;
    } else {
      // Continuation of same sentence — join with space, no forced capitalization
      text = text + ' ' + next;
    }
  }

  // Normalize multiple spaces
  text = text.replace(/\s+/g, ' ').trim();
  // Remove space before punctuation
  text = text.replace(/\s+([.,!?;:)\]%])/g, '$1');
  // Ensure one space after sentence-ending punctuation before next word
  text = text.replace(/([.!?])([A-Za-z])/g, '$1 $2');
  // Capitalize first character of the whole text
  if (/^[a-z]/.test(text)) text = text[0].toUpperCase() + text.slice(1);
  // Capitalize after sentence-ending punctuation throughout
  text = text.replace(/([.!?]\s+)([a-z])/g, (_, punct, letter) => punct + letter.toUpperCase());

  return text;
}

export function TranscriptPanel({ segments, isRecording }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments.length]);

  const continuousText = toContinuousText(segments);

  return (
    <div className="transcript-panel">
      <div className="panel-header">
        Transcript
        {isRecording && (
          <span style={{ marginLeft: 8, color: 'var(--recording)', fontSize: '10px' }}>
            ● LIVE
          </span>
        )}
      </div>
      <div className="transcript-scroll">
        {segments.length === 0 ? (
          <div className="transcript-empty">
            {isRecording
              ? 'Listening… transcript will appear here.'
              : 'No transcript yet. Start recording to begin.'}
          </div>
        ) : (
          <div className="transcript-continuous">
            <p className="transcript-text">{continuousText}</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

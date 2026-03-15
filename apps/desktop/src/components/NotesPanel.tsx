import React from 'react';

interface Props {
  content: string;
  onChange: (content: string) => void;
  disabled: boolean;
}

export function NotesPanel({ content, onChange, disabled }: Props) {
  return (
    <div className="notes-panel">
      <div className="panel-header">Notes</div>
      <textarea
        className="notes-textarea"
        value={content}
        onChange={e => onChange(e.target.value)}
        placeholder={
          '## My Notes\n\nStart typing here…\n\nYour notes will be preserved exactly when merging with the transcript.'
        }
        disabled={disabled}
        spellCheck
      />
    </div>
  );
}

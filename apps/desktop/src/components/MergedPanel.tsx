import React from 'react';

interface Props {
  content: string;
}

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    if (line.startsWith('### ')) {
      elements.push(<h3 key={key++}>{line.slice(4)}</h3>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={key++}>{line.slice(3)}</h2>);
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={key++}>{line.slice(2)}</h1>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(<li key={key++}>{line.slice(2)}</li>);
    } else if (line.trim() === '') {
      elements.push(<br key={key++} />);
    } else {
      elements.push(<p key={key++}>{line}</p>);
    }
  }

  return elements;
}

export function MergedPanel({ content }: Props) {
  return (
    <div className="merged-panel">
      <div className="panel-header">AI Summary</div>
      <div className="merged-content">
        {renderMarkdown(content)}
      </div>
    </div>
  );
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from './app/ErrorBoundary';
import App from './app/App';
import './app/styles.css';

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  event.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

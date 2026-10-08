import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ProjectProvider } from './store/ProjectContext';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProjectProvider>
      <App />
    </ProjectProvider>
  </StrictMode>,
);

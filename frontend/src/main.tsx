import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/700.css';
import '@fontsource/jetbrains-mono/400.css';
import './style.css';

createRoot(document.getElementById('root')!).render(<App />);

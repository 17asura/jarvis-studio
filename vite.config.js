import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/llm': 'http://127.0.0.1:3000',
      '/transcribe': 'http://127.0.0.1:3000',
      '/tts': 'http://127.0.0.1:3000',
      '/memory': 'http://127.0.0.1:3000',
      '/chats': 'http://127.0.0.1:3000',
      '/system_stats': 'http://127.0.0.1:3000',
      '/run_code': 'http://127.0.0.1:3000',
      '/generate_pdf': 'http://127.0.0.1:3000',
      '/generate_image': 'http://127.0.0.1:3000',
      '/exports': 'http://127.0.0.1:3000'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});

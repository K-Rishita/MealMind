
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react-swc';
  import tailwindcss from '@tailwindcss/vite';
  import path from 'path';

  export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      target: 'esnext',
      outDir: 'build',
    },
    server: {
      port: 3000,
      open: true,
      // In development the API runs separately (npm run dev in api/); in production it serves this app.
      proxy: { '/api': 'http://localhost:8080', '/config.js': 'http://localhost:8080' },
    },
  });
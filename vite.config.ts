import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: process.env.BUDDY_TEST_API
      ? { '/api': { target: process.env.BUDDY_TEST_API } }
      : undefined,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/@firebase/') ||
            id.includes('node_modules/firebase/')
          )
            return 'firebase';
        },
      },
    },
  },
});

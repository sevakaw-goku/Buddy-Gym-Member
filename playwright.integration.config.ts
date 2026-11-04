import { chromium, defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/integration',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ||
        (process.env.CI ? chromium.executablePath() : '/usr/bin/chromium'),
      args: ['--no-sandbox'],
    },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node --experimental-strip-types tests/helpers/server.ts',
      url: 'http://127.0.0.1:4175/health',
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -- --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: false,
      env: {
        BUDDY_TEST_API: 'http://127.0.0.1:4175',
        VITE_FIREBASE_API_KEY: 'demo-key',
        VITE_FIREBASE_AUTH_DOMAIN: 'demo-buddy-gym.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'demo-buddy-gym',
        VITE_FIREBASE_APP_ID: 'demo-app',
        VITE_USE_FIREBASE_EMULATORS: 'true',
      },
    },
  ],
});

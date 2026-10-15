import os from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const PORT = 3100;
const dataFile = path.join(os.tmpdir(), `work-orders-e2e-${process.pid}.json`);

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { WORK_ORDERS_FILE: dataFile },
  },
});

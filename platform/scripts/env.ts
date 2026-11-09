// CLI scripts do not get Next.js's automatic .env.local loading.
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

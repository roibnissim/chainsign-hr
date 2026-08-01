import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import dotenv from 'dotenv';
import { uploadApiPlugin } from './server/uploadApiPlugin';
import { onboardingApiPlugin } from './server/onboardingApiPlugin';
import { authApiPlugin } from './server/authApiPlugin';
import { activityLogApiPlugin } from './server/activityLogApiPlugin';
import { signingApiPlugin } from './server/signingApiPlugin';

dotenv.config({ override: true });

const disableLocalApi = process.env.DISABLE_LOCAL_DATA_API === 'true';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(disableLocalApi
        ? []
        : [
            authApiPlugin(),
            uploadApiPlugin(),
            onboardingApiPlugin(),
            signingApiPlugin(),
            activityLogApiPlugin(),
          ]),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {
              ignored: [
                '**/service-account.json',
                '**/*firebase-adminsdk*.json',
                '**/.data/**',
              ],
            },
    },
  };
});

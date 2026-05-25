import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Load ALL env vars (no prefix filter) so SUPABASE_URL and
  // SUPABASE_SERVICE_ROLE_KEY are available without a VITE_ prefix.
  const env = loadEnv(mode ?? 'production', process.cwd(), '')

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      define: {
        // Inject as process.env.* so the main process can access them
        // at runtime exactly as shown in the Supabase admin docs.
        'process.env.SUPABASE_URL':              JSON.stringify(env.SUPABASE_URL),
        'process.env.SUPABASE_SERVICE_ROLE_KEY': JSON.stringify(env.SUPABASE_SERVICE_ROLE_KEY),
      },
    },
    preload: {
      plugins: [externalizeDepsPlugin()]
    },
    renderer: {
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src')
        }
      },
      plugins: [react()]
    }
  }
})

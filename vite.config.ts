import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // SPA mode is what lets the local database be a module singleton: there is no
  // server render to guard, so `@powersync/web` is imported like any other
  // module and the client owns the first paint.
  plugins: [tanstackStart({ spa: { enabled: true } }), viteReact()],
  // @powersync/web loads SQLite as wasm from a worker. Pre-bundling rewrites the
  // paths it resolves those assets by, and the worker has to be an ES module for
  // the SDK's own dynamic imports to work inside it.
  optimizeDeps: { exclude: ['@powersync/web', '@journeyapps/wa-sqlite'] },
  worker: { format: 'es' },
})

export default config

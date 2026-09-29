import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const SERVER = 'http://localhost:2567';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION ?? 'dev'),
  },
  server: {
    // In dev the Colyseus client talks to :2567 directly; plain HTTP APIs go through the proxy.
    proxy: {
      '/api': SERVER,
      '/version.json': SERVER,
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // We register the service worker ourselves (src/pwa/updater.ts) to control when updates apply.
      injectRegister: false,
      registerType: 'prompt',
      pwaAssets: { config: true },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2,glb}', 'models/manifest.json'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'Kanel og Grønskollingen',
        short_name: 'Kanel',
        description:
          'Et vilde vesten-eventyr fra øst til vest – med Kanel, den klogeste hest i prærien.',
        lang: 'da',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#f4c95d',
        theme_color: '#c8553d',
        categories: ['games', 'kids', 'education'],
      },
      devOptions: { enabled: false },
    }),
  ],
});

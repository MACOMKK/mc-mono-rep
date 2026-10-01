import { mergeConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { createAppConfig } from '../../scripts/vite/createAppConfig.js';

const baseConfig = createAppConfig(import.meta.url, {
  server: {
    host: true,
    port: 5175,
    allowedHosts: ['.ngrok-free.app'],
  },
  preview: {
    port: 4175,
    strictPort: true,
  },
  includeTestConfig: false,
});

export default mergeConfig(baseConfig, {
  plugins: [
    VitePWA({
      // SW proprio (src/sw.js) em vez de generateSW: precisa tratar Web Push alem do cache
      // offline -- ver comentario no topo de src/sw.js.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      manifestFilename: 'manifest.json',
      includeAssets: ['favicon.svg', 'pwa-icons/*.png'],
      manifest: {
        id: '/',
        name: 'Intranet Macom',
        short_name: 'Intranet',
        description: 'Intranet Macom com avisos, aniversariantes, agenda, documentos e comunicacao interna.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0f172a',
        icons: [
          { src: '/pwa-icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-icons/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,woff,png,ico}'],
      },
      devOptions: { enabled: false },
    }),
  ],
});

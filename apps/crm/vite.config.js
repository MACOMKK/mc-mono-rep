import { mergeConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { createAppConfig } from '../../scripts/vite/createAppConfig.js';

const baseConfig = createAppConfig(import.meta.url, {
  server: {
    host: true,
    port: 5172,
    strictPort: true,
    allowedHosts: ['.ngrok-free.app'],
  },
  preview: {
    port: 4172,
    strictPort: true,
  },
});

export default mergeConfig(baseConfig, {
  plugins: [
    VitePWA({
      // 'prompt' + injectRegister:false: o SW novo so assume controle quando o usuario confirmar
      // no toast do AppUpdatePrompt.jsx. Com 'autoUpdate' o navegador trocava de versao em segundo
      // plano a cada deploy, deixando os chunks lazy antigos inacessiveis -- o import() dinamico
      // falhava (vite:preloadError) e o reload forcado em main.jsx apagava formularios abertos.
      registerType: 'prompt',
      injectRegister: false,
      manifestFilename: 'manifest.json',
      includeAssets: ['favicon.svg', 'pwa-icons/*.png'],
      manifest: {
        id: '/',
        name: 'REVVO CRM',
        short_name: 'REVVO CRM',
        description: 'REVVO CRM — gestao comercial automotiva.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f7f7f7',
        theme_color: '#E30613',
        icons: [
          { src: '/pwa-icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-icons/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,woff,png,ico}'],
        navigateFallback: '/index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
});

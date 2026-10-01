import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vite';

function createAliases(repoRoot, appRoot) {
  return [
    { find: /^@\/(.*)$/, replacement: `${path.resolve(appRoot, './src')}/$1` },
    { find: /^@macom\/api-client$/, replacement: path.resolve(repoRoot, './packages/api-client/src/index.js') },
    { find: /^@macom\/api-client\/(.*)$/, replacement: `${path.resolve(repoRoot, './packages/api-client/src')}/$1` },
    { find: /^@macom\/auth$/, replacement: path.resolve(repoRoot, './packages/auth/src/index.js') },
    { find: /^@macom\/auth\/(.*)$/, replacement: `${path.resolve(repoRoot, './packages/auth/src')}/$1` },
    { find: /^@macom\/notifications$/, replacement: path.resolve(repoRoot, './packages/notifications/src/index.js') },
    { find: /^@macom\/notifications\/(.*)$/, replacement: `${path.resolve(repoRoot, './packages/notifications/src')}/$1` },
    { find: /^@macom\/pdf-signature$/, replacement: path.resolve(repoRoot, './packages/pdf-signature/src/index.js') },
    { find: /^@macom\/pdf-signature\/(.*)$/, replacement: `${path.resolve(repoRoot, './packages/pdf-signature/src')}/$1` },
    { find: /^@macom\/push$/, replacement: path.resolve(repoRoot, './packages/push/src/index.js') },
    { find: /^@macom\/push\/(.*)$/, replacement: `${path.resolve(repoRoot, './packages/push/src')}/$1` },
    { find: /^@macom\/test-utils$/, replacement: path.resolve(repoRoot, './packages/test-utils/src/index.js') },
    { find: /^@macom\/test-utils\/(.*)$/, replacement: `${path.resolve(repoRoot, './packages/test-utils/src')}/$1` },
    { find: /^@macom\/ui$/, replacement: path.resolve(repoRoot, './packages/ui/src/index.js') },
    { find: /^@macom\/ui\/(.*)$/, replacement: `${path.resolve(repoRoot, './packages/ui/src')}/$1` },
    { find: /^@macom\/validation$/, replacement: path.resolve(repoRoot, './packages/validation/src/index.js') },
    { find: /^@macom\/validation\/(.*)$/, replacement: `${path.resolve(repoRoot, './packages/validation/src')}/$1` },
  ];
}

export function createAppConfig(importMetaUrl, options = {}) {
  const {
    logLevel = 'error',
    server,
    preview,
    includeTestConfig = true,
    define,
  } = options;

  const appRoot = fileURLToPath(new URL('.', importMetaUrl));
  const repoRoot = path.resolve(appRoot, '../..');

  const config = {
    root: appRoot,
    envDir: repoRoot,
    logLevel,
    plugins: [react()],
    resolve: {
      alias: createAliases(repoRoot, appRoot),
    },
    build: {
      outDir: path.resolve(appRoot, './dist'),
      emptyOutDir: true,
    },
  };

  if (server) {
    config.server = server;
  }

  if (preview) {
    config.preview = preview;
  }

  if (define) {
    config.define = define;
  }

  if (includeTestConfig) {
    config.test = {
      environment: 'jsdom',
      globals: true,
      setupFiles: path.resolve(repoRoot, './packages/test-utils/src/setup.js'),
    };
  }

  return defineConfig(config);
}

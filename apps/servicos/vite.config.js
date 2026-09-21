import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { mergeConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { createAppConfig } from '../../scripts/vite/createAppConfig.js';

const { version } = createRequire(import.meta.url)('./package.json');

// A versao exibida no rodape da sidebar (Sidebar.jsx) precisa mudar a cada deploy pra dar pra
// confirmar visualmente que o build novo foi ao ar. O 4o numero e a contagem de commits desde o
// ultimo bump manual do "version" no package.json -- zera (.0) sempre que alguem sobe o version
// base (ex.: 1.0.0 -> 1.0.1) e sobe sozinho a cada commit depois disso: v1.0.1.0, v1.0.1.1,
// v1.0.1.2... Precisa de historico completo pra contar certo -- na Vercel, desativar "Shallow
// clone" nas configuracoes do projeto (Settings > Git), senao a busca do commit de bump falha e
// cai no fallback ".0" fixo.
const PKG_RELATIVE_PATH = 'apps/servicos/package.json';

function findVersionBumpCommit(baseVersion) {
  const commits = execSync(`git log --follow --format=%H --reverse -- ${PKG_RELATIVE_PATH}`)
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean);

  let previousVersion = null;
  for (const commit of commits) {
    let content;
    try {
      content = execSync(`git show ${commit}:${PKG_RELATIVE_PATH}`).toString();
    } catch {
      continue;
    }
    const version = content.match(/"version"\s*:\s*"([^"]+)"/)?.[1];
    if (version === baseVersion && previousVersion !== baseVersion) return commit;
    previousVersion = version;
  }
  return commits[0];
}

function withBuildMetadata(baseVersion) {
  try {
    const bumpCommit = findVersionBumpCommit(baseVersion);
    const buildNumber = execSync(`git rev-list --count ${bumpCommit}..HEAD`).toString().trim();
    return `${baseVersion}.${buildNumber}`;
  } catch {
    return `${baseVersion}.0`;
  }
}

const appVersion = withBuildMetadata(version);

const baseConfig = createAppConfig(import.meta.url, {
  server: {
    port: 5177,
    strictPort: true,
  },
  preview: {
    port: 4177,
    strictPort: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
});

// Gera version.json no dist, fora do bundle/SW cache -- e o unico jeito da pagina ainda rodando a
// versao antiga descobrir o numero da versao NOVA antes do usuario clicar em "Atualizar" no toast
// do AppUpdatePrompt.jsx (o numero so existe dentro do bundle novo, que so roda depois do reload).
// Buscado com cache: 'no-store' pra sempre pegar o arquivo publicado no deploy mais recente.
function versionJsonPlugin() {
  let outDir;
  return {
    name: 'macom-servicos-version-json',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    writeBundle() {
      writeFileSync(`${outDir}/version.json`, JSON.stringify({ version: appVersion }));
    },
  };
}

export default mergeConfig(baseConfig, {
  plugins: [
    versionJsonPlugin(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'prompt',
      injectRegister: false,
      manifestFilename: 'manifest.json',
      includeAssets: ['favicon.svg', 'pwa-icons/*.png'],
      manifest: {
        id: '/',
        name: 'MACOM Servicos',
        short_name: 'Servicos',
        description: 'Sistema MACOM Servicos — atendimento, oficina, financeiro, estoque, compras e RH.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f5f5f5',
        theme_color: '#E30613',
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

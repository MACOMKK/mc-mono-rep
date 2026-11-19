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
  build: {
    // Por padrao o Vite injeta <link rel="modulepreload"> no index.html pra qualquer chunk
    // dinamico compartilhado por 2+ paginas (manualChunks faz o "pdf-vendor" se qualificar,
    // ja que Aprovacoes/MinhasSolicitacoes/Pagamentos todas importam SolicitacaoDrawer, que
    // carrega pdf-lib via import() dinamico) -- isso baixava os 532 KB do pdf-vendor pra todo
    // usuario logo na tela de login, mesmo quem nunca usa "Juntar PDFs"/assinatura, anulando o
    // ganho de banda do code splitting de pdf-lib (ver loadPdfTools em
    // SolicitacaoDrawer.jsx/anexoSignature.js). Filtra esse chunk da lista de preload; ele
    // continua sendo baixado normalmente, só na hora real do import() dinamico.
    modulePreload: {
      resolveDependencies: (_filename, deps) => deps.filter((dep) => !dep.includes('pdf-vendor')),
    },
    rollupOptions: {
      output: {
        // pdf-lib so entra em bundle de quem usa assinatura/PDF (ver loadPdfTools em
        // SolicitacaoDrawer.jsx/anexoSignature.js, import() dinamico) -- sem isso, o Rollup
        // agrupa esse chunk junto de outras deps compartilhadas num chunk generico "index-*",
        // com o mesmo prefixo do entry point real, o que impediria excluir só ele do precache
        // do Service Worker (ver injectManifest.globIgnores abaixo) sem also excluir o entry.
        manualChunks(id) {
          if (id.includes('commonjsHelpers') || id.includes('commonjs-proxy')) {
            console.log('DEBUG_HELPER_ID:', id);
          }
          if (id.replace(/\\/g, '/').includes('/node_modules/pdf-lib/')) return 'pdf-vendor';
        },
      },
    },
  },
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
        name: 'MACOM HUB',
        short_name: 'HUB',
        description: 'Sistema MACOM HUB — atendimento, oficina, financeiro, estoque, compras e RH.',
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
        // png/webp fora do precache de proposito: o app nao precisa funcionar offline desde a
        // primeira visita, e as imagens cacheadas aqui competiam por banda com as chamadas de API
        // reais logo apos o login. Ficam em cache sob demanda via runtime caching (src/sw.js).
        globPatterns: ['**/*.{js,css,html,svg,woff2,woff,ico}'],
        // Chunks pesados carregados so sob demanda (Relatorios usa recharts; pdf-* e pdf-vendor-*
        // sao pdfjs-dist/pdf-lib, so usados em "Juntar PDFs"/assinatura) -- precacha-los no login
        // competiria por banda com as chamadas de API reais pra quem nunca abre essas telas. Ficam
        // de fora do precache; quem usar essas telas baixa o chunk normalmente na hora (import()),
        // so nao fica guardado no cache do Service Worker.
        globIgnores: ['**/Relatorios-*.js', '**/pdf-*.js', '**/pdf-vendor-*.js'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
});

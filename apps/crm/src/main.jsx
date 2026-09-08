import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Depois de um novo deploy na Vercel, os chunks das rotas lazy (App.jsx) trocam de hash e os
// antigos somem do CDN. Se o usuario ja estava com a SPA aberta e navega pra uma rota ainda nao
// carregada nessa sessao, o import dinamico falha (vite:preloadError) e a tela fica branca. Um
// reload busca o index.html novo, com os hashes corretos -- guardamos em sessionStorage pra nao
// entrar em loop caso o erro nao seja de chunk desatualizado.
window.addEventListener('vite:preloadError', () => {
  const key = 'vite-preload-error-reload'
  if (sessionStorage.getItem(key)) return
  sessionStorage.setItem(key, '1')
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

// Limpa a flag depois que a app volta a rodar normalmente, senao um preloadError legitimo em
// deploy futuro (na mesma aba) nao dispararia reload de novo.
window.setTimeout(() => sessionStorage.removeItem('vite-preload-error-reload'), 10000)

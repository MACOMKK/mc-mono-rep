import { useEffect, useRef } from 'react';

// Formularios de aviso/documento sobem o arquivo assim que ele e escolhido, antes de salvar.
// Sem isso, trocar/remover o arquivo ou fechar o dialog sem salvar deixava o upload orfao no
// bucket. Rastreia so o que foi enviado nesta sessao do form (nunca o arquivo ja salvo em
// initialData -- esse o backend apaga ao trocar) e descarta quando deixa de ser usado.
export function usePendingUpload(removeFile) {
  const pendingRef = useRef(null);
  const submittedRef = useRef(null);
  const removeRef = useRef(removeFile);
  removeRef.current = removeFile;

  const drop = (path) => {
    if (!path) return;
    Promise.resolve(removeRef.current(path)).catch((error) => {
      console.error('Falha ao descartar upload nao salvo:', { path, message: error?.message });
    });
  };

  useEffect(() => () => {
    if (pendingRef.current && pendingRef.current !== submittedRef.current) drop(pendingRef.current);
  }, []);

  return {
    // Novo upload substitui o anterior ainda nao salvo.
    track(path) {
      drop(pendingRef.current);
      pendingRef.current = path;
    },
    // Usuario removeu o arquivo do form.
    discard() {
      drop(pendingRef.current);
      pendingRef.current = null;
    },
    // Chamado no submit: o dialog fecha (desmonta o form) no sucesso, entao o arquivo enviado
    // pra salvar nao pode ser apagado no unmount.
    markSubmitted() {
      submittedRef.current = pendingRef.current;
    },
  };
}

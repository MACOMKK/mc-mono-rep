import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Printer } from 'lucide-react';

import { oficinaApi } from '@macom/api-client/oficinaApi';
import { Button, CarLoader } from '@macom/ui';
import ChecklistDocumento from '@/pages/oficina/ChecklistDocumento';

function itensParaMapa(itensArray) {
  const mapa = {};
  itensArray.forEach((item) => {
    if (!mapa[item.categoria]) mapa[item.categoria] = {};
    mapa[item.categoria][item.item] = item.status;
  });
  return mapa;
}

// Pagina publica (sem login) do link de checklist compartilhado via
// WhatsApp -- ver ChecklistDetail.jsx (handleCompartilharWhatsApp) e a action
// checklist_publico_obter em supabase/functions/servicos-oficina-api. O PDF e
// gerado via impressao nativa do navegador (window.print(), mesmo caminho
// "Salvar PDF" ja usado por colaboradores em ChecklistDocumento.jsx) -- o
// layout desse documento usa flex/grid que o html2canvas nao reproduz bem,
// entao evitamos gerar o PDF via canvas. Nada fica armazenado no servidor.
export default function ChecklistPublico() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [dados, setDados] = useState(null);
  const [imagensProntas, setImagensProntas] = useState(false);
  const docRef = useRef(null);

  useEffect(() => {
    oficinaApi.checklists.publico
      .obter({ id, token })
      .then(({ row, itens, avarias }) => {
        setDados({ row, avarias, itensPorCategoria: itensParaMapa(itens) });
      })
      .catch((error) => {
        setErro(error.message || 'Este link é inválido ou já expirou.');
      })
      .finally(() => setCarregando(false));
  }, [id, token]);

  useEffect(() => {
    if (dados?.row) {
      document.title = `checklist${dados.row.numero ? `-${dados.row.numero}` : ''}`;
    }
  }, [dados]);

  // As imagens (logos, diagrama do veiculo, fotos via signed URL) sao
  // carregadas do zero nessa pagina publica -- sem esperar elas terminarem
  // de carregar, o layout quebra (containers com altura dependente da
  // imagem colapsam) e o PDF sai sem foto nenhuma.
  useEffect(() => {
    if (!dados || !docRef.current) return undefined;

    let cancelado = false;
    const imgs = Array.from(docRef.current.querySelectorAll('img'));

    if (imgs.length === 0) {
      setImagensProntas(true);
      return undefined;
    }

    setImagensProntas(false);
    Promise.all(
      imgs.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete) {
              resolve();
              return;
            }
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          }),
      ),
    ).then(() => {
      if (!cancelado) setImagensProntas(true);
    });

    return () => {
      cancelado = true;
    };
  }, [dados]);

  const handleBaixarPdf = () => {
    window.print();
  };

  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <CarLoader inline />
      </div>
    );
  }

  if (erro || !dados) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="max-w-sm rounded-md border border-destructive/30 bg-destructive/10 p-4 text-center text-sm text-destructive">
          {erro || 'Este link é inválido ou já expirou.'}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-6">
      <div className="no-print mx-auto mb-4 flex max-w-3xl justify-end px-3">
        <Button type="button" onClick={handleBaixarPdf} disabled={!imagensProntas}>
          <Printer className="mr-2 h-4 w-4" />
          {imagensProntas ? 'Baixar PDF' : 'Carregando imagens...'}
        </Button>
      </div>
      <div ref={docRef}>
        <ChecklistDocumento
          row={dados.row}
          avarias={dados.avarias}
          itensPorCategoria={dados.itensPorCategoria}
          toolbarOculta
        />
      </div>
    </div>
  );
}

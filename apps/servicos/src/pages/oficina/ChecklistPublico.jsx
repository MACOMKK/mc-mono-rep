import { useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';

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
// gerado inteiramente no navegador de quem abre o link (html2pdf.js), nunca
// fica armazenado no nosso servidor.
export default function ChecklistPublico() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const docRef = useRef(null);

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [dados, setDados] = useState(null);
  const [baixando, setBaixando] = useState(false);
  const carregouRef = useRef(false);

  if (!carregouRef.current) {
    carregouRef.current = true;
    oficinaApi.checklists.publico
      .obter({ id, token })
      .then(({ row, itens, avarias }) => {
        setDados({ row, avarias, itensPorCategoria: itensParaMapa(itens) });
      })
      .catch((error) => {
        setErro(error.message || 'Este link é inválido ou já expirou.');
      })
      .finally(() => setCarregando(false));
  }

  const handleBaixarPdf = async () => {
    if (!docRef.current) return;
    setBaixando(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      await html2pdf()
        .set({
          filename: `checklist${dados?.row?.numero ? `-${dados.row.numero}` : ''}.pdf`,
          margin: 0,
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(docRef.current)
        .save();
    } finally {
      setBaixando(false);
    }
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
        <Button type="button" onClick={handleBaixarPdf} disabled={baixando}>
          <Download className="mr-2 h-4 w-4" />
          {baixando ? 'Gerando PDF...' : 'Baixar PDF'}
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

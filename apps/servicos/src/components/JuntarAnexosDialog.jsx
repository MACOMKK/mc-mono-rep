import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, FileStack } from 'lucide-react';

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from '@macom/ui';
import { TIPO_ANEXO_LABEL } from '@/lib/financeiroFormat';

// So PDF, JPG e PNG -- os formatos que o pdf-lib consegue colocar no PDF unico (mergePdfs).
export function podeJuntarAnexo(anexo) {
  const tipoMime = String(anexo?.tipo_mime || '').toLowerCase();
  const nomeArquivo = String(anexo?.nome_arquivo || '').toLowerCase();
  if (tipoMime.includes('pdf') || nomeArquivo.endsWith('.pdf')) return true;
  return /^image\/(jpeg|jpg|png)$/.test(tipoMime) || /\.(jpe?g|png)$/.test(nomeArquivo);
}

// Escolha e ordem dos anexos que viram o PDF unico. Abre com tudo que pode ser juntado marcado,
// exceto PDF unico gerado antes (juntar de novo duplicaria as paginas). Se um arquivo falhar,
// o erro vem com o nome dele e a janela fica aberta pra desmarcar e tentar de novo.
export default function JuntarAnexosDialog({ open, onOpenChange, anexos, podeAssinar, gerando, onGerar }) {
  const [itens, setItens] = useState([]);
  const [incluirAssinatura, setIncluirAssinatura] = useState(false);

  useEffect(() => {
    if (!open) return;
    const comUrl = anexos.filter((anexo) => anexo.url);
    setItens([
      ...comUrl
        .filter(podeJuntarAnexo)
        .map((anexo) => ({ anexo, juntavel: true, marcado: anexo.tipo_anexo !== 'pdf_unificado' })),
      ...comUrl.filter((anexo) => !podeJuntarAnexo(anexo)).map((anexo) => ({ anexo, juntavel: false, marcado: false })),
    ]);
  }, [open, anexos]);

  const totalJuntaveis = itens.filter((item) => item.juntavel).length;
  const selecionados = itens.filter((item) => item.marcado).map((item) => item.anexo);

  function alternar(index, checked) {
    setItens((atual) => atual.map((item, i) => (i === index ? { ...item, marcado: checked } : item)));
  }

  function mover(index, direcao) {
    setItens((atual) => {
      const destino = index + direcao;
      if (destino < 0 || destino >= totalJuntaveis) return atual;
      const proximo = [...atual];
      [proximo[index], proximo[destino]] = [proximo[destino], proximo[index]];
      return proximo;
    });
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !gerando && onOpenChange(value)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Juntar anexos em um PDF</DialogTitle>
          <DialogDescription>
            Marque os arquivos e ajuste a ordem das páginas. Imagens JPG e PNG entram como uma página cada.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
          {itens.map((item, index) => (
            <li
              key={item.anexo.id}
              className={`flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 ${
                item.juntavel ? '' : 'opacity-50'
              }`}
            >
              <Checkbox
                id={`juntar-${item.anexo.id}`}
                checked={item.marcado}
                disabled={!item.juntavel || gerando}
                onCheckedChange={(checked) => alternar(index, checked === true)}
              />
              <label htmlFor={`juntar-${item.anexo.id}`} className="min-w-0 flex-1 cursor-pointer">
                <p className="truncate text-sm font-medium">{item.anexo.nome_arquivo}</p>
                <p className="text-xs text-muted-foreground">
                  {item.juntavel
                    ? TIPO_ANEXO_LABEL[item.anexo.tipo_anexo] || item.anexo.tipo_anexo || 'Outros'
                    : 'Não pode ser juntado (só PDF, JPG ou PNG)'}
                </p>
              </label>
              {item.juntavel && (
                <div className="flex shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Mover para cima"
                    disabled={index === 0 || gerando}
                    onClick={() => mover(index, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Mover para baixo"
                    disabled={index === totalJuntaveis - 1 || gerando}
                    onClick={() => mover(index, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {podeAssinar && (
          <label
            htmlFor="juntar-incluir-assinatura"
            className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"
          >
            <Checkbox
              id="juntar-incluir-assinatura"
              checked={incluirAssinatura}
              disabled={gerando}
              onCheckedChange={(checked) => setIncluirAssinatura(checked === true)}
            />
            Incluir minha assinatura
          </label>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={gerando} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={selecionados.length === 0 || gerando}
            onClick={() => onGerar(selecionados, { incluirAssinatura: podeAssinar && incluirAssinatura })}
          >
            {gerando ? <Spinner size="sm" /> : <FileStack className="h-4 w-4" />}
            Gerar PDF ({selecionados.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

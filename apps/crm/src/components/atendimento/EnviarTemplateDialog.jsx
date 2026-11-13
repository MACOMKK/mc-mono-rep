import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { atendimentoApi } from '@/api/atendimentoApi';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Generico de proposito: nao conhece nenhum template especifico. A Meta devolve cada template com
// o texto cru (ex.: "Ola {{1}}, seu pedido {{2}} esta pronto.") -- extrai os placeholders {{n}}
// de HEADER/BODY por regex e monta um campo de input por numero encontrado, na ordem em que
// aparecem. Funciona pra qualquer template aprovado, sem precisar editar codigo quando a conta
// ganha/perde templates no WhatsApp Manager.
function extrairPlaceholders(texto) {
  if (!texto) return [];
  const numeros = new Set();
  for (const match of texto.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    numeros.add(Number(match[1]));
  }
  return Array.from(numeros).sort((a, b) => a - b);
}

function preencherPlaceholders(texto, valores) {
  if (!texto) return '';
  return texto.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, numero) => valores[Number(numero)] || `{{${numero}}}`);
}

// So HEADER (quando e' texto) e BODY costumam ter variavel preenchivel pelo atendente; FOOTER e'
// sempre estatico e BOTOES com URL dinamica sao um caso raro que deixamos de fora por ora (sem
// template assim em uso ainda) -- ver nota em whatsapp.ts.
function componentesPreenchiveis(components) {
  return (components || []).filter(
    (component) =>
      (component.type === 'BODY' || (component.type === 'HEADER' && component.format === 'TEXT')) &&
      typeof component.text === 'string',
  );
}

export default function EnviarTemplateDialog({ open, onOpenChange, onEnviar, isPending }) {
  const [templateSelecionado, setTemplateSelecionado] = useState(null);
  const [valores, setValores] = useState({});

  const { data: templates = [], isFetching, isError } = useQuery({
    queryKey: ['whatsapp-templates-aprovados'],
    queryFn: () => atendimentoApi.listTemplatesWhatsapp(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const selecionarTemplate = (template) => {
    setTemplateSelecionado(template);
    setValores({});
  };

  const voltar = () => {
    setTemplateSelecionado(null);
    setValores({});
  };

  const fechar = (novoEstado) => {
    if (!novoEstado) {
      setTemplateSelecionado(null);
      setValores({});
    }
    onOpenChange(novoEstado);
  };

  const camposPreenchiveis = useMemo(
    () => (templateSelecionado ? componentesPreenchiveis(templateSelecionado.components) : []),
    [templateSelecionado],
  );

  const placeholdersPorComponente = useMemo(
    () => camposPreenchiveis.map((component) => ({ component, numeros: extrairPlaceholders(component.text) })),
    [camposPreenchiveis],
  );

  const todosPlaceholdersPreenchidos = placeholdersPorComponente.every(({ numeros }) =>
    numeros.every((numero) => String(valores[numero] || '').trim()),
  );

  const handleConfirmar = () => {
    if (!templateSelecionado) return;

    const components = placeholdersPorComponente
      .filter(({ numeros }) => numeros.length > 0)
      .map(({ component, numeros }) => ({
        type: component.type,
        parameters: numeros.map((numero) => ({ type: 'text', text: String(valores[numero] || '') })),
      }));

    const previewTexto = camposPreenchiveis
      .map((component) => preencherPlaceholders(component.text, valores))
      .join('\n');

    onEnviar({
      name: templateSelecionado.name,
      language: templateSelecionado.language,
      components,
      previewTexto,
    });
  };

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar template</DialogTitle>
          <DialogDescription>
            {templateSelecionado
              ? 'Preencha as variáveis do template antes de enviar.'
              : 'Fora da janela de 24h, a API oficial da Meta só aceita template aprovado.'}
          </DialogDescription>
        </DialogHeader>

        {!templateSelecionado ? (
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {isFetching ? (
              <div className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando templates aprovados...
              </div>
            ) : isError ? (
              <p className="px-1 py-2 text-sm text-destructive">
                Falha ao buscar templates. Confira a integração whatsapp_meta (business_account_id e access_token).
              </p>
            ) : templates.length === 0 ? (
              <p className="px-1 py-2 text-sm text-muted-foreground">
                Nenhum template aprovado encontrado nesta conta.
              </p>
            ) : (
              templates.map((template) => (
                <button
                  key={`${template.name}-${template.language}`}
                  type="button"
                  onClick={() => selecionarTemplate(template)}
                  className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="font-medium">{template.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {template.language} · {template.category}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              {camposPreenchiveis.map((component) => (
                <p key={component.type}>{component.text}</p>
              ))}
            </div>

            {placeholdersPorComponente.flatMap(({ numeros }) => numeros).length === 0 ? (
              <p className="text-xs text-muted-foreground">Este template não tem variáveis a preencher.</p>
            ) : (
              placeholdersPorComponente.map(({ component, numeros }) =>
                numeros.map((numero) => (
                  <div key={`${component.type}-${numero}`} className="space-y-1.5">
                    <Label htmlFor={`template-var-${component.type}-${numero}`}>
                      Variável {'{{'}{numero}{'}}'} ({component.type === 'HEADER' ? 'cabeçalho' : 'corpo'})
                    </Label>
                    <Input
                      id={`template-var-${component.type}-${numero}`}
                      value={valores[numero] || ''}
                      onChange={(event) => setValores((atual) => ({ ...atual, [numero]: event.target.value }))}
                    />
                  </div>
                )),
              )
            )}
          </div>
        )}

        <DialogFooter>
          {templateSelecionado ? (
            <>
              <Button type="button" variant="outline" onClick={voltar} disabled={isPending}>
                Voltar
              </Button>
              <Button type="button" onClick={handleConfirmar} disabled={isPending || !todosPlaceholdersPreenchidos}>
                {isPending ? 'Enviando...' : 'Enviar template'}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => fechar(false)}>
              Cancelar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

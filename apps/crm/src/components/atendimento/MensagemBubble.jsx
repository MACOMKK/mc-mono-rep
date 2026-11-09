import { forwardRef } from 'react';
import { Bot, Check, CheckCheck, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

const AUTOR_LABEL = {
  ia: '🤖 IA',
  humano: 'Você',
  cliente: null,
};

function StatusIcon({ status }) {
  if (status === 'lido') return <CheckCheck className="h-3 w-3 text-sky-500" />;
  if (status === 'entregue') return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
  if (status === 'falha') return null;
  return <Check className="h-3 w-3 text-muted-foreground" />;
}

function formatHora(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function MidiaConteudo({ mensagem }) {
  const { tipo_conteudo: tipo, midia_url: url, midia_nome_arquivo: nomeArquivo } = mensagem;
  if (tipo === 'imagem') {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={nomeArquivo || 'Imagem recebida'} className="max-h-64 max-w-full rounded-lg object-contain" />
      </a>
    );
  }
  if (tipo === 'audio') {
    return <audio controls src={url} className="h-9 max-w-[220px]" />;
  }
  if (tipo === 'documento') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={cn('flex items-center gap-2 underline-offset-2 hover:underline')}
      >
        <FileText className="h-4 w-4 shrink-0" />
        <span className="truncate">{nomeArquivo || 'Documento'}</span>
      </a>
    );
  }
  return null;
}

function highlightTexto(texto, termo) {
  if (!termo) return texto;
  const partes = texto.split(new RegExp(`(${termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return partes.map((parte, index) =>
    parte.toLowerCase() === termo.toLowerCase() ? (
      <mark key={index} className="rounded-sm bg-primary/20 text-inherit">
        {parte}
      </mark>
    ) : (
      parte
    ),
  );
}

const MensagemBubble = forwardRef(function MensagemBubble(
  { mensagem, onRetry, termoBusca, isResultadoAtual },
  ref,
) {
  const isSaida = mensagem.direcao === 'saida';
  const isIa = mensagem.autor === 'ia';
  const label = AUTOR_LABEL[mensagem.autor];
  const isPending = Boolean(mensagem.pending);
  const isErro = Boolean(mensagem.erro);

  return (
    <div ref={ref} className={cn('flex w-full items-end gap-2', isSaida ? 'justify-end' : 'justify-start')}>
      {isIa ? (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <Bot className="h-3.5 w-3.5" />
        </div>
      ) : null}
      <div className={cn('flex max-w-[70%] flex-col', isSaida ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2 text-sm shadow-sm',
            isSaida ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm border border-border bg-white text-foreground',
            isPending && 'opacity-60',
            isErro && 'border border-destructive bg-destructive/10 text-destructive-foreground',
            isResultadoAtual && 'ring-2 ring-offset-2 ring-amber-500',
          )}
        >
          {label ? (
            <p className={cn('mb-0.5 text-[10px] font-bold uppercase tracking-wide', isSaida ? 'text-white/70' : 'text-muted-foreground')}>
              {label}
            </p>
          ) : null}
          {mensagem.tipo_conteudo && mensagem.tipo_conteudo !== 'texto' ? (
            <div className="flex flex-col gap-1">
              <MidiaConteudo mensagem={mensagem} />
              {mensagem.conteudo ? (
                <p className="whitespace-pre-wrap break-words">{highlightTexto(mensagem.conteudo, termoBusca)}</p>
              ) : null}
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words">{highlightTexto(mensagem.conteudo, termoBusca)}</p>
          )}
        </div>
        {isErro ? (
          <button
            type="button"
            onClick={() => onRetry?.(mensagem)}
            className="mt-0.5 text-[10px] font-semibold text-destructive underline-offset-2 hover:underline"
          >
            Falha ao enviar · tentar novamente
          </button>
        ) : (
          <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            {isPending ? 'Enviando...' : formatHora(mensagem.created_date)}
            {!isPending && isSaida ? <StatusIcon status={mensagem.status} /> : null}
          </span>
        )}
      </div>
    </div>
  );
});

export default MensagemBubble;

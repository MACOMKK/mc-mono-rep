'use client';

import { Cpu } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog';

// Aviso de atualizacao bloqueante, generico entre apps: presentational (sem fetch), cada app
// busca o aviso ativo com seu proprio client e decide se `notice` deve ser passado ou nao (ex.:
// null quando o usuario e admin, ou quando ja aceitou a versao vigente). Usa AlertDialog (nao
// Dialog) de proposito -- sem botao de fechar, nao fecha ao clicar fora/ESC.
export function AppUpdateNoticeDialog({ notice, onAccept, accepting = false }) {
  if (!notice) return null;

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{notice.titulo}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-wrap text-left">{notice.mensagem}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground sm:justify-start">
            <Cpu className="h-3.5 w-3.5 shrink-0" />
            Departamento de Tecnologia
          </p>
          <AlertDialogAction disabled={accepting} onClick={onAccept} className="w-full sm:w-auto">
            {notice.requer_atualizacao ? 'Atualizar agora' : 'Li e estou ciente'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

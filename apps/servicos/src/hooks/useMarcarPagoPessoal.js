import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@macom/ui';

import { financeiroApi } from '@macom/api-client/financeiroApi';
import { getFriendlyErrorMessage } from '@/lib/errorMessage';

// Baixa de solicitacao pessoal (action marcar_pago_pessoal): so o solicitante ou o aprovador
// destino, direto de pendente pra pago -- nao passa por aprovacao nem pelo financeiro.
export function useMarcarPagoPessoal({ onSuccess } = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => financeiroApi.solicitacoes.marcarPagoPessoal(id),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ['servicos', 'solicitacoes'] });
      toast({ title: 'Marcada como paga', description: 'O lembrete pessoal foi encerrado.' });
      onSuccess?.(row);
    },
    onError: (error) => {
      toast({ title: 'Não foi possível marcar como paga', description: getFriendlyErrorMessage(error) });
    },
  });
}

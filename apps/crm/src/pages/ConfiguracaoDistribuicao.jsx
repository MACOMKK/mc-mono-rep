import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Trash2, Users } from 'lucide-react';
import { crmDataClient } from '@/api/crmDataClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function validateDraft(value) {
  const isBlankOrPositiveInt = (raw) => raw === '' || raw === null || raw === undefined || (Number.isInteger(Number(raw)) && Number(raw) >= 1);

  if (!isBlankOrPositiveInt(value.limite_padrao_leads_ativos)) {
    return 'Limite padrao por vendedor deve ser vazio (sem limite) ou um numero inteiro maior ou igual a 1.';
  }
  if (value.sla_primeiro_contato_minutos === '' || !Number.isInteger(Number(value.sla_primeiro_contato_minutos)) || Number(value.sla_primeiro_contato_minutos) < 1) {
    return 'SLA do primeiro contato deve ser um numero inteiro maior ou igual a 1.';
  }
  if (value.sla_alerta_minutos === '' || !Number.isInteger(Number(value.sla_alerta_minutos)) || Number(value.sla_alerta_minutos) < 0) {
    return 'Alerta antes de vencer deve ser um numero inteiro maior ou igual a 0.';
  }
  const invalidSeller = (value.sellers || []).find((seller) => !isBlankOrPositiveInt(seller.limite_leads_ativos));
  if (invalidSeller) {
    return 'Limite individual do vendedor deve ser vazio (usar padrao) ou um numero inteiro maior ou igual a 1.';
  }
  return null;
}

export default function ConfiguracaoDistribuicao() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [draft, setDraft] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['crm-distribuicao'],
    queryFn: () => crmDataClient.entities.Distribuicao.getConfig(),
    enabled: user?.role === 'admin' || user?.role === 'manager',
  });

  const units = data?.units || [];
  const selectedUnit = units.find((item) => item.id === selectedUnitId) || units[0];
  const unitSellers = useMemo(
    () => (data?.sellers || []).filter((item) => item.unidade_id === selectedUnit?.id),
    [data?.sellers, selectedUnit?.id],
  );

  useEffect(() => {
    if (!selectedUnitId && units[0]?.id) setSelectedUnitId(units[0].id);
  }, [selectedUnitId, units]);

  useEffect(() => {
    if (!selectedUnit) return;
    setDraft({
      unidade_id: selectedUnit.id,
      ativa: selectedUnit.ativa !== false,
      estrategia: selectedUnit.estrategia || 'menor_carteira',
      limite_padrao_leads_ativos: selectedUnit.limite_padrao_leads_ativos ?? '',
      sla_primeiro_contato_minutos: selectedUnit.sla_primeiro_contato_minutos ?? 30,
      sla_alerta_minutos: selectedUnit.sla_alerta_minutos ?? 10,
      sellers: unitSellers.map((seller) => ({
        colaborador_id: seller.id,
        ativo: seller.ativo !== false,
        limite_leads_ativos: seller.limite_leads_ativos ?? '',
      })),
    });
  }, [selectedUnit, unitSellers]);

  const saveMutation = useMutation({
    mutationFn: (payload) => crmDataClient.entities.Distribuicao.saveConfig(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-distribuicao'] });
      toast({ title: 'Distribuicao atualizada', description: 'As regras da unidade foram salvas.', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel salvar',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  const clearMutation = useMutation({
    mutationFn: () => crmDataClient.entities.Distribuicao.clearTestData(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['leads'] }),
        queryClient.invalidateQueries({ queryKey: ['clientes'] }),
        queryClient.invalidateQueries({ queryKey: ['eventos'] }),
        queryClient.invalidateQueries({ queryKey: ['historico-atendimento'] }),
        queryClient.invalidateQueries({ queryKey: ['crm-distribuicao'] }),
      ]);
      toast({ title: 'Dados do CRM removidos', description: 'O ambiente esta pronto para novos testes.', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel limpar o CRM',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  if (user?.role !== 'admin' && user?.role !== 'manager') {
    return <div className="p-8 text-sm text-muted-foreground">Apenas gestores e administradores podem configurar a distribuicao.</div>;
  }

  const updateSeller = (collaboratorId, changes) => setDraft((current) => ({
    ...current,
    sellers: current.sellers.map((seller) => seller.colaborador_id === collaboratorId ? { ...seller, ...changes } : seller),
  }));

  function handleSave() {
    const validationError = validateDraft(draft);
    if (validationError) {
      toast({ title: 'Revise os valores informados', description: validationError, variant: 'destructive' });
      return;
    }
    saveMutation.mutate(draft);
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-xl font-black uppercase tracking-widest">Distribuicao de Leads</h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">Regras automaticas por unidade</p>
        </div>
        <Select value={selectedUnit?.id || ''} onValueChange={setSelectedUnitId}>
          <SelectTrigger className="h-9 w-72 rounded-none text-sm"><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
          <SelectContent className="rounded-none">
            {units.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? <p className="py-10 text-sm text-muted-foreground">Carregando configuracoes...</p> : null}
      {error ? <p className="py-10 text-sm text-red-600">{error.message}</p> : null}
      {!isLoading && !error && units.length === 0 ? <p className="py-10 text-sm text-muted-foreground">Nenhuma unidade com vendedores do CRM.</p> : null}

      {draft && selectedUnit ? (
        <>
          <section className="grid gap-5 border-b bg-white p-5 md:grid-cols-[1fr_1fr_1fr]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider">Distribuicao automatica</Label>
                <p className="mt-1 text-xs text-muted-foreground">Quando pausada, novos leads ficam sem responsavel.</p>
              </div>
              <Switch checked={draft.ativa} onCheckedChange={(ativa) => setDraft((current) => ({ ...current, ativa }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Estrategia</Label>
              <Select value={draft.estrategia} onValueChange={(estrategia) => setDraft((current) => ({ ...current, estrategia }))}>
                <SelectTrigger className="h-9 rounded-none"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="menor_carteira">Menor carteira ativa</SelectItem>
                  <SelectItem value="rodizio">Rodizio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Limite padrao por vendedor</Label>
              <Input type="number" min="1" value={draft.limite_padrao_leads_ativos} onChange={(event) => setDraft((current) => ({ ...current, limite_padrao_leads_ativos: event.target.value }))} placeholder="Sem limite" className="h-9 rounded-none" />
            </div>
          </section>

          <section className="mt-5 grid gap-5 border-b bg-white p-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">SLA do primeiro contato</Label>
              <Input
                type="number"
                min="1"
                value={draft.sla_primeiro_contato_minutos}
                onChange={(event) => setDraft((current) => ({ ...current, sla_primeiro_contato_minutos: event.target.value }))}
                className="h-9 rounded-none"
              />
              <p className="text-xs text-muted-foreground">Tempo maximo, em minutos, para o vendedor realizar o primeiro contato.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Alerta antes de vencer</Label>
              <Input
                type="number"
                min="0"
                value={draft.sla_alerta_minutos}
                onChange={(event) => setDraft((current) => ({ ...current, sla_alerta_minutos: event.target.value }))}
                className="h-9 rounded-none"
              />
              <p className="text-xs text-muted-foreground">Quando faltar esse tempo, o lead entra no alerta amarelo.</p>
            </div>
          </section>

          <section className="mt-5">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4" />
              <h2 className="text-sm font-black uppercase tracking-widest">Vendedores elegiveis</h2>
            </div>
            <div className="overflow-hidden border bg-white">
              <Table>
                <TableHeader className="bg-[#1a1a1a]">
                  <TableRow>
                    <TableHead className="text-white">Participa</TableHead>
                    <TableHead className="text-white">Vendedor</TableHead>
                    <TableHead className="text-white">Leads ativos</TableHead>
                    <TableHead className="text-white">Limite individual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unitSellers.map((seller) => {
                    const sellerDraft = draft.sellers.find((item) => item.colaborador_id === seller.id);
                    return (
                      <TableRow key={seller.id}>
                        <TableCell><Switch checked={sellerDraft?.ativo !== false} onCheckedChange={(ativo) => updateSeller(seller.id, { ativo })} /></TableCell>
                        <TableCell><p className="font-semibold">{seller.nome}</p><p className="text-xs text-muted-foreground">{seller.email}</p></TableCell>
                        <TableCell className="font-bold">{seller.leads_ativos || 0}</TableCell>
                        <TableCell><Input type="number" min="1" value={sellerDraft?.limite_leads_ativos ?? ''} onChange={(event) => updateSeller(seller.id, { limite_leads_ativos: event.target.value })} placeholder="Usar padrao" className="h-8 w-36 rounded-none" /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>

          <div className="mt-5 flex justify-end">
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="rounded-none text-xs font-bold uppercase tracking-wider">
              <Save className="mr-2 h-4 w-4" /> {saveMutation.isPending ? 'Salvando...' : 'Salvar regras'}
            </Button>
          </div>

          {user?.role === 'admin' ? (
            <section className="mt-10 border-t border-red-200 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-widest text-red-700">Ambiente de testes</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Remove clientes, leads, atividades e historico. As configuracoes sao preservadas.</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="rounded-none text-xs font-bold uppercase tracking-wider">
                      <Trash2 className="mr-2 h-4 w-4" /> Limpar dados do CRM
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-none">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Limpar todos os dados de teste?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta acao apagara permanentemente clientes, leads, atividades e todo o historico do CRM. Usuarios, unidades e regras de distribuicao serao mantidos.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-none">Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={clearMutation.isPending}
                        onClick={() => clearMutation.mutate()}
                        className="rounded-none bg-red-600 hover:bg-red-700"
                      >
                        {clearMutation.isPending ? 'Limpando...' : 'Sim, limpar dados'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

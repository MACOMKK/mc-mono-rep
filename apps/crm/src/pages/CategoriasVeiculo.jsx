import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Settings2, Trash2 } from 'lucide-react';
import { crmDataClient } from '@/api/crmDataClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function CamposExtraEditor({ open, onOpenChange, categoria, onSave, saving }) {
  const [campos, setCampos] = useState(() => (categoria?.campos_extra || []).map((campo) => ({ ...campo })));

  const resetFromCategoria = (nextCategoria) => {
    setCampos((nextCategoria?.campos_extra || []).map((campo) => ({ ...campo })));
  };

  const handleOpenChange = (nextOpen) => {
    if (nextOpen) resetFromCategoria(categoria);
    onOpenChange(nextOpen);
  };

  const addCampo = () => {
    setCampos((current) => [...current, { chave: '', label: '', tipo: 'texto', opcoes: [] }]);
  };

  const removeCampo = (index) => {
    setCampos((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const updateCampo = (index, patch) => {
    setCampos((current) => current.map((campo, itemIndex) => (itemIndex === index ? { ...campo, ...patch } : campo)));
  };

  const handleSave = () => {
    const normalizados = campos
      .map((campo) => ({
        chave: campo.chave || slugify(campo.label),
        label: campo.label?.trim() || '',
        tipo: campo.tipo || 'texto',
        opcoes: campo.tipo === 'opcao' ? (campo.opcoes || []).filter(Boolean) : undefined,
      }))
      .filter((campo) => campo.chave && campo.label);
    onSave(normalizados);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl rounded-none">
        <DialogHeader>
          <DialogTitle className="text-sm font-black uppercase tracking-widest">
            Campos extras — {categoria?.nome}
          </DialogTitle>
          <DialogDescription className="text-xs uppercase tracking-wider text-muted-foreground">
            Atributos especificos deste segmento (ex.: cilindrada para Moto, numero de portas para Carro),
            preenchidos no step Veiculo ao criar um lead.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-4 overflow-y-auto py-2">
          {campos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum campo extra cadastrado para este segmento.</p>
          ) : null}
          {campos.map((campo, index) => (
            <div key={index} className="space-y-3 border p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Label (exibido no formulario)</Label>
                  <Input
                    value={campo.label}
                    onChange={(event) => updateCampo(index, { label: event.target.value, chave: campo.chave || slugify(event.target.value) })}
                    placeholder="Ex.: Cilindrada (cc)"
                    className="h-9 rounded-none text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tipo</Label>
                  <Select value={campo.tipo} onValueChange={(value) => updateCampo(index, { tipo: value })}>
                    <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-none">
                      <SelectItem value="texto">Texto</SelectItem>
                      <SelectItem value="numero">Numero</SelectItem>
                      <SelectItem value="opcao">Opcoes (selecao)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {campo.tipo === 'opcao' ? (
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Opcoes (separadas por virgula)</Label>
                  <Input
                    value={(campo.opcoes || []).join(', ')}
                    onChange={(event) => updateCampo(index, {
                      opcoes: event.target.value.split(',').map((item) => item.trim()).filter(Boolean),
                    })}
                    placeholder="Ex.: Manual, Automatico, CVT"
                    className="h-9 rounded-none text-sm"
                  />
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">chave: {campo.chave || slugify(campo.label) || '(defina o label)'}</span>
                <Button type="button" variant="outline" size="icon" className="h-7 w-7 rounded-none text-red-600" onClick={() => removeCampo(index)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" className="w-full rounded-none text-xs font-bold uppercase tracking-wider" onClick={addCampo}>
            <Plus className="mr-2 h-4 w-4" /> Adicionar campo
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-none text-xs font-bold uppercase tracking-wider" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={saving} className="rounded-none text-xs font-bold uppercase tracking-wider" onClick={handleSave}>
            {saving ? 'Salvando...' : 'Salvar campos'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CategoriasVeiculo() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [novoNome, setNovoNome] = useState('');
  const [categoriaEditandoCampos, setCategoriaEditandoCampos] = useState(null);

  const { data: categorias = [], isLoading, error } = useQuery({
    queryKey: ['crm-categorias-veiculo'],
    queryFn: () => crmDataClient.entities.CategoriaVeiculo.list('nome'),
    enabled: user?.role === 'admin' || user?.role === 'manager',
  });

  const createMutation = useMutation({
    mutationFn: (nome) => crmDataClient.entities.CategoriaVeiculo.create({ nome, ativo: true }),
    onMutate: () => {
      setNovoNome('');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-categorias-veiculo'] });
      toast({ title: 'Categoria criada', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel criar a categoria',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => crmDataClient.entities.CategoriaVeiculo.update(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-categorias-veiculo'] });
      toast({ title: 'Categoria atualizada', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel atualizar a categoria',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  const saveCamposExtraMutation = useMutation({
    mutationFn: ({ id, ...data }) => crmDataClient.entities.CategoriaVeiculo.update(id, data),
    onMutate: () => {
      setCategoriaEditandoCampos(null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-categorias-veiculo'] });
      toast({ title: 'Campos extras salvos', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel salvar os campos extras',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  if (user?.role !== 'admin' && user?.role !== 'manager') {
    return <div className="p-8 text-sm text-muted-foreground">Apenas gestores e administradores podem configurar categorias de veiculo.</div>;
  }

  const handleCreate = (event) => {
    event.preventDefault();
    const nome = novoNome.trim();
    if (!nome) return;
    createMutation.mutate(nome);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
      <div className="mb-5 border-b pb-5">
        <h1 className="text-xl font-black uppercase tracking-widest">Categorias de Veiculo</h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
          Cadastro livre (ex.: Moto, Carro, Caminhao) usado no step Veiculo dos leads. Cada categoria
          representa um segmento e pode ter campos extras proprios (ex.: cilindrada para Moto).
        </p>
      </div>

      <form onSubmit={handleCreate} className="mb-5 flex items-end gap-3 border-b bg-white p-5">
        <div className="flex-1 space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider">Nova categoria</Label>
          <Input
            value={novoNome}
            onChange={(event) => setNovoNome(event.target.value)}
            placeholder="Ex.: Moto"
            className="h-9 rounded-none"
          />
        </div>
        <Button type="submit" disabled={!novoNome.trim() || createMutation.isPending} className="rounded-none text-xs font-bold uppercase tracking-wider">
          <Plus className="mr-2 h-4 w-4" /> {createMutation.isPending ? 'Criando...' : 'Adicionar'}
        </Button>
      </form>

      {isLoading ? <p className="py-10 text-sm text-muted-foreground">Carregando categorias...</p> : null}
      {error ? <p className="py-10 text-sm text-red-600">{error.message}</p> : null}
      {!isLoading && !error && categorias.length === 0 ? (
        <p className="py-10 text-sm text-muted-foreground">Nenhuma categoria cadastrada.</p>
      ) : null}

      {!isLoading && !error && categorias.length > 0 ? (
        <div className="overflow-hidden border bg-white">
          <Table>
            <TableHeader className="bg-[#1a1a1a]">
              <TableRow>
                <TableHead className="text-white">Nome</TableHead>
                <TableHead className="text-white">Campos extras</TableHead>
                <TableHead className="text-white">Ativa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categorias.map((categoria) => (
                <TableRow key={categoria.id}>
                  <TableCell>
                    <Input
                      defaultValue={categoria.nome}
                      className="h-9 max-w-xs rounded-none"
                      onBlur={(event) => {
                        const nome = event.target.value.trim();
                        if (nome && nome !== categoria.nome) {
                          updateMutation.mutate({ id: categoria.id, nome, ativo: categoria.ativo, campos_extra: categoria.campos_extra });
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 rounded-none text-xs font-bold uppercase tracking-wider"
                      onClick={() => setCategoriaEditandoCampos(categoria)}
                    >
                      <Settings2 className="mr-2 h-3.5 w-3.5" /> {(categoria.campos_extra || []).length} campo(s)
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={categoria.ativo}
                      onCheckedChange={(ativo) => updateMutation.mutate({ id: categoria.id, nome: categoria.nome, ativo, campos_extra: categoria.campos_extra })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {updateMutation.isPending ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Save className="h-3.5 w-3.5" /> Salvando...
        </div>
      ) : null}

      <CamposExtraEditor
        open={Boolean(categoriaEditandoCampos)}
        onOpenChange={(open) => !open && setCategoriaEditandoCampos(null)}
        categoria={categoriaEditandoCampos}
        saving={saveCamposExtraMutation.isPending}
        onSave={(campos_extra) => saveCamposExtraMutation.mutate({
          id: categoriaEditandoCampos.id,
          nome: categoriaEditandoCampos.nome,
          ativo: categoriaEditandoCampos.ativo,
          campos_extra,
        })}
      />
    </div>
  );
}

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appClient } from '@/api/client';
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Spinner, Textarea } from '@macom/ui';
import { Upload } from 'lucide-react';
import { usePendingUpload } from '@/lib/usePendingUpload';

const EMPTY_FORM = {
  title: '',
  description: '',
  company: '',
  category: 'outros',
  visibility: 'geral',
  minimum_access_level: 'gestor',
  department: '',
  position_id: '',
  file_url: '',
  file_path: '',
  file_name: '',
  file_type: '',
  file_size: null,
};

function normalizeInitialData(initialData) {
  if (!initialData) return EMPTY_FORM;

  return {
    title: initialData.title || '',
    description: initialData.description || '',
    company: initialData.company || '',
    category: initialData.category || 'outros',
    visibility: initialData.visibility || (initialData.position_id ? 'cargo' : initialData.department_id || initialData.department ? 'setor' : 'geral'),
    minimum_access_level: initialData.minimum_access_level || 'gestor',
    department: initialData.department || initialData.department_id || '',
    position_id: initialData.position_id || '',
    file_url: initialData.file_url || '',
    file_path: initialData.file_path || '',
    file_name: initialData.file_name || '',
    file_type: initialData.file_type || '',
    file_size: initialData.file_size || null,
  };
}

export default function DocumentForm({ initialData = null, onSubmit, isLoading, submitLabel }) {
  const [uploadError, setUploadError] = useState('');
  const [form, setForm] = useState(() => normalizeInitialData(initialData));
  const [uploading, setUploading] = useState(false);
  const pendingFile = usePendingUpload(appClient.storage.deleteDocumentFile);
  const canSubmit = Boolean(
    form.company &&
    form.file_path &&
    form.file_name &&
    (form.visibility !== 'setor' || form.department) &&
    (form.visibility !== 'cargo' || form.position_id)
  );

  const { data: departments = [] } = useQuery({
    queryKey: ['catalog-departments'],
    queryFn: () => appClient.catalogs.listDepartments(),
  });
  const { data: positions = [] } = useQuery({
    queryKey: ['catalog-positions'],
    queryFn: () => appClient.catalogs.listPositions(),
  });
  const { data: companies = [] } = useQuery({
    queryKey: ['catalog-companies'],
    queryFn: () => appClient.catalogs.listCompanies(),
  });

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setUploadError('');
    setUploading(true);
    try {
      const selectedCompany = companies.find((company) => company.id === form.company);
      const uploadResult = await appClient.storage.uploadFile(file, {
        company: selectedCompany?.name || form.company,
        category: form.category,
      });
      pendingFile.track(uploadResult.file_path);
      setForm((prev) => ({ ...prev, ...uploadResult }));
    } catch (error) {
      setForm((prev) => ({
        ...prev,
        file_url: '',
        file_path: '',
        file_name: '',
        file_type: '',
        file_size: null,
      }));
      setUploadError(error instanceof Error ? error.message : 'Falha ao enviar arquivo.');
      event.target.value = '';
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const payload = { ...form };
    if (payload.visibility !== 'setor') {
      payload.department = '';
    }
    if (payload.visibility !== 'cargo') {
      payload.position_id = '';
    }
    if (payload.visibility !== 'nivel') {
      payload.minimum_access_level = null;
    }
    pendingFile.markSubmitted();
    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Título</Label>
        <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required placeholder="Nome do documento" />
      </div>
      <div className="space-y-2">
        <Label>Descrição</Label>
        <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={2} placeholder="Breve descrição..." />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Empresa</Label>
          <Select value={form.company || ''} onValueChange={(value) => setForm({ ...form, company: value })}>
            <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
            <SelectContent>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select value={form.category} onValueChange={(value) => setForm({ ...form, category: value })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="politica">Política</SelectItem>
              <SelectItem value="procedimento">Procedimento</SelectItem>
              <SelectItem value="formulario">Formulário</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="treinamento">Treinamento</SelectItem>
              <SelectItem value="relatorio">Relatório</SelectItem>
              <SelectItem value="vendas">Vendas</SelectItem>
              <SelectItem value="outros">Outros</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Visibilidade</Label>
          <Select
            value={form.visibility}
            onValueChange={(value) => setForm({
              ...form,
              visibility: value,
              department: value === 'setor' ? form.department : '',
              position_id: value === 'cargo' ? form.position_id : '',
              minimum_access_level: value === 'nivel' ? form.minimum_access_level || 'gestor' : null,
            })}
          >
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="geral">Geral - todos veem</SelectItem>
              <SelectItem value="setor">Por setor</SelectItem>
              <SelectItem value="cargo">Por cargo</SelectItem>
              <SelectItem value="nivel">Restrito por nivel</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.visibility === 'setor' && (
          <div className="space-y-2">
            <Label>Setor</Label>
            <Select value={form.department || ''} onValueChange={(value) => setForm({ ...form, department: value })}>
              <SelectTrigger><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
              <SelectContent>
              {departments.map((department) => (
                <SelectItem key={department.id} value={department.key}>
                  {department.name}
                </SelectItem>
              ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {form.visibility === 'cargo' && (
          <div className="space-y-2">
            <Label>Cargo</Label>
            <Select value={form.position_id || ''} onValueChange={(value) => setForm({ ...form, position_id: value })}>
              <SelectTrigger><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
              <SelectContent>
              {positions.map((position) => (
                <SelectItem key={position.id} value={position.id}>
                  {position.name}
                </SelectItem>
              ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {form.visibility === 'nivel' && (
          <div className="space-y-2">
            <Label>Nivel minimo</Label>
            <Select value={form.minimum_access_level || 'gestor'} onValueChange={(value) => setForm({ ...form, minimum_access_level: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gestor">Gestor ou Admin</SelectItem>
                <SelectItem value="admin">Somente Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label>Arquivo</Label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-2.5 text-sm transition-colors hover:bg-muted sm:w-auto sm:justify-start sm:py-2">
            {uploading ? <Spinner size="sm" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Enviando...' : form.file_name ? 'Arquivo enviado' : 'Selecionar arquivo'}
            <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
          </label>
        </div>
        {form.file_name ? (
          <p className="text-xs text-muted-foreground">
            {form.file_name}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Envie um arquivo obrigatório para criar o documento. Limite de 5 MB.</p>
        )}
        {uploadError ? (
          <p className="text-xs text-destructive">{uploadError}</p>
        ) : null}
      </div>
      <Button type="submit" disabled={isLoading || uploading || !canSubmit} className="w-full">
        {isLoading ? 'Salvando...' : submitLabel || 'Salvar Documento'}
      </Button>
    </form>
  );
}


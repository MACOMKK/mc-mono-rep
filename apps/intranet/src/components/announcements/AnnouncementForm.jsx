import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Crosshair, ImagePlus, Plus, X } from 'lucide-react';

import { appClient } from '@/api/client';
import { getImageFocusStyle } from '@/lib/announcementImage';
import ImageFocusPicker from './ImageFocusPicker';
import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Switch,
  Textarea,
} from '@macom/ui';

const emptyAnnouncementForm = {
  title: '',
  content: '',
  category: 'geral',
  priority: 'media',
  pinned: false,
  publish_date: '',
  expiration_date: '',
  image_url: '',
  image_path: '',
  image_name: '',
  image_type: '',
  image_size: null,
  image_focus_x: 50,
  image_focus_y: 50,
  document_ids: [],
  links: [],
};

function toDatetimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function datetimeLocalToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildInitialForm(initialData) {
  if (!initialData) return emptyAnnouncementForm;

  return {
    ...emptyAnnouncementForm,
    title: initialData.title || '',
    content: initialData.content || '',
    category: initialData.category || 'geral',
    priority: initialData.priority || 'media',
    pinned: Boolean(initialData.pinned),
    publish_date: toDatetimeLocal(initialData.publish_date),
    expiration_date: toDatetimeLocal(initialData.expiration_date),
    image_url: initialData.image_url || '',
    image_path: initialData.image_path || '',
    image_name: initialData.image_name || '',
    image_type: initialData.image_type || '',
    image_size: initialData.image_size ?? null,
    image_focus_x: initialData.image_focus_x ?? 50,
    image_focus_y: initialData.image_focus_y ?? 50,
    document_ids: Array.isArray(initialData.document_ids) ? initialData.document_ids : [],
    links: Array.isArray(initialData.links)
      ? initialData.links.map((link) => ({ url: link.url || '', label: link.label || '' }))
      : [],
  };
}

export default function AnnouncementForm({
  initialData = null,
  onSubmit,
  isLoading,
  submitLabel = 'Publicar Aviso',
  loadingLabel = 'Publicando...',
}) {
  const [form, setForm] = useState({
    ...buildInitialForm(initialData),
  });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [focusPickerOpen, setFocusPickerOpen] = useState(false);

  const { data: documents = [] } = useQuery({
    queryKey: ['documents-picker'],
    queryFn: async () => {
      try {
        return await appClient.entities.Document.list('-created_date', 200);
      } catch {
        return [];
      }
    },
  });

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError('');
    setUploading(true);

    try {
      const uploadResult = await appClient.storage.uploadAnnouncementImage(file);
      setForm((prev) => ({ ...prev, ...uploadResult, image_focus_x: 50, image_focus_y: 50 }));
      setFocusPickerOpen(true);
    } catch (error) {
      setForm((prev) => ({
        ...prev,
        image_url: '',
        image_path: '',
        image_name: '',
        image_type: '',
        image_size: null,
      }));
      setUploadError(error instanceof Error ? error.message : 'Falha ao enviar imagem.');
      event.target.value = '';
    } finally {
      setUploading(false);
    }
  };

  const toggleDocument = (documentId, checked) => {
    setForm((currentForm) => {
      const currentIds = Array.isArray(currentForm.document_ids) ? currentForm.document_ids : [];
      const nextIds = checked
        ? Array.from(new Set([...currentIds, documentId]))
        : currentIds.filter((id) => id !== documentId);
      return { ...currentForm, document_ids: nextIds };
    });
  };

  const clearImage = () => {
    setUploadError('');
    setForm((prev) => ({
      ...prev,
      image_url: '',
      image_path: '',
      image_name: '',
      image_type: '',
      image_size: null,
      image_focus_x: 50,
      image_focus_y: 50,
    }));
  };

  const confirmImageFocus = ({ x, y }) => {
    setForm((prev) => ({ ...prev, image_focus_x: x, image_focus_y: y }));
    setFocusPickerOpen(false);
  };

  const addLink = () => {
    setForm((prev) => ({ ...prev, links: [...prev.links, { url: '', label: '' }] }));
  };

  const updateLink = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      links: prev.links.map((link, linkIndex) => (linkIndex === index ? { ...link, [field]: value } : link)),
    }));
  };

  const removeLink = (index) => {
    setForm((prev) => ({ ...prev, links: prev.links.filter((_, linkIndex) => linkIndex !== index) }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSubmit({
      ...form,
      publish_date: datetimeLocalToIso(form.publish_date),
      expiration_date: datetimeLocalToIso(form.expiration_date),
      links: form.links
        .filter((link) => link.url.trim())
        .map((link) => ({ url: link.url.trim(), label: link.label.trim() || 'Saiba mais' })),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Título</Label>
        <Input
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
          required
          placeholder="Título do aviso"
        />
      </div>

      <div className="space-y-2">
        <Label>Conteúdo</Label>
        <Textarea
          value={form.content}
          onChange={(event) => setForm({ ...form, content: event.target.value })}
          required
          rows={4}
          placeholder="Descreva o aviso..."
        />
      </div>

      <div className="space-y-2">
        <Label>Links (opcional)</Label>
        <div className="space-y-3">
          {form.links.map((link, index) => (
            <div key={index} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-start">
              <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                <Input
                  type="url"
                  value={link.url}
                  onChange={(event) => updateLink(index, 'url', event.target.value)}
                  placeholder="https://..."
                />
                <Input
                  value={link.label}
                  onChange={(event) => updateLink(index, 'label', event.target.value)}
                  placeholder="Texto do botão (ex.: Saiba mais)"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                className="px-3 sm:mt-0"
                onClick={() => removeLink(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button type="button" variant="outline" className="w-full gap-2 sm:w-auto" onClick={addLink}>
            <Plus className="h-4 w-4" />
            Adicionar link
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select value={form.category} onValueChange={(value) => setForm({ ...form, category: value })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="geral">Geral</SelectItem>
              <SelectItem value="rh">RH</SelectItem>
              <SelectItem value="ti">TI</SelectItem>
              <SelectItem value="financeiro">Financeiro</SelectItem>
              <SelectItem value="vendas">Vendas</SelectItem>
              <SelectItem value="pos_vendas">Pos-Vendas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Prioridade</Label>
          <Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="baixa">Baixa</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Documentos relacionados</Label>
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
          {documents.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum documento disponível.</p>
          ) : documents.map((document) => (
            <label key={document.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={(form.document_ids || []).includes(document.id)}
                onCheckedChange={(checked) => toggleDocument(document.id, checked)}
              />
              {document.title}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Opcional. Linka o aviso a documentos já cadastrados.</p>
      </div>

      <div className="space-y-2">
        <Label>Imagem de destaque</Label>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-2.5 text-sm transition-colors hover:bg-muted sm:w-auto sm:justify-start sm:py-2">
            {uploading ? <Spinner size="sm" /> : <ImagePlus className="h-4 w-4" />}
            {uploading ? 'Enviando...' : form.image_name ? 'Trocar imagem' : 'Selecionar imagem'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleImageUpload}
              disabled={uploading}
            />
          </label>

          {form.image_url ? (
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 px-3 sm:w-auto"
              onClick={() => setFocusPickerOpen(true)}
              disabled={uploading}
            >
              <Crosshair className="h-4 w-4" />
              Ajustar enquadramento
            </Button>
          ) : null}

          {form.image_name ? (
            <Button type="button" variant="ghost" className="w-full gap-2 px-3 sm:w-auto" onClick={clearImage}>
              <X className="h-4 w-4" />
              Remover
            </Button>
          ) : null}
        </div>

        {form.image_url ? (
          <div className="overflow-hidden rounded-xl border border-border">
            <img
              src={form.image_url}
              alt="Preview da imagem do aviso"
              className="h-40 w-full object-cover"
              style={getImageFocusStyle(form)}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Opcional. Use JPG, PNG ou WebP com até 2 MB.
          </p>
        )}

        {form.image_name ? (
          <p className="text-xs text-muted-foreground">{form.image_name}</p>
        ) : null}

        {uploadError ? <p className="text-xs text-destructive">{uploadError}</p> : null}

        {focusPickerOpen ? (
          <ImageFocusPicker
            key={form.image_url}
            open={focusPickerOpen}
            imageUrl={form.image_url}
            initialFocus={{ x: form.image_focus_x, y: form.image_focus_y }}
            onCancel={() => setFocusPickerOpen(false)}
            onConfirm={confirmImageFocus}
          />
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Switch checked={form.pinned} onCheckedChange={(value) => setForm({ ...form, pinned: value })} />
        <Label>Fixar aviso</Label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Publicar em</Label>
          <Input
            type="datetime-local"
            value={form.publish_date}
            onChange={(event) => setForm({ ...form, publish_date: event.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>Expirar em</Label>
          <Input
            type="datetime-local"
            value={form.expiration_date}
            onChange={(event) => setForm({ ...form, expiration_date: event.target.value })}
          />
        </div>
      </div>

      <Button type="submit" disabled={isLoading || uploading} className="w-full">
        {isLoading ? loadingLabel : submitLabel}
      </Button>
    </form>
  );
}

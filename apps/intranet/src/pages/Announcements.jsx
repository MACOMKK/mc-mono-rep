import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Bell, Copy, Info, Pencil, Pin, Plus, Share2, Trash2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { appClient } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/lib/usePermissions';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FeedbackToast,
  Skeleton,
  SocialLink,
} from '@macom/ui';
import AnnouncementForm from '../components/announcements/AnnouncementForm';
import AnnouncementDetailsDialog from '../components/announcements/AnnouncementDetailsDialog';
import AnnouncementDocumentReference from '../components/announcements/AnnouncementDocumentReference';
import AnnouncementInteractions from '../components/announcements/AnnouncementInteractions';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import Pagination, { usePaginatedItems } from '../components/Pagination';
import { getImageFocusStyle } from '../lib/announcementImage';

const priorityConfig = {
  urgente: { icon: AlertTriangle, class: 'bg-red-100 text-red-700 border-red-200' },
  alta: { icon: AlertTriangle, class: 'bg-orange-100 text-orange-700 border-orange-200' },
  media: { icon: Info, class: 'bg-blue-100 text-blue-700 border-blue-200' },
  baixa: { icon: Bell, class: 'bg-gray-100 text-gray-700 border-gray-200' },
};

const statusConfig = {
  scheduled: { label: 'Agendado', class: 'border-amber-200 bg-amber-50 text-amber-700' },
  published: { label: 'Publicado', class: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  expired: { label: 'Expirado', class: 'border-slate-200 bg-slate-50 text-slate-600' },
};

const categoryLabels = {
  geral: 'Geral',
  rh: 'RH',
  ti: 'TI',
  financeiro: 'Financeiro',
  vendas: 'Vendas',
  pos_vendas: 'Pos-Vendas',
};

const announcementQueryKeys = [
  ['announcements', 'active'],
  ['announcements', 'manage'],
  ['announcements-home'],
];

function updateAnnouncementCaches(queryClient, updater) {
  announcementQueryKeys.forEach((queryKey) => {
    queryClient.setQueryData(queryKey, (old = []) => {
      if (!Array.isArray(old)) return old;
      return updater(old);
    });
  });
}

function snapshotAnnouncementCaches(queryClient) {
  return announcementQueryKeys.map((queryKey) => ({
    queryKey,
    data: queryClient.getQueryData(queryKey),
  }));
}

function restoreAnnouncementCaches(queryClient, snapshots = []) {
  snapshots.forEach(({ queryKey, data }) => {
    queryClient.setQueryData(queryKey, data);
  });
}

function invalidateAnnouncementCaches(queryClient) {
  announcementQueryKeys.forEach((queryKey) => {
    queryClient.invalidateQueries({ queryKey });
  });
}

function prependAnnouncement(announcements, announcement) {
  if (!announcement?.id) return announcements;
  return [announcement, ...announcements.filter((item) => item.id !== announcement.id)];
}

function replaceAnnouncement(announcements, announcement) {
  if (!announcement?.id) return announcements;
  return announcements.map((item) => (item.id === announcement.id ? { ...item, ...announcement } : item));
}

function removeAnnouncement(announcements, id) {
  return announcements.filter((announcement) => announcement.id !== id);
}

function getAnnouncementPreview(content, maxLength = 280) {
  if (!content) return '';
  const normalized = String(content).replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function formatAnnouncementDate(value) {
  return format(new Date(value), "d 'de' MMMM 'de' yyyy 'as' HH:mm", { locale: ptBR });
}

function wasAnnouncementEdited(announcement) {
  if (!announcement?.created_date || !announcement?.updated_date) return false;
  const createdAt = new Date(announcement.created_date).getTime();
  const updatedAt = new Date(announcement.updated_date).getTime();
  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) return false;
  return updatedAt - createdAt > 1000;
}

function canManageAnnouncement(announcement, currentUser) {
  if (!announcement || !currentUser) return false;
  if (currentUser.role === 'admin') return true;

  const currentUserId = currentUser.collaborator_id || currentUser.id;
  return Boolean(currentUserId && announcement.created_by_id === currentUserId);
}

function getErrorMessage(error, fallback) {
  if (!error) return fallback;
  return error instanceof Error ? error.message : fallback;
}

export default function Announcements() {
  const { canEdit, isLoading: isPermissionsLoading } = usePermissions('avisos');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [filter, setFilter] = useState('all');
  const [announcementToDelete, setAnnouncementToDelete] = useState(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [shareAnnouncement, setShareAnnouncement] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();

  const {
    data: announcements = [],
    error: announcementsError,
    isError: isAnnouncementsError,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['announcements', canEdit ? 'manage' : 'active'],
    queryFn: () => (
      canEdit
        ? appClient.entities.Announcement.filter({ include_inactive: true }, '-created_date', 50)
        : appClient.entities.Announcement.list('-created_date', 50)
    ),
    enabled: !isPermissionsLoading,
  });

  const createMutation = useMutation({
    mutationFn: (data) => appClient.entities.Announcement.create(data),
    onSuccess: (createdAnnouncement) => {
      updateAnnouncementCaches(queryClient, (old) => prependAnnouncement(old, createdAnnouncement));
      setDialogOpen(false);
      setEditingAnnouncement(null);
      setFeedback({ type: 'success', message: 'Aviso publicado com sucesso.' });
      invalidateAnnouncementCaches(queryClient);
    },
    onError: (error) => {
      setFeedback({
        type: 'error',
        message: getErrorMessage(error, 'Não foi possível publicar o aviso.'),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => appClient.entities.Announcement.update(id, data),
    onMutate: async ({ id, data }) => {
      await Promise.all(announcementQueryKeys.map((queryKey) => queryClient.cancelQueries({ queryKey })));
      const previousCaches = snapshotAnnouncementCaches(queryClient);
      const optimisticAnnouncement = {
        ...data,
        id,
        updated_date: new Date().toISOString(),
      };

      updateAnnouncementCaches(queryClient, (old) => replaceAnnouncement(old, optimisticAnnouncement));
      setDialogOpen(false);
      setEditingAnnouncement(null);
      setSelectedAnnouncement((current) => (current?.id === id ? { ...current, ...optimisticAnnouncement } : current));

      return { previousCaches };
    },
    onSuccess: (updatedAnnouncement) => {
      updateAnnouncementCaches(queryClient, (old) => replaceAnnouncement(old, updatedAnnouncement));
      setSelectedAnnouncement((current) => (current?.id === updatedAnnouncement?.id ? updatedAnnouncement : current));
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      queryClient.invalidateQueries({ queryKey: ['announcements-home'] });
      setDialogOpen(false);
      setEditingAnnouncement(null);
      setFeedback({ type: 'success', message: 'Aviso atualizado com sucesso.' });
    },
    onError: (error, _variables, context) => {
      restoreAnnouncementCaches(queryClient, context?.previousCaches);
      setFeedback({
        type: 'error',
        message: getErrorMessage(error, 'NÃ£o foi possÃ­vel atualizar o aviso.'),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => appClient.entities.Announcement.delete(id),
    onMutate: async (id) => {
      await Promise.all(announcementQueryKeys.map((queryKey) => queryClient.cancelQueries({ queryKey })));
      const previousCaches = snapshotAnnouncementCaches(queryClient);

      updateAnnouncementCaches(queryClient, (old) => removeAnnouncement(old, id));
      setAnnouncementToDelete(null);
      setSelectedAnnouncement((current) => (current?.id === id ? null : current));

      return { previousCaches };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      queryClient.invalidateQueries({ queryKey: ['announcements-home'] });
      setAnnouncementToDelete(null);
      setFeedback({ type: 'success', message: 'Aviso excluído com sucesso.' });
    },
    onError: (error, _id, context) => {
      restoreAnnouncementCaches(queryClient, context?.previousCaches);
      setFeedback({
        type: 'error',
        message: getErrorMessage(error, 'Não foi possível excluir o aviso.'),
      });
    },
  });

  const togglePin = useMutation({
    mutationFn: (announcement) => appClient.entities.Announcement.update(announcement.id, { pinned: !announcement.pinned }),
    onMutate: async (announcement) => {
      await Promise.all(announcementQueryKeys.map((queryKey) => queryClient.cancelQueries({ queryKey })));
      const previousCaches = snapshotAnnouncementCaches(queryClient);
      const optimisticAnnouncement = {
        ...announcement,
        pinned: !announcement.pinned,
        updated_date: new Date().toISOString(),
      };

      updateAnnouncementCaches(queryClient, (old) => replaceAnnouncement(old, optimisticAnnouncement));
      setSelectedAnnouncement((current) => (current?.id === announcement.id ? optimisticAnnouncement : current));

      return { previousCaches };
    },
    onSuccess: (updatedAnnouncement) => {
      updateAnnouncementCaches(queryClient, (old) => replaceAnnouncement(old, updatedAnnouncement));
      setSelectedAnnouncement((current) => (current?.id === updatedAnnouncement?.id ? updatedAnnouncement : current));
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      queryClient.invalidateQueries({ queryKey: ['announcements-home'] });
    },
    onError: (error, _announcement, context) => {
      restoreAnnouncementCaches(queryClient, context?.previousCaches);
      setFeedback({
        type: 'error',
        message: getErrorMessage(error, 'Não foi possível atualizar o aviso.'),
      });
    },
  });

  const filtered = filter === 'all' ? announcements : announcements.filter((announcement) => announcement.category === filter);
  const sorted = [...filtered].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  const {
    page,
    setPage,
    totalItems,
    totalPages,
    paginatedItems: paginatedAnnouncements,
  } = usePaginatedItems(sorted, 8, [filter]);

  const handleConfirmDelete = () => {
    if (!announcementToDelete) return;
    deleteMutation.mutate(announcementToDelete.id);
  };

  const openCreateDialog = () => {
    setEditingAnnouncement(null);
    setDialogOpen(true);
  };

  const openEditDialog = (announcement) => {
    setEditingAnnouncement(announcement);
    setDialogOpen(true);
  };

  const handleDialogOpenChange = (open) => {
    setDialogOpen(open);
    if (!open) {
      setEditingAnnouncement(null);
    }
  };

  const handleSubmitAnnouncement = (data) => {
    if (editingAnnouncement) {
      return updateMutation.mutateAsync({ id: editingAnnouncement.id, data });
    }

    return createMutation.mutateAsync(data);
  };

  const buildAnnouncementUrl = (announcement) => {
    const params = new URLSearchParams();
    params.set('aviso', announcement.id);
    return `${window.location.origin}/avisos?${params.toString()}`;
  };

  const openAnnouncement = (announcement, { replace = false } = {}) => {
    setSelectedAnnouncement(announcement);
    const params = new URLSearchParams(location.search);
    params.set('aviso', announcement.id);
    navigate({ pathname: '/avisos', search: params.toString() }, { replace });
  };

  const closeAnnouncement = () => {
    setSelectedAnnouncement(null);
    const params = new URLSearchParams(location.search);
    params.delete('aviso');
    navigate({ pathname: '/avisos', search: params.toString() }, { replace: true });
  };

  const copyShareLink = async (announcement) => {
    const shareUrl = buildAnnouncementUrl(announcement);
    const text = `${announcement.title}\n${shareUrl}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setFeedback({ type: 'success', message: 'Link do aviso copiado.' });
    } catch (error) {
      setFeedback({ type: 'error', message: 'Nao foi possivel copiar o link.' });
    }
  };

  const handleShareAnnouncement = (announcement) => {
    setShareAnnouncement(announcement);
  };

  useEffect(() => {
    const announcementId = new URLSearchParams(location.search).get('aviso');
    if (!announcementId || !announcements.length) return;

    const announcement = announcements.find((item) => item.id === announcementId);
    if (announcement) {
      setSelectedAnnouncement(announcement);
    }
  }, [announcements, location.search]);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold">Mural de Avisos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Comunicados e informações importantes</p>
        </div>

        {canEdit ? (
          <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
            <DialogTrigger asChild>
              <Button className="w-full gap-2 sm:w-auto" onClick={openCreateDialog}><Plus className="h-4 w-4" /> Novo Aviso</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingAnnouncement ? 'Editar Aviso' : 'Novo Aviso'}</DialogTitle>
              </DialogHeader>
              <AnnouncementForm
                key={editingAnnouncement?.id || 'new-announcement'}
                initialData={editingAnnouncement}
                onSubmit={handleSubmitAnnouncement}
                isLoading={createMutation.isPending || updateMutation.isPending}
                submitLabel={editingAnnouncement ? 'Salvar AlteraÃ§Ãµes' : 'Publicar Aviso'}
                loadingLabel={editingAnnouncement ? 'Salvando...' : 'Publicando...'}
              />
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      <div className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-2 pb-1 sm:min-w-0 sm:flex-wrap">
          {['all', 'geral', 'rh', 'ti', 'financeiro', 'vendas', 'pos_vendas'].map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setFilter(category)}
              className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium transition-colors ${
                filter === category ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {category === 'all' ? 'Todos' : categoryLabels[category]}
            </button>
          ))}
        </div>
      </div>

      {isLoading || isPermissionsLoading ? (
        <div className="space-y-3">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24 w-full rounded-xl" />)}</div>
      ) : isAnnouncementsError ? (
        <Alert variant="destructive" className="rounded-2xl border-destructive/30 bg-destructive/5">
          <AlertTitle>Não foi possível carregar os avisos</AlertTitle>
          <AlertDescription className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{getErrorMessage(announcementsError, 'Tente novamente em alguns instantes.')}</span>
            <Button
              type="button"
              variant="outline"
              className="w-full shrink-0 sm:w-auto"
              disabled={isFetching}
              onClick={() => refetch()}
            >
              {isFetching ? 'Tentando...' : 'Tentar novamente'}
            </Button>
          </AlertDescription>
        </Alert>
      ) : sorted.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <Bell className="mx-auto mb-3 h-12 w-12 opacity-30" />
          <p>Nenhum aviso encontrado.</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {paginatedAnnouncements.map((announcement) => {
              const config = priorityConfig[announcement.priority] || priorityConfig.media;
              const status = statusConfig[announcement.status] || statusConfig.published;
              const preview = getAnnouncementPreview(announcement.content);
              const canManage = canEdit && canManageAnnouncement(announcement, currentUser);

              return (
                <div
                  key={announcement.id}
                  className={`overflow-hidden rounded-xl border bg-card transition-all hover:shadow-md ${
                    announcement.pinned ? 'border-primary/30 bg-primary/[0.02]' : 'border-border'
                  }`}
                >
                  {announcement.image_url ? (
                    <div className="border-b border-border bg-muted/20">
                      <img
                        src={announcement.image_url}
                        alt={announcement.title}
                        className="h-52 w-full object-cover sm:h-64"
                        style={getImageFocusStyle(announcement)}
                      />
                    </div>
                  ) : null}

                  <div className="p-4 sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {announcement.pinned ? <Pin className="h-4 w-4 shrink-0 text-primary" /> : null}
                          <h3 className="text-base font-semibold leading-tight">{announcement.title}</h3>
                          <Badge variant="outline" className={`text-[10px] ${config.class}`}>{announcement.priority}</Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {categoryLabels[announcement.category] || announcement.category}
                          </Badge>
                          {canEdit ? (
                            <Badge variant="outline" className={`text-[10px] ${status.class}`}>
                              {status.label}
                            </Badge>
                          ) : null}
                        </div>

                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{preview}</p>

                        <AnnouncementDocumentReference
                          documents={announcement.documents}
                          maxVisible={2}
                          onError={(message) => setFeedback({ type: 'error', message })}
                        />

                        <Button
                          type="button"
                          variant="link"
                          className="mt-2 h-auto px-0 text-sm font-semibold"
                          onClick={() => openAnnouncement(announcement)}
                        >
                          Ler aviso completo
                        </Button>

                        <p className="mt-3 text-xs leading-5 text-muted-foreground">
                          Publicado em {formatAnnouncementDate(announcement.created_date)}
                          {announcement.created_by ? ` · por ${announcement.created_by}` : ''}
                          {wasAnnouncementEdited(announcement) ? ` · editado em ${formatAnnouncementDate(announcement.updated_date)}` : ''}
                        </p>

                        {canEdit && (announcement.publish_date || announcement.expiration_date) ? (
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {announcement.publish_date ? `Inicia em ${formatAnnouncementDate(announcement.publish_date)}` : ''}
                            {announcement.publish_date && announcement.expiration_date ? ' | ' : ''}
                            {announcement.expiration_date ? `Expira em ${formatAnnouncementDate(announcement.expiration_date)}` : ''}
                          </p>
                        ) : null}

                        <AnnouncementInteractions
                          announcementId={announcement.id}
                          currentUserId={currentUser?.collaborator_id || currentUser?.id}
                        />
                      </div>

                      <div className="flex shrink-0 items-center gap-1 self-end sm:self-start">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleShareAnnouncement(announcement)}
                          className="h-8 w-8"
                          aria-label="Compartilhar aviso"
                          title="Compartilhar aviso"
                        >
                          <Share2 className="h-4 w-4" />
                        </Button>
                        {canManage ? (
                          <>
                          <Button variant="ghost" size="icon" onClick={() => togglePin.mutate(announcement)} className="h-8 w-8">
                            <Pin className={`h-4 w-4 ${announcement.pinned ? 'text-primary' : 'text-muted-foreground'}`} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(announcement)}
                            className="h-8 w-8"
                            aria-label="Editar aviso"
                            title="Editar aviso"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setAnnouncementToDelete(announcement)}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={8}
            onPageChange={setPage}
            itemLabel="avisos"
          />
        </>
      )}

      <ConfirmDeleteDialog
        open={Boolean(announcementToDelete)}
        onOpenChange={(open) => !open && setAnnouncementToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Excluir aviso"
        description={
          announcementToDelete
            ? `Essa ação não pode ser desfeita. Deseja excluir o aviso "${announcementToDelete.title}"?`
            : 'Essa ação não pode ser desfeita.'
        }
        isLoading={deleteMutation.isPending}
      />

      <AnnouncementDetailsDialog
        announcement={selectedAnnouncement}
        open={Boolean(selectedAnnouncement)}
        onOpenChange={(open) => !open && closeAnnouncement()}
        onShare={handleShareAnnouncement}
        onDocumentError={(message) => setFeedback({ type: 'error', message })}
      />

      <Dialog open={Boolean(shareAnnouncement)} onOpenChange={(open) => !open && setShareAnnouncement(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Compartilhar aviso</DialogTitle>
          </DialogHeader>

          {shareAnnouncement ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="line-clamp-2 text-sm font-semibold text-foreground">{shareAnnouncement.title}</p>
                <p className="mt-1 break-all text-xs text-muted-foreground">{buildAnnouncementUrl(shareAnnouncement)}</p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <SocialLink
                  network="whatsapp"
                  href={`https://wa.me/?text=${encodeURIComponent(`${shareAnnouncement.title}\n${buildAnnouncementUrl(shareAnnouncement)}`)}`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-medium transition-colors hover:bg-muted"
                />
                <SocialLink
                  network="facebook"
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(buildAnnouncementUrl(shareAnnouncement))}`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-medium transition-colors hover:bg-muted"
                />
                <SocialLink
                  network="linkedin"
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(buildAnnouncementUrl(shareAnnouncement))}`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-medium transition-colors hover:bg-muted"
                />
                <SocialLink
                  network="x"
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareAnnouncement.title)}&url=${encodeURIComponent(buildAnnouncementUrl(shareAnnouncement))}`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-medium transition-colors hover:bg-muted"
                />
              </div>

              <Button
                type="button"
                variant="secondary"
                className="w-full gap-2 rounded-xl"
                onClick={() => copyShareLink(shareAnnouncement)}
              >
                <Copy className="h-4 w-4" />
                Copiar link
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <FeedbackToast feedback={feedback} onClose={() => setFeedback(null)} />
    </div>
  );
}

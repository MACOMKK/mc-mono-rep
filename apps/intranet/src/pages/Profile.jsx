import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, Building2, Camera, ChevronDown, FileSignature, Mail, MapPin, PenLine, Phone, Save, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { FeedbackToast, SignaturePadModal, Skeleton } from '@macom/ui';

import { appClient } from '@/api/client';

const EMPTY_FORM = {
  email: '',
  phone: '',
  birth_date: '',
  department_id: '',
  unit_id: '',
  change_request_note: '',
  photo_url: '',
  photo_path: '',
  bio: '',
  status_message: '',
  linkedin_url: '',
  whatsapp_url: '',
  office_location: '',
  skills: '',
  interests: '',
};

const AVATAR_OUTPUT_SIZE = 400;
const DEFAULT_CROP = {
  zoom: 1,
  x: 50,
  y: 50,
};

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR');
}

function formatValue(value) {
  return value ? String(value) : '-';
}

function buildProfileForm(profile) {
  if (!profile) return EMPTY_FORM;

  return {
    email: profile.email || '',
    phone: profile.phone || '',
    birth_date: profile.birth_date || '',
    department_id: profile.pending_change_request?.department_id || profile.department_id || '',
    unit_id: profile.pending_change_request?.unit_id || profile.unit_id || '',
    change_request_note: profile.pending_change_request?.note || '',
    photo_url: profile.photo_url || '',
    photo_path: profile.photo_path || '',
    bio: profile.bio || '',
    status_message: profile.status_message || '',
    linkedin_url: profile.linkedin_url || '',
    whatsapp_url: profile.whatsapp_url || '',
    office_location: profile.office_location || '',
    skills: Array.isArray(profile.skills) ? profile.skills.join(', ') : '',
    interests: Array.isArray(profile.interests) ? profile.interests.join(', ') : '',
  };
}

function isTemporaryCadastroEmail(value) {
  return /^[^@\s]+@cadastro\.macom\.(local|com\.br)$/i.test(String(value || '').trim());
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function createCroppedAvatarFile({ imageUrl, fileName, fileType, crop }) {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Nao foi possivel preparar o recorte da foto.');
  }

  const zoom = Number(crop.zoom) || 1;
  const cropSize = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
  const maxX = image.naturalWidth - cropSize;
  const maxY = image.naturalHeight - cropSize;
  const sourceX = clamp((maxX * crop.x) / 100, 0, maxX);
  const sourceY = clamp((maxY * crop.y) / 100, 0, maxY);

  context.drawImage(
    image,
    sourceX,
    sourceY,
    cropSize,
    cropSize,
    0,
    0,
    AVATAR_OUTPUT_SIZE,
    AVATAR_OUTPUT_SIZE,
  );

  const outputType = fileType === 'image/png' ? 'image/png' : 'image/jpeg';
  const extension = outputType === 'image/png' ? 'png' : 'jpg';
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, outputType, 0.9));

  if (!blob) {
    throw new Error('Nao foi possivel gerar a foto recortada.');
  }

  const safeName = String(fileName || 'avatar')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'avatar';

  return new File([blob], `${safeName}.${extension}`, { type: outputType });
}

function ReadOnlyField({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-slate-950">{formatValue(value)}</p>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 w-full rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-[360px,1fr]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    </div>
  );
}

function CollapsibleSection({ title, description, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
        aria-expanded={open}
      >
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{title}</h3>
          {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="border-t border-slate-200 px-4 py-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function AvatarCropModal({
  cropImage,
  crop,
  onCropChange,
  onCancel,
  onConfirm,
  isProcessing,
}) {
  if (!cropImage) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="absolute inset-0" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-950">Recortar foto</h2>
          <p className="mt-1 text-sm text-slate-500">Ajuste a foto para o formato circular do perfil.</p>
        </div>

        <div className="mx-auto flex h-72 w-72 max-w-full items-center justify-center overflow-hidden rounded-full bg-slate-100 ring-4 ring-slate-200">
          <img
            src={cropImage.url}
            alt=""
            className="h-full w-full object-cover"
            style={{
              objectPosition: `${crop.x}% ${crop.y}%`,
              transform: `scale(${crop.zoom})`,
            }}
          />
        </div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Zoom
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={crop.zoom}
              onChange={(event) => onCropChange({ ...crop, zoom: Number(event.target.value) })}
              className="accent-[#E30613]"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Horizontal
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={crop.x}
              onChange={(event) => onCropChange({ ...crop, x: Number(event.target.value) })}
              className="accent-[#E30613]"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Vertical
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={crop.y}
              onChange={(event) => onCropChange({ ...crop, y: Number(event.target.value) })}
              className="accent-[#E30613]"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded-xl px-4 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50"
            disabled={isProcessing}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-10 rounded-xl bg-[#E30613] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#c80510] disabled:opacity-70"
            disabled={isProcessing}
          >
            {isProcessing ? 'Enviando...' : 'Confirmar recorte'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [feedback, setFeedback] = useState(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarCropImage, setAvatarCropImage] = useState(null);
  const [avatarCrop, setAvatarCrop] = useState(DEFAULT_CROP);
  const [isUploadingSignature, setIsUploadingSignature] = useState(false);
  const [isSignaturePadOpen, setIsSignaturePadOpen] = useState(false);

  const profileQuery = useQuery({
    queryKey: ['current-profile'],
    queryFn: async () => {
      const rows = await appClient.entities.Profile.list();
      return rows[0] || null;
    },
  });

  const departmentsQuery = useQuery({
    queryKey: ['catalog-departments'],
    queryFn: () => appClient.catalogs.listDepartments(),
  });

  const unitsQuery = useQuery({
    queryKey: ['catalog-units'],
    queryFn: () => appClient.catalogs.listUnits(),
  });

  const googleCalendarQuery = useQuery({
    queryKey: ['google-calendar-status'],
    queryFn: () => appClient.googleCalendar.status(),
  });

  const profile = profileQuery.data;
  const canEditEmail = isTemporaryCadastroEmail(profile?.email);
  const pendingRequest = profile?.pending_change_request;
  const initials = useMemo(() => {
    const source = profile?.name || profile?.email || 'Usuario';
    return source
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'U';
  }, [profile]);

  useEffect(() => {
    if (profile) {
      setForm(buildProfileForm(profile));
    }
  }, [profile]);

  useEffect(() => () => {
    if (avatarCropImage?.url) {
      URL.revokeObjectURL(avatarCropImage.url);
    }
  }, [avatarCropImage]);

  const profileMutation = useMutation({
    mutationFn: (payload) => appClient.entities.Profile.update('me', payload),
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(['current-profile'], updatedProfile);
      setForm(buildProfileForm(updatedProfile));
      setFeedback({ type: 'success', message: 'Perfil atualizado com sucesso.' });
    },
    onError: (error) => {
      setFeedback({ type: 'error', message: error?.message || 'Nao foi possivel salvar o perfil.' });
    },
  });

  const startGoogleCalendarMutation = useMutation({
    mutationFn: () => appClient.googleCalendar.start('/perfil'),
    onSuccess: (result) => {
      if (result?.authorization_url) {
        window.location.assign(result.authorization_url);
      }
    },
    onError: (error) => {
      setFeedback({ type: 'error', message: error?.message || 'Nao foi possivel iniciar a conexao com Google Agenda.' });
    },
  });

  const disconnectGoogleCalendarMutation = useMutation({
    mutationFn: () => appClient.googleCalendar.disconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
      setFeedback({ type: 'success', message: 'Google Agenda desconectada.' });
    },
    onError: (error) => {
      setFeedback({ type: 'error', message: error?.message || 'Nao foi possivel desconectar a Google Agenda.' });
    },
  });

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    profileMutation.mutate(form);
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.type && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFeedback({ type: 'error', message: 'Formato de imagem nao suportado. Use JPG, PNG ou WebP.' });
      return;
    }

    if (avatarCropImage?.url) {
      URL.revokeObjectURL(avatarCropImage.url);
    }

    setAvatarCrop(DEFAULT_CROP);
    setAvatarCropImage({
      url: URL.createObjectURL(file),
      fileName: file.name,
      fileType: file.type,
    });
  };

  const handleCancelAvatarCrop = () => {
    if (avatarCropImage?.url) {
      URL.revokeObjectURL(avatarCropImage.url);
    }
    setAvatarCropImage(null);
    setAvatarCrop(DEFAULT_CROP);
  };

  const handleConfirmAvatarCrop = async () => {
    if (!avatarCropImage) return;

    setIsUploadingAvatar(true);
    let uploadedAvatarPath = '';
    try {
      const croppedFile = await createCroppedAvatarFile({
        imageUrl: avatarCropImage.url,
        fileName: avatarCropImage.fileName,
        fileType: avatarCropImage.fileType,
        crop: avatarCrop,
      });
      const result = await appClient.storage.uploadAvatar(croppedFile, profile?.id);
      uploadedAvatarPath = result.photo_path;
      const updatedProfile = await appClient.entities.ProfileAvatar.update('me', {
        photo_url: result.photo_url,
        photo_path: result.photo_path,
      });
      queryClient.setQueryData(['current-profile'], updatedProfile);
      setForm(buildProfileForm(updatedProfile));
      setFeedback({ type: 'success', message: 'Foto do perfil atualizada.' });
      handleCancelAvatarCrop();
    } catch (error) {
      if (uploadedAvatarPath) {
        await appClient.storage.deleteAvatar(uploadedAvatarPath).catch(() => null);
      }
      setFeedback({ type: 'error', message: error?.message || 'Nao foi possivel enviar a foto.' });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const openAvatarFilePicker = () => {
    document.getElementById('profile-avatar-input')?.click();
  };

  const openSignaturePad = () => setIsSignaturePadOpen(true);

  const handleCancelSignaturePad = () => setIsSignaturePadOpen(false);

  const handleConfirmSignature = async (file) => {
    setIsUploadingSignature(true);
    let uploadedSignaturePath = '';
    try {
      const result = await appClient.storage.uploadSignature(file, profile?.id);
      uploadedSignaturePath = result.signature_path;
      const updatedProfile = await appClient.entities.ProfileSignature.update('me', {
        signature_url: result.signature_url,
        signature_path: result.signature_path,
      });
      queryClient.setQueryData(['current-profile'], updatedProfile);
      setForm(buildProfileForm(updatedProfile));
      setFeedback({ type: 'success', message: 'Assinatura atualizada.' });
      setIsSignaturePadOpen(false);
    } catch (error) {
      if (uploadedSignaturePath) {
        await appClient.storage.deleteSignature(uploadedSignaturePath).catch(() => null);
      }
      setFeedback({ type: 'error', message: error?.message || 'Nao foi possivel salvar a assinatura.' });
    } finally {
      setIsUploadingSignature(false);
    }
  };

  if (profileQuery.isLoading) {
    return (
      <div className="space-y-6">
        <ProfileSkeleton />
      </div>
    );
  }

  if (profileQuery.isError) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-red-100 bg-red-50 p-6 text-red-800">
        <h1 className="text-lg font-bold">Nao foi possivel carregar o perfil</h1>
        <p className="mt-2 text-sm">{profileQuery.error?.message || 'Tente novamente em instantes.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:border-[#E30613] hover:text-[#E30613]"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#E30613]">Conta</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">Perfil</h1>
            <p className="mt-1 text-sm text-slate-500">Dados do colaborador e personalizacao da intranet.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px,1fr]">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={openAvatarFilePicker}
                className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#E30613] text-lg font-bold text-white shadow-sm ring-2 ring-slate-200"
                aria-label="Adicionar foto do perfil"
              >
                {form.photo_url ? (
                  <img src={form.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-slate-950/45 opacity-0 transition-opacity group-hover:opacity-100">
                  <Camera className="h-5 w-5 text-white" />
                </span>
              </button>
              <input
                id="profile-avatar-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarChange}
                disabled={isUploadingAvatar}
                className="sr-only"
              />
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-slate-950">{formatValue(profile?.name)}</h2>
                <p className="truncate text-sm text-slate-500">{formatValue(profile?.email)}</p>
              </div>
            </div>

            {profile?.status_message ? (
              <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                {profile.status_message}
              </p>
            ) : null}

            <div className="mt-5 space-y-3 text-sm text-slate-600">
              <div className="flex items-center gap-3">
                <BadgeCheck className="h-4 w-4 text-[#E30613]" />
                <span>{formatValue(profile?.position)}</span>
              </div>
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-[#E30613]" />
                <span>{formatValue(profile?.department_name)}</span>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-[#E30613]" />
                <span>{formatValue(profile?.unit_name)}</span>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-[#E30613]" />
                <span>{formatValue(profile?.phone)}</span>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-[#E30613]" />
                <span className="min-w-0 break-all">{formatValue(profile?.email)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <UserRound className="h-4 w-4 text-[#E30613]" />
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Dados oficiais</h2>
            </div>
            <div className="grid gap-3">
              <ReadOnlyField label="Funcao" value={profile?.function_role} />
              <ReadOnlyField label="Status" value={profile?.status} />
              <ReadOnlyField label="Nascimento" value={formatDate(profile?.birth_date)} />
              <ReadOnlyField label="Atualizado em" value={formatDate(profile?.collaborator_updated_date)} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <PenLine className="h-4 w-4 text-[#E30613]" />
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Minha assinatura</h2>
            </div>
            <p className="text-xs text-slate-500">
              Usada para estampar sua assinatura em PDFs, como comprovantes do modulo Financeiro.
            </p>
            <div className="mt-4 flex h-24 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
              {profile?.signature_url ? (
                <img src={profile.signature_url} alt="Assinatura" className="h-full max-w-full object-contain" />
              ) : (
                <span className="text-sm text-slate-400">Nenhuma assinatura cadastrada</span>
              )}
            </div>
            <button
              type="button"
              onClick={openSignaturePad}
              className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <PenLine className="h-4 w-4" />
              {profile?.signature_url ? 'Alterar assinatura' : 'Desenhar assinatura'}
            </button>
            <Link
              to="/termo-equipamento"
              className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-[#E30613] transition-colors hover:bg-red-50"
            >
              <FileSignature className="h-4 w-4" />
              Assinar termo de equipamento
            </Link>
          </div>
        </aside>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Informacoes do perfil</h2>
              <p className="mt-1 text-sm text-slate-500">Atualize seus dados permitidos e a personalizacao da intranet.</p>
            </div>
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#E30613] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#c80510] disabled:opacity-70"
              disabled={profileMutation.isPending}
            >
              <Save className="h-4 w-4" />
              {profileMutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>

          <div className="grid gap-5">
            <CollapsibleSection
              title="Dados cadastrais editaveis"
              description="Telefone, nascimento e solicitacao de troca de departamento/unidade."
              defaultOpen
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Telefone
                  <input
                    value={form.phone}
                    onChange={(event) => updateField('phone', event.target.value)}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none transition-colors focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/10"
                    placeholder="(00) 00000-0000"
                  />
                </label>

                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Data de nascimento
                  <input
                    type="date"
                    value={form.birth_date}
                    onChange={(event) => updateField('birth_date', event.target.value)}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none transition-colors focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/10"
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Departamento
                  <select
                    value={form.department_id}
                    onChange={(event) => updateField('department_id', event.target.value)}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none transition-colors focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/10"
                    disabled={departmentsQuery.isLoading}
                  >
                    <option value="">Selecione</option>
                    {(departmentsQuery.data || []).map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Unidade
                  <select
                    value={form.unit_id}
                    onChange={(event) => updateField('unit_id', event.target.value)}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none transition-colors focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/10"
                    disabled={unitsQuery.isLoading}
                  >
                    <option value="">Selecione</option>
                    {(unitsQuery.data || []).map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.city || unit.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="mt-4 grid gap-1.5 text-sm font-semibold text-slate-700">
                Observacao da solicitacao
                <textarea
                  value={form.change_request_note}
                  onChange={(event) => updateField('change_request_note', event.target.value)}
                  className="min-h-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none transition-colors focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/10"
                  placeholder="Informe o motivo caso esteja solicitando troca de departamento ou unidade"
                />
              </label>

              {pendingRequest ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Existe uma solicitacao pendente para departamento/unidade. Ao salvar novamente, a solicitacao sera atualizada.
                </div>
              ) : null}

              <label className="mt-4 grid gap-1.5 text-sm font-semibold text-slate-700">
                E-mail de acesso
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField('email', event.target.value)}
                  disabled={!canEditEmail}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none transition-colors disabled:bg-slate-100 disabled:text-slate-500 focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/10"
                  placeholder="nome@empresa.com.br"
                />
                <span className="text-xs font-normal text-slate-500">
                  {canEditEmail
                    ? 'Seu email temporario pode ser substituido por um email definitivo.'
                    : 'Este email ja e definitivo. Alteracoes devem ser feitas pela administracao.'}
                </span>
              </label>
            </CollapsibleSection>

            <CollapsibleSection
              title="Google Agenda"
              description="Conecte sua conta Google para gerar links do Google Meet nos eventos que voce criar."
            >
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                {googleCalendarQuery.data?.connected ? (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Google Agenda conectada</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {googleCalendarQuery.data.google_email || 'Conta Google autorizada'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => disconnectGoogleCalendarMutation.mutate()}
                      disabled={disconnectGoogleCalendarMutation.isPending}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {disconnectGoogleCalendarMutation.isPending ? 'Desconectando...' : 'Desconectar'}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Google Agenda nao conectada</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Necessario para criar links do Google Meet pela sua propria conta.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startGoogleCalendarMutation.mutate()}
                      disabled={startGoogleCalendarMutation.isPending}
                      className="inline-flex h-10 items-center justify-center rounded-xl bg-[#E30613] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#c90510] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {startGoogleCalendarMutation.isPending ? 'Conectando...' : 'Conectar Google Agenda'}
                    </button>
                  </div>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Perfil da intranet"
              description="Apresentacao e links pessoais visiveis internamente."
            >
              <div className="grid gap-5">
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Frase/status
                  <input
                    value={form.status_message}
                    onChange={(event) => updateField('status_message', event.target.value)}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none transition-colors focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/10"
                    placeholder="Ex.: Disponivel para ajudar"
                  />
                </label>

                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Bio
                  <textarea
                    value={form.bio}
                    onChange={(event) => updateField('bio', event.target.value)}
                    className="min-h-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none transition-colors focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/10"
                    placeholder="Uma breve apresentacao profissional"
                  />
                </label>

                <div className="grid gap-5 lg:grid-cols-2">
                  <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                    LinkedIn
                    <input
                      value={form.linkedin_url}
                      onChange={(event) => updateField('linkedin_url', event.target.value)}
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none transition-colors focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/10"
                      placeholder="https://linkedin.com/in/..."
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                    WhatsApp
                    <input
                      value={form.whatsapp_url}
                      onChange={(event) => updateField('whatsapp_url', event.target.value)}
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none transition-colors focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/10"
                      placeholder="https://wa.me/..."
                    />
                  </label>
                </div>

                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Localizacao interna
                  <input
                    value={form.office_location}
                    onChange={(event) => updateField('office_location', event.target.value)}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none transition-colors focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/10"
                    placeholder="Ex.: Sala TI, 2o andar"
                  />
                </label>

                <div className="grid gap-5 lg:grid-cols-2">
                  <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                    Habilidades
                    <input
                      value={form.skills}
                      onChange={(event) => updateField('skills', event.target.value)}
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none transition-colors focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/10"
                      placeholder="Separadas por virgula"
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                    Interesses
                    <input
                      value={form.interests}
                      onChange={(event) => updateField('interests', event.target.value)}
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none transition-colors focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/10"
                      placeholder="Separados por virgula"
                    />
                  </label>
                </div>
              </div>
            </CollapsibleSection>
          </div>
        </form>
      </div>

      <FeedbackToast feedback={feedback} onClose={() => setFeedback(null)} />
      <AvatarCropModal
        cropImage={avatarCropImage}
        crop={avatarCrop}
        onCropChange={setAvatarCrop}
        onCancel={handleCancelAvatarCrop}
        onConfirm={handleConfirmAvatarCrop}
        isProcessing={isUploadingAvatar}
      />
      <SignaturePadModal
        open={isSignaturePadOpen}
        onCancel={handleCancelSignaturePad}
        onConfirm={handleConfirmSignature}
        isProcessing={isUploadingSignature}
      />
    </div>
  );
}

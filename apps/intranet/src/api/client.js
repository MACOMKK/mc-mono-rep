import { intranetApi } from '@macom/api-client/intranetApi';
import {
  removerArquivoAssinatura as sharedRemoverArquivoAssinatura,
  uploadAssinatura as sharedUploadAssinatura,
} from '@macom/api-client/signatureStorage';

import { assertSupabaseConfigured, checkLoginLock, reportFailedLogin, reportLoginSuccess, supabase } from '@/api/supabaseClient';

const DOCUMENT_STORAGE_BUCKET = 'documentos';
const ANNOUNCEMENT_IMAGE_STORAGE_BUCKET = 'avisos';
const AVATAR_STORAGE_BUCKET = 'avatares';
const ALLOWED_ANNOUNCEMENT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_AVATAR_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_ANNOUNCEMENT_IMAGE_FILE_SIZE = 2 * 1024 * 1024;
const MAX_DOCUMENT_FILE_SIZE = 5 * 1024 * 1024;
const MAX_AVATAR_FILE_SIZE = 2 * 1024 * 1024;

function normalizeFunctionError(error, fallbackMessage) {
  if (!error) {
    return new Error(fallbackMessage);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(error.message || fallbackMessage);
}

function isMissingSessionError(error) {
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  return message.includes('auth session missing');
}

function sanitizeStorageFolder(value, fallback = 'outros') {
  return String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || fallback;
}

async function uploadToBucket(file, bucket, maxFileSize, folder = '') {
  assertSupabaseConfigured();

  if (Number.isFinite(file?.size) && file.size > maxFileSize) {
    throw new Error(`O arquivo deve ter no maximo ${Math.floor(maxFileSize / (1024 * 1024))} MB.`);
  }

  const fileExt = file.name.split('.').pop();
  const normalizedFolder = String(folder || '').replace(/^\/+|\/+$/g, '');
  const fileName = `${Date.now()}-${crypto.randomUUID()}.${fileExt}`;
  const filePath = normalizedFolder ? `${normalizedFolder}/${fileName}` : fileName;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, { upsert: false });

  if (uploadError) {
    throw normalizeFunctionError(uploadError, 'Falha ao enviar arquivo.');
  }

  return {
    publicUrl: '',
    filePath,
  };
}

async function uploadFile(file, options = {}) {
  const company = sanitizeStorageFolder(options.company, 'macom_motors');
  const category = sanitizeStorageFolder(options.category, 'outros');
  const { publicUrl, filePath } = await uploadToBucket(
    file,
    DOCUMENT_STORAGE_BUCKET,
    MAX_DOCUMENT_FILE_SIZE,
    `${company}/${category}`,
  );
  return {
    file_url: publicUrl,
    file_path: filePath,
    file_name: file.name,
    file_type: file.type || null,
    file_size: Number.isFinite(file.size) ? file.size : null,
  };
}

async function uploadAnnouncementImage(file) {
  if (file?.type && !ALLOWED_ANNOUNCEMENT_IMAGE_TYPES.has(file.type)) {
    throw new Error('Formato de imagem não suportado. Use JPG, PNG ou WebP.');
  }

  const { publicUrl, filePath } = await uploadToBucket(
    file,
    ANNOUNCEMENT_IMAGE_STORAGE_BUCKET,
    MAX_ANNOUNCEMENT_IMAGE_FILE_SIZE,
  );
  return {
    image_url: publicUrl,
    image_path: filePath,
    image_name: file.name,
    image_type: file.type || null,
    image_size: Number.isFinite(file.size) ? file.size : null,
  };
}

async function uploadBirthdayTemplateImage(file) {
  if (file?.type && !ALLOWED_ANNOUNCEMENT_IMAGE_TYPES.has(file.type)) {
    throw new Error('Formato de imagem não suportado. Use JPG, PNG ou WebP.');
  }

  const { publicUrl, filePath } = await uploadToBucket(
    file,
    ANNOUNCEMENT_IMAGE_STORAGE_BUCKET,
    MAX_ANNOUNCEMENT_IMAGE_FILE_SIZE,
    'aniversario',
  );
  return {
    imagem_url: publicUrl,
    imagem_path: filePath,
    imagem_nome: file.name,
    imagem_tipo: file.type || null,
    imagem_tamanho: Number.isFinite(file.size) ? file.size : null,
  };
}

async function uploadAvatar(file, collaboratorId) {
  assertSupabaseConfigured();

  if (!collaboratorId) {
    throw new Error('Colaborador nao encontrado para enviar foto.');
  }

  if (file?.type && !ALLOWED_AVATAR_IMAGE_TYPES.has(file.type)) {
    throw new Error('Formato de imagem nao suportado. Use JPG, PNG ou WebP.');
  }

  if (Number.isFinite(file?.size) && file.size > MAX_AVATAR_FILE_SIZE) {
    throw new Error('A foto deve ter no maximo 2 MB.');
  }

  const fileExt = file.name.split('.').pop() || 'jpg';
  const filePath = `colaboradores/${collaboratorId}/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_STORAGE_BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    });

  if (uploadError) {
    throw normalizeFunctionError(uploadError, 'Falha ao enviar foto.');
  }

  const { data } = supabase.storage
    .from(AVATAR_STORAGE_BUCKET)
    .getPublicUrl(filePath);

  return {
    photo_url: data?.publicUrl || '',
    photo_path: filePath,
  };
}

async function deleteAvatar(filePath) {
  assertSupabaseConfigured();
  const normalizedPath = String(filePath || '').trim();
  if (!normalizedPath) return true;

  const { error } = await supabase.storage
    .from(AVATAR_STORAGE_BUCKET)
    .remove([normalizedPath]);

  if (error) {
    throw normalizeFunctionError(error, 'Falha ao remover foto enviada.');
  }

  return true;
}

// Upload/remocao em si sao genericos e vivem em @macom/api-client/signatureStorage (usados
// tambem pelo servicos) -- aqui so adapta pro formato snake_case que o resto deste arquivo/o
// Profile.jsx ja espera.
async function uploadSignature(file, collaboratorId) {
  const result = await sharedUploadAssinatura(file, collaboratorId);
  return { signature_url: result.signatureUrl, signature_path: result.signaturePath };
}

async function deleteSignature(filePath) {
  return sharedRemoverArquivoAssinatura(filePath);
}

function buildEntityApi(entityName) {
  return {
    list(orderBy, limit) {
      return intranetApi.entities[entityName].list(orderBy, limit);
    },

    filter(filters, orderBy, limit) {
      return intranetApi.entities[entityName].filter(filters, orderBy, limit);
    },

    create(payload) {
      return intranetApi.entities[entityName].create(payload);
    },

    update(id, payload) {
      return intranetApi.entities[entityName].update(id, payload);
    },

    async delete(id) {
      return intranetApi.entities[entityName].delete(id);
    },
  };
}

export const appClient = {
  auth: {
    me() {
      return intranetApi.auth.me();
    },

    trustedIpAccess() {
      return intranetApi.auth.trustedIpAccess();
    },

    async signIn({ email, password, captchaToken }) {
      assertSupabaseConfigured();
      const lock = await checkLoginLock(email, 'intranet');
      if (lock.locked) throw new Error(lock.message);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: captchaToken ? { captchaToken } : undefined,
      });
      if (error) {
        reportFailedLogin(email, 'intranet');
        throw normalizeFunctionError(error, 'Falha ao entrar.');
      }
      reportLoginSuccess('intranet');
      return intranetApi.auth.me(data?.session?.access_token);
    },

    async updatePassword(password) {
      assertSupabaseConfigured();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw normalizeFunctionError(error, 'Falha ao atualizar senha.');
      await intranetApi.auth.clearPasswordChangeRequired();
      return true;
    },

    async getSession() {
      assertSupabaseConfigured();
      const { data, error } = await supabase.auth.getSession();
      if (error) throw normalizeFunctionError(error, 'Falha ao obter sessão.');
      return data?.session ?? null;
    },

    async logout(redirectTo) {
      assertSupabaseConfigured();
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error && !isMissingSessionError(error)) {
        throw normalizeFunctionError(error, 'Falha ao encerrar sessão.');
      }
      if (redirectTo) {
        window.location.assign(redirectTo);
      }
    },

    async clearSession() {
      assertSupabaseConfigured();
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error && !isMissingSessionError(error)) {
        throw normalizeFunctionError(error, 'Falha ao limpar sessão.');
      }
    },

    redirectToLogin(redirectTo) {
      const params = new URLSearchParams();
      if (redirectTo) {
        params.set('redirectTo', redirectTo);
      }
      window.location.assign(`/login${params.toString() ? `?${params.toString()}` : ''}`);
    },

    onAuthStateChange(callback) {
      assertSupabaseConfigured();
      return supabase.auth.onAuthStateChange(callback);
    },
  },

  storage: {
    uploadFile,
    uploadAnnouncementImage,
    uploadBirthdayTemplateImage,
    uploadAvatar,
    deleteAvatar,
    uploadSignature,
    deleteSignature,
  },

  catalogs: {
    listDepartments() {
      return intranetApi.catalogs.listDepartments();
    },

    listUnits() {
      return intranetApi.catalogs.listUnits();
    },

    listPositions() {
      return intranetApi.catalogs.listPositions();
    },

    listCompanies() {
      return intranetApi.catalogs.listCompanies();
    },
  },

  googleCalendar: {
    status() {
      return intranetApi.googleCalendar.status();
    },

    start(redirectTo) {
      return intranetApi.googleCalendar.start(redirectTo);
    },

    disconnect() {
      return intranetApi.googleCalendar.disconnect();
    },
  },

  notifications: {
    list(limit) {
      return intranetApi.notifications.list(limit);
    },

    markRead(id) {
      return intranetApi.notifications.markRead(id);
    },

    markAllRead() {
      return intranetApi.notifications.markAllRead();
    },
  },

  accessLogs: {
    list(options) {
      return intranetApi.accessLogs.list(options);
    },
  },

  employeeNotifications: {
    list(options) {
      return intranetApi.employeeNotifications.list(options);
    },
  },

  possessionTerms: {
    list() {
      return intranetApi.possessionTerms.list();
    },

    sign(options) {
      return intranetApi.possessionTerms.sign(options);
    },
  },

  birthdayTemplate: {
    get() {
      return intranetApi.birthdayTemplate.get();
    },

    save(payload) {
      return intranetApi.birthdayTemplate.save(payload);
    },
  },

  entities: new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        return buildEntityApi(prop);
      },
    }
  ),
};


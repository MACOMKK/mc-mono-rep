import { assertSupabaseConfigured, supabase } from './supabaseClient';

function toError(message, status = 500, code, details, hint) {
  const normalizedMessage =
    typeof message === 'string'
      ? message
      : message?.message || 'Falha ao consultar a intranet.';

  const error = new Error(normalizedMessage);
  error.status = status;
  if (code) {
    error.code = code;
  }
  if (details) {
    error.details = details;
  }
  if (hint) {
    error.hint = hint;
  }
  return error;
}

function readTrustedIpAccessEnabled() {
  try {
    return window.sessionStorage.getItem('intranet:trusted-ip-access') === 'true';
  } catch {
    return false;
  }
}

async function invokeIntranet(body = {}, accessTokenOverride, options = {}) {
  assertSupabaseConfigured();

  const { data } = accessTokenOverride
    ? { data: { session: { access_token: accessTokenOverride } } }
    : await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const allowAnonymous = options.allowAnonymous || readTrustedIpAccessEnabled();

  if (!token && !allowAnonymous) {
    throw toError('Sessao expirada. Faca login novamente.', 401, 'auth_required');
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/intranet-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const payloadError = result?.error;
    throw toError(
      payloadError,
      response.status,
      payloadError?.code || result?.code,
      payloadError?.details,
      payloadError?.hint,
    );
  }

  return result;
}

function buildEntity(entity) {
  return {
    async list(orderBy, limit) {
      const result = await invokeIntranet({
        resource: 'entity',
        action: 'list',
        entity,
        orderBy,
        limit,
      });
      return result.rows || result.data || [];
    },
    async filter(filters, orderBy, limit) {
      const result = await invokeIntranet({
        resource: 'entity',
        action: 'filter',
        entity,
        filters,
        orderBy,
        limit,
      });
      return result.rows || result.data || [];
    },
    async create(payload) {
      const result = await invokeIntranet({
        resource: 'entity',
        action: 'create',
        entity,
        payload,
      });
      return result.row || result.data || null;
    },
    async update(id, payload) {
      const result = await invokeIntranet({
        resource: 'entity',
        action: 'update',
        entity,
        id,
        payload,
      });
      return result.row || result.data || null;
    },
    async delete(id) {
      const result = await invokeIntranet({
        resource: 'entity',
        action: 'delete',
        entity,
        id,
      });
      const payload = result.data || result;
      return payload?.success ? { id } : payload;
    },
  };
}

export const intranetApi = {
  auth: {
    async me(accessToken) {
      const result = await invokeIntranet({
        resource: 'auth',
        action: 'me',
      }, accessToken);
      return result.user || result.data || null;
    },

    async trustedIpAccess() {
      const result = await invokeIntranet({
        resource: 'auth',
        action: 'trustedIpAccess',
      }, undefined, { allowAnonymous: true });
      return result.user || result.data || null;
    },

    async clearPasswordChangeRequired() {
      await invokeIntranet({
        resource: 'auth',
        action: 'clear_password_change_required',
      });
      return true;
    },
  },
  catalogs: {
    async listDepartments() {
      const result = await invokeIntranet({
        action: 'catalog',
        catalog: 'departments',
      });
      return result.rows || result.data || [];
    },
    async listUnits() {
      const result = await invokeIntranet({
        action: 'catalog',
        catalog: 'units',
      });
      return result.rows || result.data || [];
    },
    async listPositions() {
      const result = await invokeIntranet({
        action: 'catalog',
        catalog: 'positions',
      });
      return result.rows || result.data || [];
    },
    async listCompanies() {
      const result = await invokeIntranet({
        action: 'catalog',
        catalog: 'companies',
      });
      return result.rows || result.data || [];
    },
  },
  googleCalendar: {
    async status() {
      const result = await invokeIntranet({
        resource: 'googleCalendar',
        action: 'status',
      });
      return result.data || result;
    },
    async start(redirectTo = '/perfil') {
      const redirectUrl = redirectTo?.startsWith('http')
        ? redirectTo
        : `${window.location.origin}${redirectTo || '/perfil'}`;
      const result = await invokeIntranet({
        resource: 'googleCalendar',
        action: 'start',
        payload: { redirect_to: redirectUrl },
      });
      return result.data || result;
    },
    async disconnect() {
      const result = await invokeIntranet({
        resource: 'googleCalendar',
        action: 'disconnect',
      });
      return result.data || result;
    },
  },
  accessLogs: {
    async list({ limit = 25, offset = 0 } = {}) {
      const result = await invokeIntranet({
        resource: 'accessLogs',
        action: 'list',
        limit,
        offset,
      });
      return {
        rows: result.rows || [],
        total: result.total ?? (result.rows || []).length,
        limit: result.limit ?? limit,
        offset: result.offset ?? offset,
      };
    },
  },
  employeeNotifications: {
    async list({ email, limit = 20, offset = 0 } = {}) {
      const result = await invokeIntranet({
        resource: 'employeeNotifications',
        action: 'list',
        email,
        limit,
        offset,
      });
      return {
        rows: result.rows || [],
        total: result.total ?? (result.rows || []).length,
        limit: result.limit ?? limit,
        offset: result.offset ?? offset,
      };
    },
  },
  birthdayTemplate: {
    async get() {
      const result = await invokeIntranet({ resource: 'birthdayTemplate', action: 'get' });
      return result.data || null;
    },
    async save(payload) {
      const result = await invokeIntranet({ resource: 'birthdayTemplate', action: 'save', payload });
      return result.data || null;
    },
  },
  possessionTerms: {
    async list() {
      const result = await invokeIntranet({ resource: 'possessionTerms', action: 'list' });
      return result.rows || [];
    },
    async sign({ termoId, pdfBase64 }) {
      const result = await invokeIntranet({
        resource: 'possessionTerms',
        action: 'sign',
        termo_id: termoId,
        pdf_base64: pdfBase64,
      });
      return result.row || null;
    },
  },
  entities: new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        return buildEntity(prop);
      },
    },
  ),
};

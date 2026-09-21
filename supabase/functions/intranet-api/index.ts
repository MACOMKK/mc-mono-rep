import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { updateColaboradorSignature } from '../_shared/signature.ts';

const databaseUrl = Deno.env.get('DATABASE_URL');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const sql = databaseUrl
  ? postgres(databaseUrl, {
      prepare: false,
      max: 6,
      idle_timeout: 5,
      connect_timeout: 15,
      max_lifetime: 1800,
      connection: {
        statement_timeout: 15000,
      },
    })
  : null;

const INTRANET_SCHEMA = 'gestao_intranet';
const INTRANET_SYSTEM_SLUG = 'intranet';
const ANNOUNCEMENT_IMAGES_STORAGE_BUCKET = 'avisos';
const DOCUMENTS_STORAGE_BUCKET = 'documentos';
const AVATARS_STORAGE_BUCKET = 'avatares';
const ANNOUNCEMENT_IMAGE_SIGNED_URL_TTL_SECONDS = 10 * 60;
const DOCUMENT_SIGNED_URL_TTL_SECONDS = 10 * 60;
const MAX_ANNOUNCEMENT_IMAGE_FILE_SIZE = 2 * 1024 * 1024;
const MAX_DOCUMENT_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_ANNOUNCEMENT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const GOOGLE_OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';
const TRUSTED_IP_USER_ID = '00000000-0000-0000-0000-000000000000';

const ENTITY_CONFIG = {
  Announcement: {
    schema: INTRANET_SCHEMA,
    table: 'avisos',
    defaultOrder: '-created_date',
    orderMap: {
      created_date: 'criado_em',
      updated_date: 'atualizado_em',
      title: 'titulo',
      category: 'categoria',
      priority: 'prioridade',
      pinned: 'fixado',
      publish_date: 'publica_em',
      expiration_date: 'expira_em',
    },
    filterMap: {
      id: 'id',
      category: 'categoria',
      priority: 'prioridade',
      pinned: 'fixado',
      publish_date: 'publica_em',
      expiration_date: 'expira_em',
    },
    createFields: [
      'title',
      'content',
      'category',
      'priority',
      'pinned',
      'publish_date',
      'expiration_date',
      'image_url',
      'image_path',
      'image_name',
      'image_type',
      'image_size',
      'document_ids',
      'links',
    ],
    updateFields: [
      'title',
      'content',
      'category',
      'priority',
      'pinned',
      'publish_date',
      'expiration_date',
      'image_url',
      'image_path',
      'image_name',
      'image_type',
      'image_size',
      'document_ids',
      'links',
    ],
  },
  AnnouncementComment: {
    schema: INTRANET_SCHEMA,
    table: 'comentarios_avisos',
    defaultOrder: 'created_date',
    orderMap: {
      created_date: 'criado_em',
      updated_date: 'atualizado_em',
    },
    filterMap: {
      id: 'id',
      announcement_id: 'aviso_id',
    },
    createFields: ['announcement_id', 'content'],
  },
  AnnouncementReaction: {
    schema: INTRANET_SCHEMA,
    table: 'reacoes_avisos',
    defaultOrder: 'created_date',
    orderMap: {
      created_date: 'criado_em',
      updated_date: 'atualizado_em',
    },
    filterMap: {
      id: 'id',
      announcement_id: 'aviso_id',
      emoji: 'emoji',
    },
    createFields: ['announcement_id', 'emoji'],
  },
  CalendarEvent: {
    schema: INTRANET_SCHEMA,
    table: 'eventos_calendario',
    defaultOrder: 'date',
    orderMap: {
      date: 'data_evento',
      created_date: 'criado_em',
      updated_date: 'atualizado_em',
      type: 'tipo',
    },
    filterMap: {
      id: 'id',
      type: 'tipo',
      date: 'data_evento',
    },
    createFields: ['title', 'description', 'date', 'time', 'type', 'location', 'recurrence', 'recurrence_until', 'participants', 'participant_ids', 'add_google_meet', 'department', 'department_id', 'unit', 'unit_id', 'responsible_collaborator_id', 'responsible_id'],
    updateFields: ['title', 'description', 'date', 'time', 'type', 'location', 'recurrence', 'recurrence_until', 'recurrence_active', 'recurrence_cancelled_dates', 'participants', 'participant_ids', 'add_google_meet', 'department', 'department_id', 'unit', 'unit_id', 'responsible_collaborator_id', 'responsible_id'],
  },
  Document: {
    schema: INTRANET_SCHEMA,
    table: 'documentos',
    defaultOrder: '-created_date',
    orderMap: {
      created_date: 'criado_em',
      updated_date: 'atualizado_em',
      category: 'categoria',
      company: 'empresa_id',
    },
    filterMap: {
      id: 'id',
      category: 'categoria',
      company: 'empresa_id',
      department_id: 'departamento_id',
      position_id: 'cargo_id',
      visibility: 'visibilidade',
      minimum_access_level: 'nivel_minimo',
    },
    createFields: ['title', 'description', 'file_url', 'file_path', 'file_name', 'file_type', 'file_size', 'company', 'category', 'department', 'department_id', 'position_id', 'cargo_id', 'visibility', 'minimum_access_level'],
    updateFields: ['title', 'description', 'file_url', 'file_path', 'file_name', 'file_type', 'file_size', 'company', 'category', 'department', 'department_id', 'position_id', 'cargo_id', 'visibility', 'minimum_access_level'],
  },
  Feedback: {
    schema: INTRANET_SCHEMA,
    table: 'feedback',
    defaultOrder: '-created_date',
    orderMap: {
      created_date: 'criado_em',
      updated_date: 'atualizado_em',
      type: 'tipo',
      category: 'categoria',
      status: 'status',
    },
    filterMap: {
      id: 'id',
      type: 'tipo',
      category: 'categoria',
      status: 'status',
    },
    createFields: ['type', 'category', 'title', 'content', 'anonymous', 'status', 'admin_response'],
    updateFields: ['type', 'category', 'title', 'content', 'anonymous', 'status', 'admin_response'],
  },
  KnowledgeBase: {
    schema: INTRANET_SCHEMA,
    table: 'base_conhecimento',
    defaultOrder: '-created_date',
    orderMap: {
      created_date: 'criado_em',
      updated_date: 'atualizado_em',
      category: 'categoria',
      type: 'tipo',
      pinned: 'fixado',
    },
    filterMap: {
      id: 'id',
      category: 'categoria',
      type: 'tipo',
      pinned: 'fixado',
    },
    createFields: ['title', 'content', 'category', 'type', 'tags', 'pinned', 'helpful_count'],
    updateFields: ['title', 'content', 'category', 'type', 'tags', 'pinned', 'helpful_count'],
  },
  QuickLink: {
    schema: INTRANET_SCHEMA,
    table: 'links_uteis',
    defaultOrder: 'order',
    orderMap: {
      order: 'ordem',
      created_date: 'criado_em',
      updated_date: 'atualizado_em',
      category: 'categoria',
    },
    filterMap: {
      id: 'id',
      category: 'categoria',
    },
    createFields: ['name', 'url', 'description', 'icon', 'category', 'order', 'show_on_dashboard'],
    updateFields: ['name', 'url', 'description', 'icon', 'category', 'order', 'show_on_dashboard'],
  },
  UserPermission: {
    schema: INTRANET_SCHEMA,
    table: 'permissoes_usuario',
    defaultOrder: 'created_date',
    orderMap: {
      created_date: 'criado_em',
      updated_date: 'atualizado_em',
    },
    filterMap: {
      id: 'id',
      collaborator_id: 'colaborador_id',
    },
    createFields: ['collaborator_id', 'user_email', 'modules'],
    updateFields: ['modules'],
  },
  TrustedIpAccess: {
    schema: INTRANET_SCHEMA,
    table: 'acessos_ip_confiavel',
    defaultOrder: 'name',
    orderMap: {
      name: 'nome',
      created_date: 'criado_em',
      updated_date: 'atualizado_em',
      last_access_date: 'ultimo_acesso_em',
    },
    filterMap: {
      id: 'id',
      active: 'ativo',
    },
    createFields: ['name', 'description', 'ip_cidr', 'access_level', 'active', 'modules'],
    updateFields: ['name', 'description', 'ip_cidr', 'access_level', 'active', 'modules'],
  },
} as const;

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });
}

function normalizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'Erro interno.');
  return message || 'Erro interno.';
}

function getErrorCode(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return undefined;
}

function getErrorStatus(error: unknown) {
  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
    return error.status;
  }
  const message = normalizeError(error);

  if (
    message.includes('Nao autenticado') ||
    message.includes('Sessao expirada')
  ) {
    return 401;
  }

  if (
    message.includes('acesso') ||
    message.includes('administrador') ||
    message.includes('inativo')
  ) {
    return 403;
  }

  if (
    message.includes('obrigatorio') ||
    message.includes('Payload vazio') ||
    message.includes('Nenhum campo para atualizar') ||
    message.includes('Nao encontrado') ||
    message.includes('invalido')
  ) {
    return 400;
  }

  return 500;
}

function normalizeText(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function toKey(value: string | null | undefined) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const DEPARTMENT_ALIASES: Record<string, string[]> = {
  diretoria: ['diretoria'],
  rh: ['rh', 'recursos_humanos', 'recursos_humanos_rh'],
  ti: ['ti', 'tecnologia', 'tecnologia_da_informacao'],
  financeiro: ['financeiro'],
  vendas: ['vendas', 'comercial'],
  pos_vendas: ['pos_vendas', 'posvendas'],
  marketing: ['marketing'],
  administrativo: ['administrativo', 'administracao'],
};

const UNIT_ALIASES: Record<string, string[]> = {
  ananindeua: ['ananindeua'],
  belem: ['belem', 'belem_pa', 'mitsubishi_macom_belem'],
  paragominas: ['paragominas'],
};

function resolveAlias(aliases: Record<string, string[]>, input: string | null | undefined) {
  const normalized = toKey(input);
  return Object.entries(aliases).find(([, values]) => values.includes(normalized))?.[0] || normalized;
}

function departmentKeyFromRecord(record: Record<string, unknown>) {
  return resolveAlias(DEPARTMENT_ALIASES, String(record?.nome || record?.descricao || ''));
}

function unitKeyFromRecord(record: Record<string, unknown>) {
  return resolveAlias(UNIT_ALIASES, String(record?.cidade || record?.nome || ''));
}

function sanitizePayload(payload: Record<string, unknown> = {}, allowedFields: readonly string[] = []) {
  return allowedFields.reduce<Record<string, unknown>>((acc, field) => {
    if (field in payload) {
      acc[field] = payload[field];
    }
    return acc;
  }, {});
}

function parseTags(value: unknown) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value !== 'string') return [];
  return value.split(',').map((tag) => tag.trim()).filter(Boolean);
}

async function runSql<T = Record<string, unknown>>(query: string, values: unknown[] = []) {
  if (!sql) throw new Error('Conexao com banco indisponivel.');
  return (await withTimeout(sql.unsafe(query, values), 15000, 'Consulta ao banco de dados')) as T[];
}

async function resolveAuthenticatedCollaborators(authUser: { id: string; email?: string | null }) {
  const rows = await runSql<Record<string, unknown>>(
    `
      select *
      from public.colaboradores
      where id = $1
         or lower(trim(email)) = lower(trim($2))
      order by case when id = $1 then 0 else 1 end;
    `,
    [authUser.id, authUser.email || null],
  );

  const uniqueRows = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id : null;
    if (id && !uniqueRows.has(id)) {
      uniqueRows.set(id, row);
    }
  }

  return [...uniqueRows.values()];
}

async function getIntranetSystem() {
  const rows = await runSql<Record<string, unknown>>(
    `
      select id, nome, slug, ativo
      from public.sistemas
      where slug = $1
      limit 1;
    `,
    [INTRANET_SYSTEM_SLUG],
  );

  return rows[0] || null;
}

async function getAccessForCollaborator(collaboratorId: string, systemId: string) {
  const rows = await runSql<Record<string, unknown>>(
    `
      select *
      from public.acessos_usuario_sistema
      where colaborador_id = $1
        and sistema_id = $2
        and ativo = true
      order by atualizado_em desc nulls last, criado_em desc
      limit 1;
    `,
    [collaboratorId, systemId],
  );

  return rows[0] || null;
}

async function getPermissionRowForCollaborator(collaboratorId: string) {
  const rows = await runSql<Record<string, unknown>>(
    `
      select *
      from gestao_intranet.permissoes_usuario
      where colaborador_id = $1
      limit 1;
    `,
    [collaboratorId],
  );

  return rows[0] || null;
}

async function listDepartments() {
  const rows = await runSql<Record<string, unknown>>(
    `
      select id, nome, descricao
      from public.departamentos
      order by nome asc;
    `,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.nome,
    description: row.descricao,
    key: departmentKeyFromRecord(row),
  }));
}

async function listUnits() {
  const rows = await runSql<Record<string, unknown>>(
    `
      select id, nome, cidade, ativo
      from public.unidades
      where ativo = true
      order by nome asc;
    `,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.nome,
    city: row.cidade,
    key: unitKeyFromRecord(row),
  }));
}

async function listPositions() {
  const rows = await runSql<Record<string, unknown>>(
    `
      select c.id, c.nome, c.departamento_id, d.nome as departamento_nome
      from public.cargos c
      left join public.departamentos d on d.id = c.departamento_id
      order by c.nome asc;
    `,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.nome,
    department_id: row.departamento_id || null,
    department_name: row.departamento_nome || null,
  }));
}

async function resolveDepartment(input: unknown) {
  if (!input) return null;
  const departments = await listDepartments();
  const normalized = toKey(String(input));
  return (
    departments.find((item) => item.id === input) ||
    departments.find((item) => item.key === normalized) ||
    departments.find((item) => toKey(item.name) === normalized) ||
    null
  );
}

async function resolveUnit(input: unknown) {
  if (!input) return null;
  const units = await listUnits();
  const normalized = toKey(String(input));
  return (
    units.find((item) => item.id === input) ||
    units.find((item) => item.key === normalized) ||
    units.find((item) => toKey(item.name) === normalized) ||
    units.find((item) => toKey(item.city) === normalized) ||
    null
  );
}

async function resolvePosition(input: unknown) {
  if (!input) return null;
  const positions = await listPositions();
  const normalized = toKey(String(input));
  return (
    positions.find((item) => item.id === input) ||
    positions.find((item) => toKey(String(item.name || '')) === normalized) ||
    null
  );
}

async function listCompanies() {
  const rows = await runSql<Record<string, unknown>>(
    `
      select id, nome
      from public.empresas
      order by nome asc;
    `,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.nome,
  }));
}

async function resolveCompany(input: unknown) {
  if (!input) return null;
  const companies = await listCompanies();
  return companies.find((item) => item.id === input) || null;
}

async function fetchCollaboratorsByIds(ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return new Map<string, Record<string, unknown>>();

  const rows = await runSql<Record<string, unknown>>(
    `
      select
        c.id,
        c.nome,
        c.email,
        c.funcao,
        a.nivel_acesso as intranet_nivel_acesso
      from public.colaboradores c
      left join public.sistemas s on s.slug = $2
      left join public.acessos_usuario_sistema a
        on a.colaborador_id = c.id
       and a.sistema_id = s.id
       and a.ativo = true
      where c.id = any($1::uuid[]);
    `,
    [uniqueIds, INTRANET_SYSTEM_SLUG],
  );

  return new Map(rows.map((row) => [String(row.id), row]));
}

function normalizeFunctionRole(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function canReceiveModuleEditPermission(collaborator?: Record<string, unknown> | null) {
  const functionRole = normalizeFunctionRole(collaborator?.funcao);
  const accessRole = normalizeFunctionRole(collaborator?.intranet_nivel_acesso);
  return functionRole === 'admin' || functionRole === 'gestor' || accessRole === 'admin' || accessRole === 'gestor';
}

function restrictModulePermissionsForCollaborator(
  modules: Record<string, unknown>,
  collaborator?: Record<string, unknown> | null,
) {
  if (canReceiveModuleEditPermission(collaborator)) return modules;

  return Object.fromEntries(
    Object.entries({ ...defaultModulePermissions(), ...modules }).map(([key, value]) => [
      key,
      value === 'edit' ? 'view' : value,
    ]),
  );
}

function mapPermissionRow(row: Record<string, unknown>, collaboratorMap = new Map<string, Record<string, unknown>>()) {
  const collaborator = collaboratorMap.get(String(row.colaborador_id));
  const modules = restrictModulePermissionsForCollaborator(
    {
      avisos: row.mod_avisos || 'view',
      links: row.mod_links || 'view',
      colaboradores: row.mod_colaboradores || 'view',
      documentos: row.mod_documentos || 'view',
      calendario: row.mod_calendario || 'view',
      conhecimento: row.mod_conhecimento || 'view',
      feedback: row.mod_feedback || 'view',
    },
    collaborator,
  );

  return {
    id: row.id,
    collaborator_id: row.colaborador_id,
    user_email: collaborator?.email || null,
    full_name: collaborator?.nome || null,
    function_role: collaborator?.funcao || null,
    access_level: collaborator?.intranet_nivel_acesso || null,
    created_by_id: row.criado_por || null,
    created_date: row.criado_em,
    updated_date: row.atualizado_em,
    modules,
  };
}

function permissionLevel(user: Record<string, unknown>, moduleKey: string) {
  if (user.role === 'admin') return 'edit';
  const permissions = (user.permissions || {}) as Record<string, string>;
  return permissions[moduleKey] || 'none';
}

function canViewModule(user: Record<string, unknown>, moduleKey: string) {
  const level = permissionLevel(user, moduleKey);
  return level === 'view' || level === 'edit';
}

function canEditModule(user: Record<string, unknown>, moduleKey: string) {
  return permissionLevel(user, moduleKey) === 'edit';
}

function assertModuleView(user: Record<string, unknown>, moduleKey: string) {
  if (!canViewModule(user, moduleKey)) {
    const error = new Error('Seu usuario nao possui permissao para visualizar este modulo.');
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
}

function assertModuleEdit(user: Record<string, unknown>, moduleKey: string) {
  if (!canEditModule(user, moduleKey) && user.role !== 'admin') {
    const error = new Error('Seu usuario nao possui permissao para editar este modulo.');
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
}

function assertAdmin(user: Record<string, unknown>) {
  if (user.role !== 'admin') {
    const error = new Error('Apenas administradores podem executar esta operacao.');
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
}

function normalizeForwardedIp(value: string | null) {
  if (!value) return null;
  const first = value.split(',').map((item) => item.trim()).find(Boolean);
  if (!first) return null;
  if (first.startsWith('[') && first.includes(']')) {
    return first.slice(1, first.indexOf(']'));
  }
  const forwarded = first.match(/for="?([^";,\s]+)"?/i)?.[1] || first;
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(forwarded)) {
    return forwarded.slice(0, forwarded.lastIndexOf(':'));
  }
  return forwarded.replace(/^"|"$/g, '');
}

function getClientIp(request: Request) {
  // So confiamos no cf-connecting-ip: e o unico header dessa lista que o Cloudflare
  // sobrescreve na borda, entao o cliente nao consegue forjar. x-real-ip/x-forwarded-for/
  // forwarded sao headers HTTP comuns que qualquer requisicao pode setar manualmente --
  // usa-los aqui permitiria logar como acesso confiavel da rede do escritorio sem
  // credencial nenhuma, so mandando o header certo.
  return normalizeForwardedIp(request.headers.get('cf-connecting-ip'));
}

function assertAnnouncementOwnerOrAdmin(
  user: Record<string, unknown>,
  collaboratorId: string | null,
  announcement: Record<string, unknown> | null | undefined,
) {
  if (user.role === 'admin') return;

  if (!announcement) {
    const error = new Error('Aviso nao encontrado.');
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  if (!collaboratorId || String(announcement.criado_por || '') !== collaboratorId) {
    const error = new Error('Apenas o criador do aviso ou um administrador pode alterar este aviso.');
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
}

function assertCalendarEventOwnerOrAdmin(
  user: Record<string, unknown>,
  collaboratorId: string | null,
  event: Record<string, unknown> | null | undefined,
) {
  if (user.role === 'admin') return;

  if (!event) {
    const error = new Error('Evento nao encontrado.');
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  if (!collaboratorId || String(event.criado_por || '') !== collaboratorId) {
    const error = new Error('Apenas o criador do evento ou um administrador pode alterar este evento.');
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
}

function validateDocumentFileSize(fileSize: unknown) {
  if (fileSize === null || fileSize === undefined || fileSize === '') return;

  const numericSize = Number(fileSize);
  if (!Number.isFinite(numericSize) || numericSize < 0) {
    throw new Error('Tamanho de arquivo invalido.');
  }

  if (numericSize > MAX_DOCUMENT_FILE_SIZE) {
    throw new Error('O arquivo deve ter no maximo 5 MB.');
  }
}

function createAccessError(message: string, code: string, status = 403) {
  const error = new Error(message);
  (error as Error & { code?: string; status?: number }).code = code;
  (error as Error & { code?: string; status?: number }).status = status;
  return error;
}

async function buildCurrentUser(authUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) {
  const collaborators = await resolveAuthenticatedCollaborators(authUser);
  const collaborator = collaborators.find((row) => row.id === authUser.id) || collaborators[0] || null;

  if (!collaborator) {
    throw createAccessError(
      'Seu usuario autenticado nao esta vinculado a um colaborador da intranet.',
      'INTRANET_COLLABORATOR_NOT_FOUND',
    );
  }

  if (collaborator.status !== 'ativo') {
    throw createAccessError(
      'Seu cadastro de colaborador esta inativo e o acesso a intranet foi bloqueado.',
      'INTRANET_COLLABORATOR_INACTIVE',
    );
  }

  const intranetSystem = await getIntranetSystem();
  const access = intranetSystem?.id ? await getAccessForCollaborator(String(collaborator.id), String(intranetSystem.id)) : null;

  if (!access) {
    throw createAccessError(
      'Seu colaborador esta ativo, mas nao possui acesso liberado para a intranet.',
      'INTRANET_SYSTEM_ACCESS_NOT_GRANTED',
    );
  }

  const permissionRow = await getPermissionRowForCollaborator(String(collaborator.id));
  const collaboratorMap = new Map([[String(collaborator.id), collaborator]]);
  const permission = permissionRow ? mapPermissionRow(permissionRow, collaboratorMap).modules : defaultModulePermissions();

  return {
    id: authUser.id,
    collaborator_id: collaborator.id,
    email: collaborator.email || authUser.email || null,
    full_name: collaborator.nome || String(authUser.user_metadata?.full_name || authUser.email || 'Usuario'),
    role: access?.nivel_acesso === 'admin' ? 'admin' : access?.nivel_acesso || collaborator.funcao || 'user',
    access_level: access?.nivel_acesso || null,
    department_id: collaborator.departamento_id || null,
    position_id: collaborator.cargo_id || null,
    position: collaborator.cargo || null,
    function_role: collaborator.funcao || null,
    status: collaborator.status || null,
    must_change_password: Boolean(collaborator.precisa_trocar_senha),
    permissions: permission,
    backend_status: 'ok',
    backend_reason: null,
  };
}

function mapTrustedIpAccessRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.nome,
    description: row.descricao || null,
    ip_cidr: row.ip_cidr,
    access_level: row.nivel_acesso || 'usuario',
    active: Boolean(row.ativo),
    last_ip: row.ultimo_ip || null,
    last_access_date: row.ultimo_acesso_em || null,
    created_date: row.criado_em,
    updated_date: row.atualizado_em,
    modules: {
      avisos: row.mod_avisos || 'view',
      links: row.mod_links || 'view',
      colaboradores: row.mod_colaboradores || 'view',
      documentos: row.mod_documentos || 'view',
      calendario: row.mod_calendario || 'view',
      conhecimento: row.mod_conhecimento || 'view',
      feedback: row.mod_feedback || 'view',
    },
  };
}

function defaultModulePermissions() {
  return {
    avisos: 'view',
    links: 'view',
    colaboradores: 'view',
    documentos: 'view',
    calendario: 'view',
    conhecimento: 'view',
    feedback: 'view',
  };
}

async function getContext(authUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) {
  const user = await buildCurrentUser(authUser);
  return {
    user,
    collaboratorId: typeof user.collaborator_id === 'string' ? user.collaborator_id : null,
    isAdmin: user.role === 'admin',
  };
}

async function registrarAcessoIntranet(collaboratorId: string | null, request: Request) {
  if (!sql || !collaboratorId) return;
  try {
    await runSql(
      `
        with lock as (
          -- Serializes concurrent 'me' calls for the same colaborador (e.g. multiple
          -- tabs/requests firing at once) so the NOT EXISTS check below can't race:
          -- without this, two calls could both see "no recent log" and both insert.
          --
          -- $1 is cast to uuid on every occurrence (including here, via ::uuid before
          -- ::text) so Postgres infers a single consistent parameter type. Casting only
          -- this occurrence to ::text (as before) made the whole parameter infer as
          -- text, which then failed on "la.colaborador_id = $1" (uuid = text) below —
          -- silently swallowed by the caller's try/catch, so no access log ever wrote.
          select pg_advisory_xact_lock(hashtextextended($1::uuid::text, 0))
        )
        insert into gestao_plataforma.logs_acesso (colaborador_id, sistema_id, evento, ip_address, user_agent)
        select $1::uuid, s.id, 'login', $2::inet, $3::text
        from public.sistemas s, lock
        where s.slug = $4::text
          and not exists (
            select 1
            from gestao_plataforma.logs_acesso la
            where la.colaborador_id = $1::uuid
              and la.sistema_id = s.id
              and la.criado_em > now() - interval '30 minutes'
          );
      `,
      [collaboratorId, getClientIp(request) || null, request.headers.get('user-agent') || null, INTRANET_SYSTEM_SLUG],
    );
  } catch (error) {
    console.error('Falha ao registrar log de acesso da intranet', error);
  }
}

async function listEmployeeNotifications(email: string, limit: number, offset: number) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const totalRows = await runSql<{ total: number }>(
    `
      select count(*)::int as total
      from notificacoes.fila_emails
      where destinatario = $1;
    `,
    [email],
  );

  const rows = await runSql(
    `
      select id, tipo, assunto, status, tentativas, erro, enviado_em, criado_em
      from notificacoes.fila_emails
      where destinatario = $1
      order by criado_em desc
      limit $2 offset $3;
    `,
    [email, safeLimit, safeOffset],
  );

  return {
    rows,
    total: totalRows[0]?.total ?? rows.length,
    limit: safeLimit,
    offset: safeOffset,
  };
}

async function listAccessLogsIntranet(limit: number, offset: number) {
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const totalRows = await runSql<{ total: number }>(
    `
      select count(*)::int as total
      from gestao_plataforma.logs_acesso l
      join public.sistemas s on s.id = l.sistema_id
      where s.slug = $1;
    `,
    [INTRANET_SYSTEM_SLUG],
  );

  const rows = await runSql(
    `
      select
        l.id,
        l.evento,
        l.ip_address,
        l.user_agent,
        l.criado_em,
        c.nome as colaborador_nome,
        c.email as colaborador_email
      from gestao_plataforma.logs_acesso l
      join public.sistemas s on s.id = l.sistema_id
      left join public.colaboradores c on c.id = l.colaborador_id
      where s.slug = $1
      order by l.criado_em desc
      limit $2 offset $3;
    `,
    [INTRANET_SYSTEM_SLUG, safeLimit, safeOffset],
  );

  return {
    rows,
    total: totalRows[0]?.total ?? rows.length,
    limit: safeLimit,
    offset: safeOffset,
  };
}

function convertOrder(entityName: keyof typeof ENTITY_CONFIG, orderBy?: string) {
  const config = ENTITY_CONFIG[entityName];
  const normalizedOrder = orderBy || config.defaultOrder;
  const ascending = !normalizedOrder.startsWith('-');
  const key = ascending ? normalizedOrder : normalizedOrder.slice(1);
  const column = config.orderMap[key as keyof typeof config.orderMap];

  if (column) {
    return { column, ascending };
  }

  const defaultAscending = !config.defaultOrder.startsWith('-');
  const defaultKey = defaultAscending ? config.defaultOrder : config.defaultOrder.slice(1);
  return {
    column: config.orderMap[defaultKey as keyof typeof config.orderMap],
    ascending: defaultAscending,
  };
}

function buildWhereClause(entityName: keyof typeof ENTITY_CONFIG, filters: Record<string, unknown> = {}, startIndex = 1) {
  const config = ENTITY_CONFIG[entityName];
  const clauses: string[] = [];
  const values: unknown[] = [];

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const column = config.filterMap[key as keyof typeof config.filterMap];
    if (!column) return;
    clauses.push(`"${column}" = $${startIndex + values.length}`);
    values.push(value);
  });

  return { clauses, values };
}

function mapAnnouncement(
  row: Record<string, unknown>,
  creatorMap = new Map<string, Record<string, unknown>>(),
  documentsByAnnouncement = new Map<string, Record<string, unknown>[]>(),
  linksByAnnouncement = new Map<string, Record<string, unknown>[]>(),
) {
  const creator = creatorMap.get(String(row.criado_por));
  const status = getAnnouncementStatus(row);
  const documents = documentsByAnnouncement.get(String(row.id)) || [];
  const links = linksByAnnouncement.get(String(row.id)) || [];
  return {
    id: row.id,
    title: row.titulo,
    content: row.conteudo,
    category: row.categoria,
    priority: row.prioridade,
    pinned: row.fixado,
    publish_date: row.publica_em,
    expiration_date: row.expira_em,
    status,
    image_url: row.imagem_url || null,
    image_path: row.imagem_path || null,
    image_name: row.imagem_nome || null,
    image_type: row.imagem_tipo || null,
    image_size: row.imagem_tamanho || null,
    document_ids: documents.map((document) => document.id),
    documents,
    links,
    created_date: row.criado_em,
    updated_date: row.atualizado_em,
    created_by: creator?.email || creator?.nome || null,
    created_by_id: row.criado_por || null,
  };
}

async function createAnnouncementImageSignedUrl(announcement: Record<string, unknown>) {
  const storageClient = createStorageAdminClient();
  const imagePath = typeof announcement.imagem_path === 'string' ? announcement.imagem_path.trim() : '';
  if (!storageClient || !imagePath) {
    return typeof announcement.imagem_url === 'string' ? announcement.imagem_url : null;
  }

  const bucket = resolveAnnouncementStorageBucket(announcement);
  const { data, error } = await storageClient.storage
    .from(bucket)
    .createSignedUrl(imagePath, ANNOUNCEMENT_IMAGE_SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error('Failed to create signed announcement image URL:', {
      bucket,
      imagePath,
      message: error.message,
    });
    return typeof announcement.imagem_url === 'string' ? announcement.imagem_url : null;
  }

  return data?.signedUrl || null;
}

async function mapAnnouncementWithSignedUrl(
  row: Record<string, unknown>,
  creatorMap = new Map<string, Record<string, unknown>>(),
  documentsByAnnouncement = new Map<string, Record<string, unknown>[]>(),
  linksByAnnouncement = new Map<string, Record<string, unknown>[]>(),
) {
  const signedImageUrl = await createAnnouncementImageSignedUrl(row);
  return {
    ...mapAnnouncement(row, creatorMap, documentsByAnnouncement, linksByAnnouncement),
    image_url: signedImageUrl,
  };
}

async function fetchAnnouncementLinks(announcementIds: string[]) {
  const ids = normalizeIdArray(announcementIds);
  if (ids.length === 0) return new Map<string, Record<string, unknown>[]>();

  const rows = await runSql<Record<string, unknown>>(
    `
      select id, aviso_id, url, rotulo, ordem
      from gestao_intranet.avisos_links
      where aviso_id = any($1::uuid[])
      order by ordem asc, criado_em asc;
    `,
    [ids],
  );

  const linksByAnnouncement = new Map<string, Record<string, unknown>[]>();
  rows.forEach((row) => {
    const announcementId = String(row.aviso_id || '');
    const links = linksByAnnouncement.get(announcementId) || [];
    links.push({
      id: row.id,
      url: row.url,
      label: row.rotulo || 'Saiba mais',
    });
    linksByAnnouncement.set(announcementId, links);
  });

  return linksByAnnouncement;
}

function normalizeAnnouncementLinks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const url = typeof (item as Record<string, unknown>).url === 'string' ? (item as Record<string, unknown>).url.trim() : '';
      const label = typeof (item as Record<string, unknown>).label === 'string' ? (item as Record<string, unknown>).label.trim() : '';
      if (!url) return null;
      return { url, label: label || 'Saiba mais' };
    })
    .filter((item): item is { url: string; label: string } => item !== null);
}

async function syncAnnouncementLinks(announcementId: string, links: unknown) {
  if (!announcementId) return;
  const normalized = normalizeAnnouncementLinks(links);

  await runSql(
    'delete from gestao_intranet.avisos_links where aviso_id = $1;',
    [announcementId],
  );

  if (normalized.length === 0) return;

  await runSql(
    `
      insert into gestao_intranet.avisos_links (aviso_id, url, rotulo, ordem)
      select $1::uuid, link.url, link.rotulo, link.ordem
      from unnest($2::text[], $3::text[], $4::int[]) as link(url, rotulo, ordem);
    `,
    [
      announcementId,
      normalized.map((link) => link.url),
      normalized.map((link) => link.label),
      normalized.map((_, index) => index),
    ],
  );
}

async function fetchAnnouncementDocuments(announcementIds: string[]) {
  const ids = normalizeIdArray(announcementIds);
  if (ids.length === 0) return new Map<string, Record<string, unknown>[]>();

  const rows = await runSql<Record<string, unknown>>(
    `
      select ad.aviso_id, d.id, d.titulo, d.categoria, d.arquivo_nome
      from gestao_intranet.avisos_documentos ad
      join gestao_intranet.documentos d on d.id = ad.documento_id
      where ad.aviso_id = any($1::uuid[])
      order by d.titulo asc;
    `,
    [ids],
  );

  const documentsByAnnouncement = new Map<string, Record<string, unknown>[]>();
  rows.forEach((row) => {
    const announcementId = String(row.aviso_id || '');
    const documents = documentsByAnnouncement.get(announcementId) || [];
    documents.push({
      id: row.id,
      title: row.titulo,
      category: row.categoria,
      file_name: row.arquivo_nome,
    });
    documentsByAnnouncement.set(announcementId, documents);
  });

  return documentsByAnnouncement;
}

async function syncAnnouncementDocuments(announcementId: string, documentIds: unknown) {
  if (!announcementId) return;
  const ids = normalizeIdArray(documentIds);

  await runSql(
    'delete from gestao_intranet.avisos_documentos where aviso_id = $1;',
    [announcementId],
  );

  if (ids.length === 0) return;

  await runSql(
    `
      insert into gestao_intranet.avisos_documentos (aviso_id, documento_id)
      select $1::uuid, unnest($2::uuid[])
      on conflict (aviso_id, documento_id) do nothing;
    `,
    [announcementId, ids],
  );
}

function mapAnnouncementComment(row: Record<string, unknown>, creatorMap = new Map<string, Record<string, unknown>>()) {
  const creator = creatorMap.get(String(row.criado_por));
  return {
    id: row.id,
    announcement_id: row.aviso_id,
    content: row.conteudo,
    created_date: row.criado_em,
    updated_date: row.atualizado_em,
    created_by: creator?.email || creator?.nome || null,
    created_by_name: creator?.nome || null,
    created_by_id: row.criado_por || null,
  };
}

function mapAnnouncementReaction(row: Record<string, unknown>, creatorMap = new Map<string, Record<string, unknown>>()) {
  const creator = creatorMap.get(String(row.criado_por));
  return {
    id: row.id,
    announcement_id: row.aviso_id,
    emoji: row.emoji,
    created_date: row.criado_em,
    updated_date: row.atualizado_em,
    created_by: creator?.email || creator?.nome || null,
    created_by_id: row.criado_por || null,
  };
}

function mapKnowledgeBase(row: Record<string, unknown>, creatorMap = new Map<string, Record<string, unknown>>()) {
  const creator = creatorMap.get(String(row.criado_por));
  return {
    id: row.id,
    title: row.titulo,
    content: row.conteudo,
    category: row.categoria,
    type: row.tipo,
    tags: Array.isArray(row.tags) ? row.tags.join(', ') : '',
    pinned: row.fixado,
    helpful_count: row.contador_util,
    created_date: row.criado_em,
    updated_date: row.atualizado_em,
    created_by: creator?.email || creator?.nome || null,
    created_by_id: row.criado_por || null,
  };
}

function mapFeedback(row: Record<string, unknown>, creatorMap = new Map<string, Record<string, unknown>>()) {
  const creator = creatorMap.get(String(row.criado_por));
  return {
    id: row.id,
    type: row.tipo,
    category: row.categoria,
    title: row.titulo,
    content: row.conteudo,
    anonymous: row.anonimo,
    status: row.status,
    admin_response: row.resposta_admin,
    created_date: row.criado_em,
    updated_date: row.atualizado_em,
    created_by: row.anonimo ? null : creator?.email || creator?.nome || null,
    created_by_id: row.criado_por || null,
  };
}

function mapQuickLink(row: Record<string, unknown>, creatorMap = new Map<string, Record<string, unknown>>()) {
  const creator = creatorMap.get(String(row.criado_por));
  return {
    id: row.id,
    name: row.nome,
    url: row.url,
    description: row.descricao,
    icon: row.icone,
    category: row.categoria,
    order: row.ordem,
    show_on_dashboard: row.mostrar_na_dashboard,
    created_date: row.criado_em,
    updated_date: row.atualizado_em,
    created_by: creator?.email || creator?.nome || null,
    created_by_id: row.criado_por || null,
  };
}

async function getTrustedIpContext(request: Request) {
  const clientIp = getClientIp(request);
  if (!clientIp) return null;

  const rows = await runSql<Record<string, unknown>>(
    `
      select *, ip_cidr::text as ip_cidr
      from gestao_intranet.acessos_ip_confiavel
      where ativo = true
        and $1::inet <<= ip_cidr
      order by criado_em desc
      limit 1;
    `,
    [clientIp],
  );
  const access = rows[0];
  if (!access) return null;

  await runSql(
    `
      update gestao_intranet.acessos_ip_confiavel
      set ultimo_ip = $2,
          ultimo_acesso_em = now()
      where id = $1;
    `,
    [access.id, clientIp],
  );

  const mapped = mapTrustedIpAccessRow(access);
  const user = {
    id: TRUSTED_IP_USER_ID,
    collaborator_id: null,
    email: null,
    full_name: mapped.name || 'Acesso automatico por rede',
    role: 'user',
    access_level: 'usuario',
    department_id: null,
    position_id: null,
    position: 'Rede liberada',
    function_role: 'trusted_ip',
    status: 'ativo',
    permissions: defaultModulePermissions(),
    auth_mode: 'trusted_ip',
    trusted_ip_access_id: mapped.id,
    client_ip: clientIp,
    backend_status: 'ok',
    backend_reason: null,
  };

  return {
    user,
    collaboratorId: null,
    isAdmin: user.role === 'admin',
  };
}

function getAnnouncementStatus(row: Record<string, unknown>) {
  const now = Date.now();
  const publishAt = row.publica_em ? new Date(String(row.publica_em)).getTime() : null;
  const expireAt = row.expira_em ? new Date(String(row.expira_em)).getTime() : null;

  if (publishAt && Number.isFinite(publishAt) && publishAt > now) return 'scheduled';
  if (expireAt && Number.isFinite(expireAt) && expireAt < now) return 'expired';
  return 'published';
}

function normalizeDateOnly(value: unknown) {
  if (!value) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
    }

    return trimmed || null;
  }

  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  }

  return String(value);
}

function normalizeRecurrence(value: unknown) {
  const recurrence = String(value || 'none');
  return ['none', 'weekly', 'monthly'].includes(recurrence) ? recurrence : 'none';
}

function normalizeDateArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => normalizeDateOnly(item)).filter(Boolean)));
}

function normalizeIdArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)));
}

function uniqIds(values: unknown[]) {
  return Array.from(new Set(values.map((item) => String(item || '').trim()).filter(Boolean)));
}

function notificationReferenceId(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function mapNotification(row: Record<string, unknown>) {
  return {
    id: row.id,
    collaborator_id: row.colaborador_id,
    type: row.tipo || 'geral',
    title: row.titulo,
    message: row.mensagem || '',
    link: row.link || null,
    reference_type: row.referencia_tipo || null,
    reference_id: row.referencia_id || null,
    read_at: row.lida_em || null,
    created_by_id: row.criado_por || null,
    created_date: row.criado_em,
    read: Boolean(row.lida_em),
  };
}

async function listNotifications(collaboratorId: string | null, limit = 20) {
  if (!collaboratorId) return { items: [], unread_count: 0 };
  const rows = await runSql<Record<string, unknown>>(
    `
      select *
      from gestao_intranet.notificacoes
      where colaborador_id = $1::uuid
      order by criado_em desc
      limit $2;
    `,
    [collaboratorId, Math.min(Math.max(Number(limit) || 20, 1), 50)],
  );
  const countRows = await runSql<Record<string, unknown>>(
    `
      select count(*)::int as total
      from gestao_intranet.notificacoes
      where colaborador_id = $1::uuid
        and lida_em is null;
    `,
    [collaboratorId],
  );
  return {
    items: rows.map(mapNotification),
    unread_count: Number(countRows[0]?.total || 0),
  };
}

async function markNotificationRead(collaboratorId: string | null, id: string) {
  if (!collaboratorId || !id) return null;
  const rows = await runSql<Record<string, unknown>>(
    `
      update gestao_intranet.notificacoes
      set lida_em = coalesce(lida_em, now())
      where id = $1::uuid
        and colaborador_id = $2::uuid
      returning *;
    `,
    [id, collaboratorId],
  );
  return rows[0] ? mapNotification(rows[0]) : null;
}

async function markAllNotificationsRead(collaboratorId: string | null) {
  if (!collaboratorId) return { success: true };
  await runSql(
    `
      update gestao_intranet.notificacoes
      set lida_em = coalesce(lida_em, now())
      where colaborador_id = $1::uuid
        and lida_em is null;
    `,
    [collaboratorId],
  );
  return { success: true };
}

async function createNotifications(
  recipientIds: unknown[],
  payload: {
    type: string;
    title: string;
    message?: string;
    link?: string;
    referenceType?: string;
    referenceId?: unknown;
    createdBy?: string | null;
    excludeIds?: unknown[];
  },
) {
  const excluded = new Set(uniqIds(payload.excludeIds || []));
  const recipients = uniqIds(recipientIds).filter((id) => !excluded.has(id));
  if (recipients.length === 0 || !payload.title) return;

  await runSql(
    `
      insert into gestao_intranet.notificacoes (
        colaborador_id, tipo, titulo, mensagem, link, referencia_tipo, referencia_id, criado_por
      )
      select unnest($1::uuid[]), $2, $3, $4, $5, $6, $7::uuid, $8::uuid;
    `,
    [
      recipients,
      payload.type || 'geral',
      payload.title,
      payload.message || null,
      payload.link || null,
      payload.referenceType || null,
      notificationReferenceId(payload.referenceId),
      payload.createdBy || null,
    ],
  );
}

async function fetchActiveCollaboratorIds(filters: { departmentId?: unknown; positionId?: unknown } = {}) {
  const values: unknown[] = [];
  const clauses = ["coalesce(status, 'ativo') = 'ativo'"];
  if (filters.departmentId) {
    values.push(filters.departmentId);
    clauses.push(`departamento_id = $${values.length}::uuid`);
  }
  if (filters.positionId) {
    values.push(filters.positionId);
    clauses.push(`cargo_id = $${values.length}::uuid`);
  }

  const rows = await runSql<Record<string, unknown>>(
    `
      select id
      from public.colaboradores
      where ${clauses.join(' and ')};
    `,
    values,
  );
  return rows.map((row) => String(row.id || '')).filter(Boolean);
}

async function fetchAdminCollaboratorIds() {
  const intranetSystem = await getIntranetSystem();
  if (!intranetSystem?.id) return [];
  const rows = await runSql<Record<string, unknown>>(
    `
      select distinct colaborador_id as id
      from public.acessos_usuario_sistema
      where sistema_id = $1
        and ativo = true
        and nivel_acesso = 'admin';
    `,
    [intranetSystem.id],
  );
  return rows.map((row) => String(row.id || '')).filter(Boolean);
}

async function notifyDocumentAudience(
  document: Record<string, unknown> | null | undefined,
  action: 'created' | 'updated' | 'deleted',
  actorId: string | null,
) {
  if (!document?.id) return;
  const recipients = await fetchActiveCollaboratorIds({
    departmentId: document.departamento_id || undefined,
    positionId: document.cargo_id || undefined,
  });
  const titleByAction = {
    created: 'Novo documento publicado',
    updated: 'Documento atualizado',
    deleted: 'Documento removido',
  };
  const messageByAction = {
    created: `Documento "${document.titulo || 'Sem titulo'}" foi publicado na intranet.`,
    updated: `Documento "${document.titulo || 'Sem titulo'}" foi atualizado.`,
    deleted: `Documento "${document.titulo || 'Sem titulo'}" foi removido.`,
  };
  await createNotifications(recipients, {
    type: 'documento',
    title: titleByAction[action],
    message: messageByAction[action],
    link: '/documentos',
    referenceType: 'Document',
    referenceId: document.id,
    createdBy: actorId,
    excludeIds: [actorId],
  });
}

async function notifyAnnouncementAudience(
  announcement: Record<string, unknown> | null | undefined,
  action: 'created' | 'updated' | 'deleted',
  actorId: string | null,
) {
  if (!announcement?.id) return;
  const recipients = await fetchActiveCollaboratorIds();
  const titleByAction = {
    created: 'Novo aviso publicado',
    updated: 'Aviso atualizado',
    deleted: 'Aviso removido',
  };
  const messageByAction = {
    created: `Aviso "${announcement.titulo || 'Sem titulo'}" foi publicado.`,
    updated: `Aviso "${announcement.titulo || 'Sem titulo'}" foi atualizado.`,
    deleted: `Aviso "${announcement.titulo || 'Sem titulo'}" foi removido.`,
  };
  await createNotifications(recipients, {
    type: 'aviso',
    title: titleByAction[action],
    message: messageByAction[action],
    link: '/avisos',
    referenceType: 'Announcement',
    referenceId: announcement.id,
    createdBy: actorId,
    excludeIds: [actorId],
  });
}

async function notifyCalendarAudience(
  event: Record<string, unknown> | null | undefined,
  participants: Record<string, unknown>[] = [],
  action: 'created' | 'updated' | 'deleted' | 'meet_created',
  actorId: string | null,
) {
  if (!event?.id) return;
  const participantIds = participants.map((participant) => participant.collaborator_id || participant.id);
  const recipients = uniqIds([...participantIds, event.responsavel_colaborador_id]);
  const titleByAction = {
    created: 'Voce foi convidado para um evento',
    updated: 'Evento atualizado',
    deleted: 'Evento cancelado',
    meet_created: 'Google Meet disponivel',
  };
  const messageByAction = {
    created: `Evento "${event.titulo || 'Sem titulo'}" em ${normalizeDateOnly(event.data_evento) || 'data indefinida'}${event.horario ? ` as ${event.horario}` : ''}.`,
    updated: `Evento "${event.titulo || 'Sem titulo'}" teve alteracoes.`,
    deleted: `Evento "${event.titulo || 'Sem titulo'}" foi cancelado.`,
    meet_created: `Link do Google Meet foi gerado para "${event.titulo || 'Sem titulo'}".`,
  };
  await createNotifications(recipients, {
    type: 'agenda',
    title: titleByAction[action],
    message: messageByAction[action],
    link: '/calendario',
    referenceType: 'CalendarEvent',
    referenceId: event.id,
    createdBy: actorId,
    excludeIds: [actorId],
  });
}

async function notifyFeedbackAudience(
  feedback: Record<string, unknown> | null | undefined,
  action: 'created' | 'updated',
  actorId: string | null,
) {
  if (!feedback?.id) return;

  if (action === 'created') {
    const adminIds = await fetchAdminCollaboratorIds();
    await createNotifications(adminIds, {
      type: 'feedback',
      title: 'Novo feedback recebido',
      message: `Feedback "${feedback.titulo || 'Sem titulo'}" foi enviado.`,
      link: '/feedback',
      referenceType: 'Feedback',
      referenceId: feedback.id,
      createdBy: actorId,
      excludeIds: [actorId],
    });
    return;
  }

  await createNotifications([feedback.criado_por], {
    type: 'feedback',
    title: 'Feedback atualizado',
    message: `Seu feedback "${feedback.titulo || 'Sem titulo'}" foi atualizado.`,
    link: '/feedback',
    referenceType: 'Feedback',
    referenceId: feedback.id,
    createdBy: actorId,
    excludeIds: [actorId],
  });
}

function parseDateOnlyUtc(value: unknown) {
  const normalized = normalizeDateOnly(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateOnlyUtc(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function addDaysUtc(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonthsClampedUtc(date: Date, months: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

function getNextOccurrenceDate(date: Date, recurrence: string) {
  if (recurrence === 'weekly') return addDaysUtc(date, 7);
  if (recurrence === 'monthly') return addMonthsClampedUtc(date, 1);
  return null;
}

function expandCalendarRows(rows: Record<string, unknown>[], startDate: Date, endDate: Date) {
  const occurrences: Record<string, unknown>[] = [];

  rows.forEach((row) => {
    const firstDate = parseDateOnlyUtc(row.data_evento);
    if (!firstDate) return;

    const recurrence = normalizeRecurrence(row.recorrencia_tipo);
    const active = row.recorrencia_ativa !== false;
    const recurrenceEnd = parseDateOnlyUtc(row.recorrencia_fim);
    const cancelledDates = normalizeDateArray(row.recorrencia_cancelamentos);
    const finalDate = recurrenceEnd && recurrenceEnd < endDate ? recurrenceEnd : endDate;

    if (recurrence === 'none' || !active) {
      const firstDateKey = formatDateOnlyUtc(firstDate);
      if (firstDate >= startDate && firstDate <= endDate && !cancelledDates.includes(firstDateKey)) {
        occurrences.push(row);
      }
      return;
    }

    let occurrenceDate = firstDate;
    let guard = 0;
    while (occurrenceDate <= finalDate && guard < 370) {
      const occurrenceDateKey = formatDateOnlyUtc(occurrenceDate);
      if (occurrenceDate >= startDate && !cancelledDates.includes(occurrenceDateKey)) {
        occurrences.push({
          ...row,
          occurrence_date: occurrenceDateKey,
        });
      }

      const nextDate = getNextOccurrenceDate(occurrenceDate, recurrence);
      if (!nextDate || nextDate <= occurrenceDate) break;
      occurrenceDate = nextDate;
      guard += 1;
    }
  });

  return occurrences.sort((a, b) => {
    const dateA = String(a.occurrence_date || normalizeDateOnly(a.data_evento) || '');
    const dateB = String(b.occurrence_date || normalizeDateOnly(b.data_evento) || '');
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return String(a.horario || '').localeCompare(String(b.horario || ''));
  });
}

function mapCalendarEvent(
  row: Record<string, unknown>,
  departmentsById: Map<string, Record<string, unknown>>,
  unitsById: Map<string, Record<string, unknown>>,
  creatorMap = new Map<string, Record<string, unknown>>(),
  responsibleMap = new Map<string, Record<string, unknown>>(),
  participantsMap = new Map<string, Record<string, unknown>[]>(),
) {
  const creator = creatorMap.get(String(row.criado_por));
  const responsible = responsibleMap.get(String(row.responsavel_colaborador_id));
  const department = departmentsById.get(String(row.departamento_id));
  const unit = unitsById.get(String(row.unidade_id));
  const participants = participantsMap.get(String(row.id)) || [];

  return {
    id: row.id,
    title: row.titulo,
    description: row.descricao,
    date: normalizeDateOnly(row.data_evento),
    time: row.horario,
    type: row.tipo,
    location: row.local,
    recurrence: normalizeRecurrence(row.recorrencia_tipo),
    recurrence_until: normalizeDateOnly(row.recorrencia_fim),
    recurrence_active: row.recorrencia_ativa !== false,
    recurrence_cancelled_dates: normalizeDateArray(row.recorrencia_cancelamentos),
    occurrence_date: normalizeDateOnly(row.occurrence_date),
    is_recurring_occurrence: Boolean(row.occurrence_date),
    department_id: row.departamento_id,
    department: department?.key || null,
    department_name: department?.name || null,
    unit_id: row.unidade_id,
    unit: unit?.key || null,
    unit_name: unit?.city || unit?.name || null,
    responsible_collaborator_id: row.responsavel_colaborador_id || null,
    responsible_id: row.responsavel_colaborador_id || null,
    responsible_name: responsible?.nome || null,
    responsible_email: responsible?.email || null,
    participants,
    participant_ids: participants.map((participant) => participant.collaborator_id || participant.id),
    google_meet_url: row.google_meet_url || null,
    google_calendar_event_id: row.google_calendar_event_id || null,
    google_calendar_organizer_id: row.google_calendar_organizer_id || null,
    created_date: row.criado_em,
    updated_date: row.atualizado_em,
    created_by: creator?.email || creator?.nome || null,
    created_by_id: row.criado_por || null,
  };
}

function mapDocument(
  row: Record<string, unknown>,
  departmentsById: Map<string, Record<string, unknown>>,
  positionsById = new Map<string, Record<string, unknown>>(),
  creatorMap = new Map<string, Record<string, unknown>>(),
  signedFileUrl?: string | null,
  companiesById = new Map<string, Record<string, unknown>>(),
) {
  const creator = creatorMap.get(String(row.criado_por));
  const department = departmentsById.get(String(row.departamento_id));
  const position = positionsById.get(String(row.cargo_id));
  const company = companiesById.get(String(row.empresa_id));
  const visibility = typeof row.visibilidade === 'string' && row.visibilidade
    ? row.visibilidade
    : (row.cargo_id ? 'cargo' : row.departamento_id ? 'setor' : 'geral');

  return {
    id: row.id,
    title: row.titulo,
    description: row.descricao,
    file_url: signedFileUrl || row.arquivo_url || null,
    file_path: row.arquivo_path || null,
    file_name: row.arquivo_nome || null,
    file_type: row.arquivo_tipo || null,
    file_size: row.arquivo_tamanho || null,
    company: row.empresa_id || null,
    company_name: company?.name || null,
    category: row.categoria,
    visibility,
    minimum_access_level: row.nivel_minimo || null,
    department_id: row.departamento_id,
    department: department?.key || null,
    department_name: department?.name || null,
    position_id: row.cargo_id || null,
    position_name: position?.name || null,
    created_date: row.criado_em,
    updated_date: row.atualizado_em,
    created_by: creator?.email || creator?.nome || null,
    created_by_id: row.criado_por || null,
  };
}

function mapEmployee(
  row: Record<string, unknown>,
  profileRow: Record<string, unknown> | undefined,
  departmentsById: Map<string, Record<string, unknown>>,
  unitsById: Map<string, Record<string, unknown>>,
  accessLevel: string | null,
) {
  const department = departmentsById.get(String(row.departamento_id));
  const unit = unitsById.get(String(row.unidade_id));

  return {
    id: row.id,
    name: row.nome,
    email: row.email,
    phone: row.telefone,
    department: department?.key || null,
    department_name: department?.name || null,
    position_id: row.cargo_id || null,
    position: row.cargo || null,
    role: accessLevel || row.funcao || 'user',
    function_role: row.funcao || null,
    status: row.status,
    unit: unit?.key || null,
    unit_name: unit?.city || unit?.name || null,
    unit_id: row.unidade_id,
    photo_url: profileRow?.foto_url || null,
    birth_date: normalizeDateOnly(row.data_nascimento),
    created_date: row.criado_em,
    updated_date: row.atualizado_em,
  };
}

function createStorageAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

async function createDocumentSignedUrl(document: Record<string, unknown>) {
  const storageClient = createStorageAdminClient();
  const filePath = typeof document.arquivo_path === 'string' ? document.arquivo_path.trim() : '';
  if (!storageClient || !filePath) {
    return typeof document.arquivo_url === 'string' ? document.arquivo_url : null;
  }

  const bucket = resolveDocumentStorageBucket(document);
  const { data, error } = await storageClient.storage
    .from(bucket)
    .createSignedUrl(filePath, DOCUMENT_SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error('Failed to create signed document URL:', {
      bucket,
      filePath,
      message: error.message,
    });
    return typeof document.arquivo_url === 'string' ? document.arquivo_url : null;
  }

  return data?.signedUrl || null;
}

const POSSESSION_TERMS_BUCKET = 'central-anexos';
const POSSESSION_TERMS_SIGNED_URL_TTL_SECONDS = 5 * 60;

// Blindagem: termos assinados como empresa antes do fix do cast ::jsonb em central-api podem ter
// colaborador_anchor gravado com double-encoding (string JSON dentro da coluna jsonb, em vez do
// objeto). Normaliza pra sempre devolver um objeto de verdade (ou null se estiver irrecuperavel).
function normalizeAnchor(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

// Template editavel (RH) do corpo do e-mail de aniversario -- registro unico (sem multi-linha
// ativa, ao contrario de gestao_intranet.avisos). Hoje esta tabela NAO e lida pela Edge Function
// intranet-notifica-aniversariante (que continua usando montarCorpoEmail() fixo em codigo) -- isso
// e proposital, a troca de fonte fica para uma etapa futura separada. Reaproveita o bucket "avisos"
// (mesmo padrao de imagem que gestao_intranet.avisos) em vez de criar um bucket dedicado.
async function getBirthdayTemplateImageSignedUrl(row: Record<string, unknown> | null) {
  const imagePath = typeof row?.imagem_path === 'string' ? row.imagem_path.trim() : '';
  if (!row || !imagePath) {
    return typeof row?.imagem_url === 'string' ? row.imagem_url : null;
  }

  const storageClient = createStorageAdminClient();
  if (!storageClient) {
    return typeof row.imagem_url === 'string' ? row.imagem_url : null;
  }

  const { data, error } = await storageClient.storage
    .from(ANNOUNCEMENT_IMAGES_STORAGE_BUCKET)
    .createSignedUrl(imagePath, ANNOUNCEMENT_IMAGE_SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error('Failed to create signed birthday template image URL:', { imagePath, message: error.message });
    return typeof row.imagem_url === 'string' ? row.imagem_url : null;
  }

  return data?.signedUrl || null;
}

function mapBirthdayTemplate(row: Record<string, unknown> | null, signedImageUrl: string | null) {
  if (!row) return null;
  return {
    id: row.id,
    titulo: row.titulo,
    corpo_texto: row.corpo_texto,
    corpo_html: row.corpo_html || null,
    imagem_url: signedImageUrl,
    imagem_path: row.imagem_path || null,
    imagem_nome: row.imagem_nome || null,
    imagem_tipo: row.imagem_tipo || null,
    imagem_tamanho: row.imagem_tamanho || null,
    ativo: Boolean(row.ativo),
    atualizado_em: row.atualizado_em,
  };
}

async function fetchBirthdayTemplateRow() {
  const rows = await runSql<Record<string, unknown>>(
    `select * from gestao_intranet.template_aniversario order by criado_em desc limit 1;`,
  );
  return rows[0] || null;
}

async function getBirthdayTemplate() {
  const row = await fetchBirthdayTemplateRow();
  const signedImageUrl = await getBirthdayTemplateImageSignedUrl(row);
  return mapBirthdayTemplate(row, signedImageUrl);
}

async function saveBirthdayTemplate(
  authClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  collaboratorId: string | null,
) {
  const titulo = typeof payload.titulo === 'string' ? payload.titulo.trim() : '';
  const corpoTexto = typeof payload.corpo_texto === 'string' ? payload.corpo_texto.trim() : '';
  if (!titulo || !corpoTexto) {
    throw new Error('Titulo e corpo do texto sao obrigatorios.');
  }

  const corpoHtml = typeof payload.corpo_html === 'string' && payload.corpo_html.trim() ? payload.corpo_html : null;
  const imagemUrl = typeof payload.imagem_url === 'string' && payload.imagem_url ? payload.imagem_url : null;
  const imagemPath = typeof payload.imagem_path === 'string' && payload.imagem_path ? payload.imagem_path : null;
  const imagemNome = typeof payload.imagem_nome === 'string' && payload.imagem_nome ? payload.imagem_nome : null;
  const imagemTipo = typeof payload.imagem_tipo === 'string' && payload.imagem_tipo ? payload.imagem_tipo : null;
  const imagemTamanho = typeof payload.imagem_tamanho === 'number' ? payload.imagem_tamanho : null;

  const existing = await fetchBirthdayTemplateRow();

  if (existing) {
    const previousPath = typeof existing.imagem_path === 'string' ? existing.imagem_path : '';
    if (previousPath && previousPath !== imagemPath) {
      await deleteStorageFile(authClient, previousPath, ANNOUNCEMENT_IMAGES_STORAGE_BUCKET).catch((error) =>
        console.error('Failed to delete previous birthday template image:', error),
      );
    }

    await runSql(
      `
        update gestao_intranet.template_aniversario
        set titulo = $1, corpo_texto = $2, corpo_html = $3, imagem_url = $4, imagem_path = $5,
            imagem_nome = $6, imagem_tipo = $7, imagem_tamanho = $8, atualizado_por = $9
        where id = $10;
      `,
      [titulo, corpoTexto, corpoHtml, imagemUrl, imagemPath, imagemNome, imagemTipo, imagemTamanho, collaboratorId, existing.id],
    );
  } else {
    await runSql(
      `
        insert into gestao_intranet.template_aniversario
          (titulo, corpo_texto, corpo_html, imagem_url, imagem_path, imagem_nome, imagem_tipo, imagem_tamanho, atualizado_por)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9);
      `,
      [titulo, corpoTexto, corpoHtml, imagemUrl, imagemPath, imagemNome, imagemTipo, imagemTamanho, collaboratorId],
    );
  }

  return getBirthdayTemplate();
}

// 2a via da assinatura do Termo de Posse: o colaborador assina, no browser da intranet, o mesmo
// PDF que a empresa ja assinou no Central (Fase 1). O bucket central-anexos tem RLS restrita a
// quem tem acesso ao app central (ver central_module_access), entao um colaborador comum nao
// consegue ler/escrever la direto do proprio browser -- por isso a leitura (signed URL) e a
// escrita final passam pelo client de storage com service role (createStorageAdminClient).
async function listPossessionTermsForCollaborator(collaboratorId: string | null) {
  const rows = await runSql<Record<string, unknown>>(
    `
      select id, ativo_nome, ativo_categoria, ativo_marca, ativo_modelo, ativo_numero_serie,
             ativo_patrimonio, arquivo_path, colaborador_anchor, gerado_em
      from gestao_ativos.termos_posse
      where colaborador_id = $1
        and status = 'assinado_empresa'
        and colaborador_anchor is not null
      order by gerado_em desc;
    `,
    [collaboratorId],
  );

  const storageClient = createStorageAdminClient();

  return Promise.all(
    rows.map(async (row) => {
      const filePath = typeof row.arquivo_path === 'string' ? row.arquivo_path.trim() : '';
      let downloadUrl: string | null = null;

      if (storageClient && filePath) {
        const { data, error } = await storageClient.storage
          .from(POSSESSION_TERMS_BUCKET)
          .createSignedUrl(filePath, POSSESSION_TERMS_SIGNED_URL_TTL_SECONDS);
        if (error) {
          console.error('Failed to create signed URL for termo de posse:', { filePath, message: error.message });
        } else {
          downloadUrl = data?.signedUrl || null;
        }
      }

      return { ...row, colaborador_anchor: normalizeAnchor(row.colaborador_anchor), download_url: downloadUrl };
    }),
  );
}

async function signPossessionTermAsCollaborator(
  collaboratorId: string | null,
  { termoId, pdfBase64 }: { termoId: string; pdfBase64: string },
) {
  if (!termoId || !pdfBase64) {
    const error = new Error('Termo e arquivo assinado sao obrigatorios.');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  const rows = await runSql<Record<string, unknown>>(
    `select * from gestao_ativos.termos_posse where id = $1 and colaborador_id = $2 limit 1;`,
    [termoId, collaboratorId],
  );
  const termo = rows[0];

  if (!termo) {
    const error = new Error('Termo de posse nao encontrado.');
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  const colaboradorAnchor = normalizeAnchor(termo.colaborador_anchor);
  if (termo.status !== 'assinado_empresa' || !colaboradorAnchor) {
    const error = new Error('Este termo nao esta pendente da sua assinatura.');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  const storageClient = createStorageAdminClient();
  if (!storageClient) {
    const error = new Error('Storage indisponivel.');
    (error as Error & { status?: number }).status = 500;
    throw error;
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = Uint8Array.from(atob(pdfBase64), (char) => char.charCodeAt(0));
  } catch {
    const error = new Error('Arquivo assinado invalido.');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  const fileName = `termo-assinado-${termoId}.pdf`;
  const storagePath = `termos-posse/${termoId}/${Date.now()}-${fileName}`;
  const { error: uploadError } = await storageClient.storage
    .from(POSSESSION_TERMS_BUCKET)
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: false });

  if (uploadError) {
    console.error('Failed to upload signed termo de posse:', { storagePath, message: uploadError.message });
    const error = new Error('Nao foi possivel salvar o termo assinado.');
    (error as Error & { status?: number }).status = 500;
    throw error;
  }

  await runSql(
    `
      insert into gestao_ativos.assinaturas_termo_posse (termo_id, colaborador_id, papel, posicao)
      values ($1, $2, 'colaborador', $3::jsonb);
    `,
    [termoId, collaboratorId, JSON.stringify(colaboradorAnchor)],
  );

  const updatedRows = await runSql<Record<string, unknown>>(
    `
      update gestao_ativos.termos_posse
      set arquivo_path = $2,
          arquivo_nome = $3,
          arquivo_tipo = 'application/pdf',
          arquivo_tamanho = $4,
          status = 'assinado',
          assinado_em = now()
      where id = $1
      returning *;
    `,
    [termoId, storagePath, fileName, pdfBytes.byteLength],
  );

  const previousPath = typeof termo.arquivo_path === 'string' ? termo.arquivo_path.trim() : '';
  if (previousPath && previousPath !== storagePath) {
    await storageClient.storage.from(POSSESSION_TERMS_BUCKET).remove([previousPath]).catch(() => null);
  }

  return { row: updatedRows[0] || null };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} excedeu o tempo limite de ${ms}ms.`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function createBulkDocumentSignedUrls(rows: Record<string, unknown>[]) {
  const urlByPath = new Map<string, string | null>();
  const storageClient = createStorageAdminClient();
  if (!storageClient) return urlByPath;

  const pathsByBucket = new Map<string, string[]>();
  for (const row of rows) {
    const filePath = typeof row.arquivo_path === 'string' ? row.arquivo_path.trim() : '';
    if (!filePath) continue;
    const bucket = resolveDocumentStorageBucket(row);
    const paths = pathsByBucket.get(bucket) || [];
    paths.push(filePath);
    pathsByBucket.set(bucket, paths);
  }

  await Promise.all(
    Array.from(pathsByBucket.entries()).map(async ([bucket, paths]) => {
      let data: { path: string; error: string | null; signedUrl: string }[] | null = null;
      let error: { message: string } | null = null;
      try {
        ({ data, error } = await withTimeout(
          storageClient.storage.from(bucket).createSignedUrls(paths, DOCUMENT_SIGNED_URL_TTL_SECONDS),
          8000,
          'Geracao de signed URLs em lote',
        ));
      } catch (timeoutError) {
        console.error('Timed out creating signed document URLs (batch):', {
          bucket,
          message: (timeoutError as Error).message,
        });
        return;
      }

      if (error) {
        console.error('Failed to create signed document URLs (batch):', { bucket, message: error.message });
        return;
      }

      (data || []).forEach((entry) => {
        urlByPath.set(entry.path || '', entry.error ? null : entry.signedUrl || null);
      });
    }),
  );

  return urlByPath;
}

async function mapDocumentWithSignedUrl(
  row: Record<string, unknown>,
  departmentsById: Map<string, Record<string, unknown>>,
  positionsById = new Map<string, Record<string, unknown>>(),
  creatorMap = new Map<string, Record<string, unknown>>(),
  companiesById = new Map<string, Record<string, unknown>>(),
) {
  const signedFileUrl = await createDocumentSignedUrl(row);
  return mapDocument(row, departmentsById, positionsById, creatorMap, signedFileUrl, companiesById);
}

async function enrichWithCreators(rows: Record<string, unknown>[]) {
  const creatorIds = rows.map((row) => String(row.criado_por || '')).filter(Boolean);
  return fetchCollaboratorsByIds(creatorIds);
}

async function fetchCalendarParticipants(eventIds: string[]) {
  const ids = normalizeIdArray(eventIds);
  if (ids.length === 0) return new Map<string, Record<string, unknown>[]>();

  const rows = await runSql<Record<string, unknown>>(
    `
      select
        p.evento_id,
        p.colaborador_id,
        p.status,
        c.nome,
        c.email
      from gestao_intranet.eventos_calendario_participantes p
      left join public.colaboradores c on c.id = p.colaborador_id
      where p.evento_id = any($1::uuid[])
      order by c.nome asc nulls last, c.email asc nulls last;
    `,
    [ids],
  );

  const participantsByEvent = new Map<string, Record<string, unknown>[]>();
  rows.forEach((row) => {
    const eventId = String(row.evento_id || '');
    const participants = participantsByEvent.get(eventId) || [];
    participants.push({
      id: row.colaborador_id,
      collaborator_id: row.colaborador_id,
      name: row.nome,
      email: row.email,
      status: row.status || 'convidado',
    });
    participantsByEvent.set(eventId, participants);
  });

  return participantsByEvent;
}

async function syncCalendarParticipants(eventId: string, participantIds: unknown) {
  if (!eventId) return;
  const ids = normalizeIdArray(participantIds);

  await runSql(
    'delete from gestao_intranet.eventos_calendario_participantes where evento_id = $1;',
    [eventId],
  );

  if (ids.length === 0) return;

  await runSql(
    `
      insert into gestao_intranet.eventos_calendario_participantes (evento_id, colaborador_id, status)
      select $1::uuid, unnest($2::uuid[]), 'convidado'
      on conflict (evento_id, colaborador_id) do nothing;
    `,
    [eventId, ids],
  );
}

function getGoogleOAuthConfig(request?: Request) {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || Deno.env.get('GMAIL_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') || Deno.env.get('GMAIL_CLIENT_SECRET');
  const requestUrl = request ? new URL(request.url) : null;
  const redirectUri = Deno.env.get('GOOGLE_CALENDAR_REDIRECT_URI')
    || (requestUrl ? `${requestUrl.origin}${requestUrl.pathname}` : '');

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Configuracao Google Calendar incompleta.');
  }

  return { clientId, clientSecret, redirectUri };
}

async function getGoogleCalendarIntegration(collaboratorId: string | null) {
  if (!collaboratorId) return null;
  const rows = await runSql<Record<string, unknown>>(
    `
      select
        i.id, i.colaborador_id, i.google_email, i.escopos, i.conectado_em, i.atualizado_em,
        s.decrypted_secret as refresh_token
      from gestao_intranet.integracoes_google_calendar i
      left join vault.decrypted_secrets s on s.id = i.refresh_token_secret_id
      where i.colaborador_id = $1::uuid
      limit 1;
    `,
    [collaboratorId],
  );
  return rows[0] || null;
}

async function getGoogleCalendarStatus(collaboratorId: string | null) {
  const integration = await getGoogleCalendarIntegration(collaboratorId);
  return {
    connected: Boolean(integration),
    google_email: integration?.google_email || null,
    scopes: integration?.escopos || [],
    connected_at: integration?.conectado_em || null,
    updated_at: integration?.atualizado_em || null,
  };
}

async function startGoogleCalendarOAuth(request: Request, collaboratorId: string | null, redirectTo: unknown) {
  if (!collaboratorId) throw new Error('Colaborador nao encontrado.');
  const { clientId, redirectUri } = getGoogleOAuthConfig(request);
  const state = crypto.randomUUID();
  const safeRedirect = typeof redirectTo === 'string' && /^https?:\/\//i.test(redirectTo)
    ? redirectTo
    : '/perfil';

  await runSql(
    `
      insert into gestao_intranet.integracoes_google_oauth_state (state, colaborador_id, redirect_to)
      values ($1, $2::uuid, $3);
    `,
    [state, collaboratorId, safeRedirect],
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });

  return { authorization_url: `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}` };
}

async function exchangeGoogleCode(request: Request, code: string) {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig(request);
  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error_description || payload?.error || 'Falha ao conectar Google Agenda.');
  }
  return payload as Record<string, unknown>;
}

async function refreshGoogleAccessToken(refreshToken: unknown) {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: String(refreshToken || ''),
      grant_type: 'refresh_token',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error_description || payload?.error || 'Falha ao renovar token Google.');
  }
  return String(payload.access_token || '');
}

async function fetchGoogleUserEmail(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  return typeof payload.email === 'string' ? payload.email : null;
}

async function handleGoogleOAuthCallback(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return new Response(null, { status: 302, headers: { Location: '/perfil?googleCalendar=error' } });
  }

  const stateRows = await runSql<Record<string, unknown>>(
    `
      delete from gestao_intranet.integracoes_google_oauth_state
      where state = $1 and expira_em > now()
      returning colaborador_id, redirect_to;
    `,
    [state],
  );
  const stateRow = stateRows[0];
  if (!stateRow?.colaborador_id) {
    return new Response(null, { status: 302, headers: { Location: '/perfil?googleCalendar=expired' } });
  }

  try {
    const tokenPayload = await exchangeGoogleCode(request, code);
    const refreshToken = tokenPayload.refresh_token;
    if (!refreshToken) throw new Error('Google nao retornou refresh_token. Tente conectar novamente.');
    const accessToken = String(tokenPayload.access_token || '');
    const googleEmail = accessToken ? await fetchGoogleUserEmail(accessToken) : null;
    const scopes = String(tokenPayload.scope || GOOGLE_CALENDAR_SCOPE).split(/\s+/).filter(Boolean);

    const existingRows = await runSql<Record<string, unknown>>(
      `
        select refresh_token_secret_id
        from gestao_intranet.integracoes_google_calendar
        where colaborador_id = $1::uuid
        limit 1;
      `,
      [stateRow.colaborador_id],
    );
    const existingSecretId = existingRows[0]?.refresh_token_secret_id as string | undefined;

    let secretId: string;
    if (existingSecretId) {
      await runSql('select vault.update_secret($1::uuid, $2);', [existingSecretId, refreshToken]);
      secretId = existingSecretId;
    } else {
      const secretRows = await runSql<Record<string, unknown>>(
        `
          select vault.create_secret(
            $1,
            'google_calendar_refresh_token:' || $2::text
          ) as id;
        `,
        [refreshToken, stateRow.colaborador_id],
      );
      secretId = String(secretRows[0]?.id);
    }

    await runSql(
      `
        insert into gestao_intranet.integracoes_google_calendar (
          colaborador_id, google_email, refresh_token_secret_id, escopos, conectado_em, atualizado_em
        ) values ($1::uuid, $2, $3::uuid, $4::text[], now(), now())
        on conflict (colaborador_id) do update set
          google_email = excluded.google_email,
          refresh_token_secret_id = excluded.refresh_token_secret_id,
          escopos = excluded.escopos,
          atualizado_em = now();
      `,
      [stateRow.colaborador_id, googleEmail, secretId, scopes],
    );

    return new Response(null, {
      status: 302,
      headers: { Location: `${stateRow.redirect_to || '/perfil'}?googleCalendar=connected` },
    });
  } catch (_error) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${stateRow.redirect_to || '/perfil'}?googleCalendar=error` },
    });
  }
}

async function disconnectGoogleCalendar(collaboratorId: string | null) {
  if (!collaboratorId) throw new Error('Colaborador nao encontrado.');

  const rows = await runSql<Record<string, unknown>>(
    `
      delete from gestao_intranet.integracoes_google_calendar
      where colaborador_id = $1::uuid
      returning refresh_token_secret_id;
    `,
    [collaboratorId],
  );
  const secretId = rows[0]?.refresh_token_secret_id as string | undefined;
  if (secretId) {
    await runSql('delete from vault.secrets where id = $1::uuid;', [secretId]);
  }

  return { success: true };
}

function buildGoogleCalendarDateTime(dateValue: unknown, timeValue: unknown, addHours = 0) {
  const date = normalizeDateOnly(dateValue);
  const time = typeof timeValue === 'string' && timeValue ? timeValue : '';
  if (!date) return null;

  if (!time) {
    if (addHours <= 0) return { date };
    const parsedDate = parseDateOnlyUtc(date);
    return parsedDate ? { date: formatDateOnlyUtc(addDaysUtc(parsedDate, 1)) } : { date };
  }

  const [hours, minutes] = time.split(':').map(Number);
  const parsed = parseDateOnlyUtc(date);
  if (!parsed || !Number.isFinite(hours) || !Number.isFinite(minutes)) return { date };
  parsed.setUTCHours(hours + addHours, minutes, 0, 0);

  const localDate = normalizeDateOnly(parsed);
  const localTime = `${String(parsed.getUTCHours()).padStart(2, '0')}:${String(parsed.getUTCMinutes()).padStart(2, '0')}:00`;
  return {
    dateTime: `${localDate}T${localTime}`,
    timeZone: DEFAULT_TIME_ZONE,
  };
}

async function createGoogleMeetForCalendarEvent(
  collaboratorId: string | null,
  eventPayload: Record<string, unknown>,
  participants: Record<string, unknown>[],
) {
  const integration = await getGoogleCalendarIntegration(collaboratorId);
  if (!integration?.refresh_token) {
    throw new Error('Conecte sua Google Agenda antes de gerar Google Meet.');
  }

  const accessToken = await refreshGoogleAccessToken(integration.refresh_token);
  const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID') || 'primary';
  const start = buildGoogleCalendarDateTime(eventPayload.date, eventPayload.time);
  const end = buildGoogleCalendarDateTime(eventPayload.date, eventPayload.time, 1);
  if (!start || !end) throw new Error('Data obrigatoria para criar evento no Google Agenda.');

  const attendees = participants
    .map((participant) => participant.email)
    .filter((email): email is string => typeof email === 'string' && Boolean(email))
    .map((email) => ({ email }));

  const response = await fetch(
    `${GOOGLE_CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: eventPayload.title || 'Evento',
        description: eventPayload.description || '',
        location: eventPayload.location || '',
        start,
        end,
        attendees,
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Falha ao criar Google Meet.');
  }

  return {
    google_meet_url: payload.hangoutLink || payload.conferenceData?.entryPoints?.find((entry: Record<string, unknown>) => entry.entryPointType === 'video')?.uri || null,
    google_calendar_event_id: payload.id || null,
    google_calendar_organizer_id: collaboratorId,
  };
}

async function listBaseEntity(entityName: keyof typeof ENTITY_CONFIG, orderBy?: string, limit?: number) {
  const config = ENTITY_CONFIG[entityName];
  const { column, ascending } = convertOrder(entityName, orderBy);
  const limitSql = limit ? `limit ${Number(limit)}` : '';
  return runSql<Record<string, unknown>>(
    `select * from ${config.schema}.${config.table} order by "${column}" ${ascending ? 'asc' : 'desc'} ${limitSql};`,
  );
}

async function filterBaseEntity(
  entityName: keyof typeof ENTITY_CONFIG,
  filters: Record<string, unknown>,
  orderBy?: string,
  limit?: number,
) {
  const config = ENTITY_CONFIG[entityName];
  const { column, ascending } = convertOrder(entityName, orderBy);
  const { clauses, values } = buildWhereClause(entityName, filters);
  const whereSql = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const limitSql = limit ? `limit ${Number(limit)}` : '';
  return runSql<Record<string, unknown>>(
    `select * from ${config.schema}.${config.table} ${whereSql} order by "${column}" ${ascending ? 'asc' : 'desc'} ${limitSql};`,
    values,
  );
}

async function listAnnouncements(
  orderBy?: string,
  limit?: number,
  options: { includeInactive?: boolean; filters?: Record<string, unknown> } = {},
) {
  const { column, ascending } = convertOrder('Announcement', orderBy);
  const filters = { ...(options.filters || {}) };
  delete filters.include_inactive;
  const { clauses, values } = buildWhereClause('Announcement', filters);

  if (!options.includeInactive) {
    clauses.push('(publica_em is null or publica_em <= now())');
    clauses.push('(expira_em is null or expira_em >= now())');
  }

  const whereSql = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const limitSql = limit ? `limit ${Number(limit)}` : '';
  const rows = await runSql<Record<string, unknown>>(
    `select * from gestao_intranet.avisos ${whereSql} order by "${column}" ${ascending ? 'asc' : 'desc'} ${limitSql};`,
    values,
  );
  const [creators, documentsByAnnouncement, linksByAnnouncement] = await Promise.all([
    enrichWithCreators(rows),
    fetchAnnouncementDocuments(rows.map((row) => String(row.id))),
    fetchAnnouncementLinks(rows.map((row) => String(row.id))),
  ]);
  return Promise.all(rows.map((row) => mapAnnouncementWithSignedUrl(row, creators, documentsByAnnouncement, linksByAnnouncement)));
}

function canViewAllDocuments(user?: Record<string, unknown>) {
  return Boolean(user) && normalizeIntranetAccessLevel(user) === 'admin';
}

function normalizeIntranetAccessLevel(user?: Record<string, unknown>) {
  const accessLevel = String(user?.access_level || '').toLowerCase();
  if (accessLevel === 'admin') return 'admin';
  if (accessLevel === 'gestor' || accessLevel === 'manager') return 'gestor';
  return 'usuario';
}

function buildDocumentVisibilityClause(user?: Record<string, unknown>, startIndex = 1) {
  if (canViewAllDocuments(user)) {
    return { clause: '', values: [] as unknown[] };
  }

  const departmentId = typeof user?.department_id === 'string' ? user.department_id : null;
  const positionId = typeof user?.position_id === 'string' ? user.position_id : null;
  const accessLevel = normalizeIntranetAccessLevel(user);
  const departmentParam = `$${startIndex}::uuid`;
  const positionParam = `$${startIndex + 1}::uuid`;
  const accessLevelParam = `$${startIndex + 2}`;

  return {
    clause: `(
      coalesce(visibilidade, case when cargo_id is not null then 'cargo' when departamento_id is null then 'geral' else 'setor' end) = 'geral'
      or (
        coalesce(visibilidade, case when cargo_id is not null then 'cargo' when departamento_id is null then 'geral' else 'setor' end) = 'setor'
        and departamento_id is not null
        and departamento_id = ${departmentParam}
      )
      or (
        coalesce(visibilidade, case when cargo_id is not null then 'cargo' when departamento_id is null then 'geral' else 'setor' end) = 'cargo'
        and cargo_id is not null
        and cargo_id = ${positionParam}
      )
      or (
        coalesce(visibilidade, case when cargo_id is not null then 'cargo' when departamento_id is null then 'geral' else 'setor' end) = 'nivel'
        and (
          ${accessLevelParam} = 'admin'
          or (coalesce(nivel_minimo, 'gestor') = 'gestor' and ${accessLevelParam} = 'gestor')
        )
      )
    )`,
    values: [departmentId, positionId, accessLevel] as unknown[],
  };
}

async function listHomeAnnouncements(limit = 5) {
  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 5);
  const rows = await runSql<Record<string, unknown>>(
    `
      select
        id,
        titulo,
        conteudo,
        categoria,
        prioridade,
        fixado,
        publica_em,
        expira_em,
        imagem_url,
        imagem_path,
        imagem_nome,
        imagem_tipo,
        imagem_tamanho,
        criado_em,
        atualizado_em,
        criado_por
      from gestao_intranet.avisos
      where (publica_em is null or publica_em <= now())
        and (expira_em is null or expira_em >= now())
      order by criado_em desc
      limit $1;
    `,
    [safeLimit],
  );

  const [documentsByAnnouncement, linksByAnnouncement] = await Promise.all([
    fetchAnnouncementDocuments(rows.map((row) => String(row.id))),
    fetchAnnouncementLinks(rows.map((row) => String(row.id))),
  ]);
  return Promise.all(rows.map((row) => mapAnnouncementWithSignedUrl(row, undefined, documentsByAnnouncement, linksByAnnouncement)));
}

async function listAnnouncementComments(filters: Record<string, unknown>, orderBy?: string, limit?: number) {
  const rows = await filterBaseEntity('AnnouncementComment', filters, orderBy, limit);
  const creators = await enrichWithCreators(rows);
  return rows.map((row) => mapAnnouncementComment(row, creators));
}

async function listAnnouncementReactions(filters: Record<string, unknown>, orderBy?: string, limit?: number) {
  const rows = await filterBaseEntity('AnnouncementReaction', filters, orderBy, limit);
  const creators = await enrichWithCreators(rows);
  return rows.map((row) => mapAnnouncementReaction(row, creators));
}

async function listKnowledgeBase(orderBy?: string, limit?: number) {
  const rows = await listBaseEntity('KnowledgeBase', orderBy, limit);
  const creators = await enrichWithCreators(rows);
  return rows.map((row) => mapKnowledgeBase(row, creators));
}

async function listFeedback(orderBy?: string, limit?: number) {
  const rows = await listBaseEntity('Feedback', orderBy, limit);
  const creators = await enrichWithCreators(rows);
  return rows.map((row) => mapFeedback(row, creators));
}

async function listQuickLinks(orderBy?: string, limit?: number) {
  const rows = await listBaseEntity('QuickLink', orderBy, limit);
  const creators = await enrichWithCreators(rows);
  return rows.map((row) => mapQuickLink(row, creators));
}

async function listDashboardQuickLinks(limit = 6) {
  const rows = await runSql<Record<string, unknown>>(
    `
      select *
      from gestao_intranet.links_uteis
      where mostrar_na_dashboard = true
      order by criado_em asc
      limit $1;
    `,
    [limit],
  );

  return rows.map((row) => mapQuickLink(row));
}

async function listCalendarEvents(orderBy?: string, limit?: number) {
  const rows = await listBaseEntity('CalendarEvent', orderBy, limit);
  const responsibleIds = rows.map((row) => String(row.responsavel_colaborador_id || '')).filter(Boolean);
  const eventIds = rows.map((row) => String(row.id || '')).filter(Boolean);
  const [departments, units, creators, responsibleMap, participantsMap] = await Promise.all([
    listDepartments(),
    listUnits(),
    enrichWithCreators(rows),
    fetchCollaboratorsByIds(responsibleIds),
    fetchCalendarParticipants(eventIds),
  ]);
  const departmentsById = new Map(departments.map((item) => [String(item.id), item]));
  const unitsById = new Map(units.map((item) => [String(item.id), item]));
  return rows.map((row) => mapCalendarEvent(row, departmentsById, unitsById, creators, responsibleMap, participantsMap));
}

async function listUpcomingCalendarEvents(limit = 2) {
  const today = parseDateOnlyUtc(new Date()) || new Date();
  const horizon = addDaysUtc(today, 366);
  const rows = await runSql<Record<string, unknown>>(
    `
      select id, titulo, data_evento, horario, tipo, recorrencia_tipo, recorrencia_fim, recorrencia_ativa, recorrencia_cancelamentos
      from gestao_intranet.eventos_calendario
      where data_evento <= $2
        and (
          data_evento >= $1
          or (
            recorrencia_ativa = true
            and recorrencia_tipo in ('weekly', 'monthly')
            and (recorrencia_fim is null or recorrencia_fim >= $1)
          )
        )
      order by data_evento asc, horario asc nulls last
    `,
    [formatDateOnlyUtc(today), formatDateOnlyUtc(horizon)],
  );

  return expandCalendarRows(rows, today, horizon).slice(0, limit).map((row) => ({
    id: row.id,
    title: row.titulo,
    date: normalizeDateOnly(row.occurrence_date || row.data_evento),
    time: row.horario,
    type: row.tipo,
    recurrence: normalizeRecurrence(row.recorrencia_tipo),
  }));
}

async function listDocuments(orderBy?: string, limit?: number, user?: Record<string, unknown>, filters: Record<string, unknown> = {}) {
  const { column, ascending } = convertOrder('Document', orderBy);
  const { clauses, values } = buildWhereClause('Document', filters);
  const visibility = buildDocumentVisibilityClause(user, values.length + 1);

  if (visibility.clause) {
    clauses.push(visibility.clause);
    values.push(...visibility.values);
  }

  const whereSql = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const limitSql = limit ? `limit ${Number(limit)}` : '';
  const rows = await runSql<Record<string, unknown>>(
    `select * from gestao_intranet.documentos ${whereSql} order by "${column}" ${ascending ? 'asc' : 'desc'} ${limitSql};`,
    values,
  );
  const [departments, positions, creators, companies] = await Promise.all([
    listDepartments(),
    listPositions(),
    enrichWithCreators(rows),
    listCompanies(),
  ]);
  const departmentsById = new Map(departments.map((item) => [String(item.id), item]));
  const positionsById = new Map(positions.map((item) => [String(item.id), item]));
  const companiesById = new Map(companies.map((item) => [String(item.id), item]));
  const urlByPath = await createBulkDocumentSignedUrls(rows);
  return rows.map((row) => {
    const filePath = typeof row.arquivo_path === 'string' ? row.arquivo_path.trim() : '';
    const signedFileUrl = filePath ? urlByPath.get(filePath) : null;
    return mapDocument(row, departmentsById, positionsById, creators, signedFileUrl, companiesById);
  });
}

async function listDocumentStorageOrphans(user?: Record<string, unknown>) {
  assertModuleEdit(user as Record<string, unknown>, 'documentos');

  const rows = await runSql<Record<string, unknown>>(
    `
      select
        object_id,
        bucket_id,
        file_path,
        file_size,
        created_at,
        updated_at,
        last_accessed_at
      from gestao_intranet.list_document_storage_orphans();
    `,
  );

  return rows.map((row) => ({
    id: row.object_id,
    object_id: row.object_id,
    bucket_id: row.bucket_id,
    file_path: row.file_path,
    file_size: row.file_size,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_accessed_at: row.last_accessed_at,
  }));
}

async function getCurrentProfile(user: Record<string, unknown>) {
  const collaboratorId = String(user.collaborator_id || user.id || '');
  if (!collaboratorId) {
    throw new Error('Colaborador nao encontrado.');
  }

  const rows = await runSql<Record<string, unknown>>(
    `
      select
        c.id,
        c.nome,
        c.email,
        c.telefone,
        c.departamento_id,
        d.nome as departamento_nome,
        c.cargo,
        c.funcao,
        c.unidade_id,
        u.nome as unidade_nome,
        u.cidade as unidade_cidade,
        c.data_nascimento,
        c.status,
        c.criado_em,
        c.atualizado_em as colaborador_atualizado_em,
        c.foto_url,
        c.foto_path,
        c.assinatura_url,
        c.assinatura_path,
        p.bio,
        p.frase_status,
        p.linkedin_url,
        p.whatsapp_url,
        p.localizacao_interna,
        p.habilidades,
        p.interesses,
        p.preferencias,
        p.atualizado_em as perfil_atualizado_em
      from public.colaboradores c
      left join gestao_intranet.perfis_colaboradores p on p.colaborador_id = c.id
      left join public.departamentos d on d.id = c.departamento_id
      left join public.unidades u on u.id = c.unidade_id
      where c.id = $1
      limit 1;
    `,
    [collaboratorId],
  );

  const row = rows[0];
  if (!row) {
    throw new Error('Perfil nao encontrado.');
  }

  const requestRows = await runSql<Record<string, unknown>>(
    `
      select
        s.id,
        s.departamento_atual_id,
        da.nome as departamento_atual_nome,
        s.departamento_solicitado_id,
        ds.nome as departamento_solicitado_nome,
        s.unidade_atual_id,
        ua.nome as unidade_atual_nome,
        ua.cidade as unidade_atual_cidade,
        s.unidade_solicitada_id,
        us.nome as unidade_solicitada_nome,
        us.cidade as unidade_solicitada_cidade,
        s.status,
        s.observacao,
        s.criado_em,
        s.atualizado_em
      from gestao_intranet.solicitacoes_alteracao_perfil s
      left join public.departamentos da on da.id = s.departamento_atual_id
      left join public.departamentos ds on ds.id = s.departamento_solicitado_id
      left join public.unidades ua on ua.id = s.unidade_atual_id
      left join public.unidades us on us.id = s.unidade_solicitada_id
      where s.colaborador_id = $1
        and s.status = 'pending'
      order by s.criado_em desc
      limit 1;
    `,
    [collaboratorId],
  );

  const pendingRequest = requestRows[0] || null;

  return {
    id: row.id,
    name: row.nome,
    email: row.email,
    phone: row.telefone,
    position: row.cargo,
    function_role: row.funcao,
    department_id: row.departamento_id,
    department_name: row.departamento_nome || null,
    unit_id: row.unidade_id,
    unit_name: row.unidade_cidade || row.unidade_nome || null,
    birth_date: normalizeDateOnly(row.data_nascimento),
    status: row.status,
    collaborator_created_date: row.criado_em || null,
    collaborator_updated_date: row.colaborador_atualizado_em || null,
    photo_url: row.foto_url || '',
    photo_path: row.foto_path || '',
    signature_url: row.assinatura_url || '',
    signature_path: row.assinatura_path || '',
    bio: row.bio || '',
    status_message: row.frase_status || '',
    linkedin_url: row.linkedin_url || '',
    whatsapp_url: row.whatsapp_url || '',
    office_location: row.localizacao_interna || '',
    skills: Array.isArray(row.habilidades) ? row.habilidades : [],
    interests: Array.isArray(row.interesses) ? row.interesses : [],
    preferences: row.preferencias || {},
    updated_date: row.perfil_atualizado_em || null,
    pending_change_request: pendingRequest
      ? {
          id: pendingRequest.id,
          status: pendingRequest.status,
          department_id: pendingRequest.departamento_solicitado_id || null,
          department_name: pendingRequest.departamento_solicitado_nome || null,
          current_department_id: pendingRequest.departamento_atual_id || null,
          current_department_name: pendingRequest.departamento_atual_nome || null,
          unit_id: pendingRequest.unidade_solicitada_id || null,
          unit_name: pendingRequest.unidade_solicitada_cidade || pendingRequest.unidade_solicitada_nome || null,
          current_unit_id: pendingRequest.unidade_atual_id || null,
          current_unit_name: pendingRequest.unidade_atual_cidade || pendingRequest.unidade_atual_nome || null,
          note: pendingRequest.observacao || '',
          created_date: pendingRequest.criado_em || null,
          updated_date: pendingRequest.atualizado_em || null,
        }
      : null,
  };
}

async function deletePreviousAvatar(previousPath: unknown, nextPath: unknown) {
  const oldPath = typeof previousPath === 'string' ? previousPath.trim() : '';
  const newPath = typeof nextPath === 'string' ? nextPath.trim() : '';
  if (!oldPath || oldPath === newPath) return;

  try {
    const storageClient = createStorageAdminClient();
    if (!storageClient) return;
    const { error } = await storageClient.storage.from(AVATARS_STORAGE_BUCKET).remove([oldPath]);
    if (error) throw error;
  } catch (error) {
    console.error('Failed to delete previous avatar:', {
      path: oldPath,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function updateCurrentAvatar(user: Record<string, unknown>, payload: Record<string, unknown>) {
  const collaboratorId = String(user.collaborator_id || user.id || '');
  if (!collaboratorId) {
    throw new Error('Colaborador nao encontrado.');
  }

  const photoUrl = normalizeOptionalText(payload.photo_url);
  const photoPath = normalizeOptionalText(payload.photo_path);
  if (!photoUrl || !photoPath) {
    throw new Error('Foto do perfil obrigatoria.');
  }

  const previousRows = await runSql<Record<string, unknown>>(
    `
      select foto_path
      from public.colaboradores
      where id = $1
      limit 1;
    `,
    [collaboratorId],
  );

  await runSql(
    `
      update public.colaboradores
      set foto_url = $2,
          foto_path = $3,
          atualizado_em = now()
      where id = $1;
    `,
    [collaboratorId, photoUrl, photoPath],
  );

  await deletePreviousAvatar(previousRows[0]?.foto_path, photoPath);

  return getCurrentProfile(user);
}

async function updateCurrentSignature(user: Record<string, unknown>, payload: Record<string, unknown>) {
  const collaboratorId = String(user.collaborator_id || user.id || '');
  if (!collaboratorId) {
    throw new Error('Colaborador nao encontrado.');
  }

  const signatureUrl = normalizeOptionalText(payload.signature_url);
  const signaturePath = normalizeOptionalText(payload.signature_path);
  if (!signatureUrl || !signaturePath) {
    throw new Error('Assinatura obrigatoria.');
  }

  await updateColaboradorSignature(runSql, createStorageAdminClient(), collaboratorId, signatureUrl, signaturePath);

  return getCurrentProfile(user);
}

function normalizeListInput(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value !== 'string') return [];

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOptionalText(value: unknown) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function normalizeEmail(value: unknown) {
  const email = normalizeOptionalText(value);
  return email ? email.toLowerCase() : null;
}

function isTemporaryCadastroEmail(value: unknown) {
  const email = normalizeEmail(value);
  return Boolean(email?.match(/^[^@\s]+@cadastro\.macom\.(local|com\.br)$/));
}

function assertValidEmail(value: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error('Informe um email valido.');
  }
}

async function updateCurrentProfile(user: Record<string, unknown>, payload: Record<string, unknown>) {
  const collaboratorId = String(user.collaborator_id || user.id || '');
  if (!collaboratorId) {
    throw new Error('Colaborador nao encontrado.');
  }

  const currentRows = await runSql<Record<string, unknown>>(
    `
      select id, email, telefone, data_nascimento, departamento_id, unidade_id
      from public.colaboradores
      where id = $1
      limit 1;
    `,
    [collaboratorId],
  );

  const currentCollaborator = currentRows[0];
  if (!currentCollaborator) {
    throw new Error('Colaborador nao encontrado.');
  }

  const phone = Object.prototype.hasOwnProperty.call(payload, 'phone')
    ? normalizeOptionalText(payload.phone)
    : normalizeOptionalText(currentCollaborator.telefone);
  const birthDate = Object.prototype.hasOwnProperty.call(payload, 'birth_date')
    ? normalizeDateOnly(payload.birth_date)
    : normalizeDateOnly(currentCollaborator.data_nascimento);
  const currentEmail = normalizeEmail(currentCollaborator.email);
  const nextEmail = Object.prototype.hasOwnProperty.call(payload, 'email')
    ? normalizeEmail(payload.email)
    : currentEmail;
  const requestedDepartmentId = normalizeOptionalText(payload.department_id);
  const requestedUnitId = normalizeOptionalText(payload.unit_id);

  if (nextEmail && nextEmail !== currentEmail) {
    if (!isTemporaryCadastroEmail(currentEmail)) {
      throw new Error('O email so pode ser alterado pela intranet quando ainda for temporario.');
    }

    if (isTemporaryCadastroEmail(nextEmail)) {
      throw new Error('Informe um email definitivo para substituir o email temporario.');
    }

    assertValidEmail(nextEmail);

    const duplicatedRows = await runSql<Record<string, unknown>>(
      `
        select id
        from public.colaboradores
        where lower(trim(email)) = lower(trim($1))
          and id <> $2
        limit 1;
      `,
      [nextEmail, collaboratorId],
    );

    if (duplicatedRows[0]) {
      throw new Error('Ja existe um colaborador com este email.');
    }

    const authAdmin = createStorageAdminClient();
    if (!authAdmin) {
      throw new Error('Servico de autenticacao indisponivel para atualizar email.');
    }

    const { error: updateEmailError } = await authAdmin.auth.admin.updateUserById(collaboratorId, {
      email: nextEmail,
      email_confirm: true,
    });

    if (updateEmailError) {
      throw new Error(updateEmailError.message || 'Falha ao atualizar email de acesso.');
    }
  }

  await runSql(
    `
      update public.colaboradores
      set email = $2,
          telefone = $3,
          data_nascimento = $4,
          atualizado_em = now()
      where id = $1;
    `,
    [collaboratorId, nextEmail, phone, birthDate],
  );

  const shouldRequestDepartmentChange = Boolean(requestedDepartmentId)
    && requestedDepartmentId !== String(currentCollaborator.departamento_id || '');
  const shouldRequestUnitChange = Boolean(requestedUnitId)
    && requestedUnitId !== String(currentCollaborator.unidade_id || '');

  if (shouldRequestDepartmentChange || shouldRequestUnitChange) {
    await runSql(
      `
        with updated as (
          update gestao_intranet.solicitacoes_alteracao_perfil
          set departamento_atual_id = $2,
              departamento_solicitado_id = $3,
              unidade_atual_id = $4,
              unidade_solicitada_id = $5,
              observacao = $6,
              atualizado_em = now()
          where colaborador_id = $1
            and status = 'pending'
          returning id
        )
        insert into gestao_intranet.solicitacoes_alteracao_perfil (
          colaborador_id,
          departamento_atual_id,
          departamento_solicitado_id,
          unidade_atual_id,
          unidade_solicitada_id,
          observacao
        )
        select $1,$2,$3,$4,$5,$6
        where not exists (select 1 from updated);
      `,
      [
        collaboratorId,
        currentCollaborator.departamento_id || null,
        shouldRequestDepartmentChange ? requestedDepartmentId : currentCollaborator.departamento_id || null,
        currentCollaborator.unidade_id || null,
        shouldRequestUnitChange ? requestedUnitId : currentCollaborator.unidade_id || null,
        normalizeOptionalText(payload.change_request_note),
      ],
    );
    const adminIds = await fetchAdminCollaboratorIds();
    await createNotifications(adminIds, {
      type: 'perfil',
      title: 'Solicitacao de perfil pendente',
      message: `${user.full_name || user.email || 'Um colaborador'} solicitou alteracao de departamento ou unidade.`,
      link: '/permissoes',
      referenceType: 'ProfileChangeRequest',
      referenceId: collaboratorId,
      createdBy: collaboratorId,
      excludeIds: [collaboratorId],
    });
  }

  await runSql(
    `
      insert into gestao_intranet.perfis_colaboradores (
        colaborador_id,
        bio,
        frase_status,
        linkedin_url,
        whatsapp_url,
        localizacao_interna,
        habilidades,
        interesses,
        atualizado_em
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,now())
      on conflict (colaborador_id) do update
      set bio = excluded.bio,
          frase_status = excluded.frase_status,
          linkedin_url = excluded.linkedin_url,
          whatsapp_url = excluded.whatsapp_url,
          localizacao_interna = excluded.localizacao_interna,
          habilidades = excluded.habilidades,
          interesses = excluded.interesses,
          atualizado_em = now();
    `,
    [
      collaboratorId,
      payload.bio || null,
      payload.status_message || null,
      payload.linkedin_url || null,
      payload.whatsapp_url || null,
      payload.office_location || null,
      normalizeListInput(payload.skills),
      normalizeListInput(payload.interests),
    ],
  );

  await runSql(
    `
      update public.colaboradores
      set foto_url = $2,
          foto_path = $3,
          atualizado_em = now()
      where id = $1;
    `,
    [collaboratorId, payload.photo_url || null, payload.photo_path || null],
  );

  return getCurrentProfile(user);
}

async function listEmployees() {
  const [employees, profiles, departments, units, accessRows, intranetSystem] = await Promise.all([
    runSql<Record<string, unknown>>(
      `
        select
          c.id,
          c.nome,
          c.email,
          c.telefone,
          c.departamento_id,
          c.cargo_id,
          coalesce(cg.nome, c.cargo) as cargo,
          c.funcao,
          c.unidade_id,
          c.data_nascimento,
          c.status,
          c.criado_em,
          c.atualizado_em
        from public.colaboradores c
        left join public.cargos cg on cg.id = c.cargo_id
        order by c.nome asc;
      `,
    ),
    runSql<Record<string, unknown>>(
      `
        select id as colaborador_id, foto_url
        from public.colaboradores;
      `,
    ),
    listDepartments(),
    listUnits(),
    runSql<Record<string, unknown>>(
      `
        select colaborador_id, nivel_acesso, sistema_id, ativo
        from public.acessos_usuario_sistema
        where ativo = true;
      `,
    ),
    getIntranetSystem(),
  ]);

  const profilesById = new Map(profiles.map((row) => [String(row.colaborador_id), row]));
  const departmentsById = new Map(departments.map((row) => [String(row.id), row]));
  const unitsById = new Map(units.map((row) => [String(row.id), row]));
  const accessById = new Map(
    accessRows
      .filter((row) => String(row.sistema_id) === String(intranetSystem?.id || ''))
      .map((row) => [String(row.colaborador_id), String(row.nivel_acesso || '')]),
  );

  return employees.map((row) =>
    mapEmployee(row, profilesById.get(String(row.id)), departmentsById, unitsById, accessById.get(String(row.id)) || null),
  );
}

async function listEmployeeBirthdays(limit?: number) {
  const limitSql = limit ? `limit ${Number(limit)}` : '';
  const rows = await runSql<Record<string, unknown>>(
    `
      select
        c.id,
        c.nome,
        c.cargo,
        c.status,
        c.data_nascimento,
        c.departamento_id,
        d.nome as departamento_nome,
        d.descricao as departamento_descricao,
        c.foto_url
      from public.colaboradores c
      left join public.departamentos d on d.id = c.departamento_id
      where c.status = 'ativo'
        and c.data_nascimento is not null
      order by c.nome asc
      ${limitSql};
    `,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.nome,
    position: row.cargo || null,
    status: row.status,
    birth_date: normalizeDateOnly(row.data_nascimento),
    department_id: row.departamento_id,
    department_name: row.departamento_nome || null,
    department: row.departamento_nome ? toKey(String(row.departamento_nome)) : null,
    photo_url: row.foto_url || null,
  }));
}

async function listUsers() {
  const employees = await listEmployees();
  return employees.map((employee) => ({
    id: employee.id,
    email: employee.email,
    full_name: employee.name,
    role: employee.role,
    function_role: employee.function_role,
    status: employee.status,
  }));
}

async function listUserPermissions(orderBy?: string, limit?: number) {
  const rows = await listBaseEntity('UserPermission', orderBy, limit);
  const collaboratorIds = rows.map((row) => String(row.colaborador_id || '')).filter(Boolean);
  const collaborators = await fetchCollaboratorsByIds(collaboratorIds);
  return rows.map((row) => mapPermissionRow(row, collaborators));
}

async function filterUserPermissions(filters: Record<string, unknown>, orderBy?: string, limit?: number) {
  let dbFilters = { ...filters };
  if (dbFilters.user_email) {
    const rows = await runSql<Record<string, unknown>>(
      `
        select id, nome, email
        from public.colaboradores
        where lower(trim(email)) = lower(trim($1))
        limit 1;
      `,
      [dbFilters.user_email],
    );
    const collaborator = rows[0];
    if (!collaborator) return [];
    dbFilters = { collaborator_id: collaborator.id };
  }

  const rows = await filterBaseEntity('UserPermission', dbFilters, orderBy, limit);
  const collaboratorIds = rows.map((row) => String(row.colaborador_id || '')).filter(Boolean);
  const collaborators = await fetchCollaboratorsByIds(collaboratorIds);
  return rows.map((row) => mapPermissionRow(row, collaborators));
}

async function listTrustedIpAccesses(orderBy?: string, limit?: number) {
  const rows = await listBaseEntity('TrustedIpAccess', orderBy, limit);
  return rows.map(mapTrustedIpAccessRow);
}

function mapProfileChangeRequest(row: Record<string, unknown>) {
  return {
    id: row.id,
    collaborator_id: row.colaborador_id,
    collaborator_name: row.colaborador_nome || null,
    collaborator_email: row.colaborador_email || null,
    current_department_id: row.departamento_atual_id || null,
    current_department_name: row.departamento_atual_nome || null,
    requested_department_id: row.departamento_solicitado_id || null,
    requested_department_name: row.departamento_solicitado_nome || null,
    current_unit_id: row.unidade_atual_id || null,
    current_unit_name: row.unidade_atual_cidade || row.unidade_atual_nome || null,
    requested_unit_id: row.unidade_solicitada_id || null,
    requested_unit_name: row.unidade_solicitada_cidade || row.unidade_solicitada_nome || null,
    status: row.status,
    note: row.observacao || '',
    created_date: row.criado_em,
    updated_date: row.atualizado_em,
    reviewed_by: row.analisado_por || null,
    reviewed_date: row.analisado_em || null,
  };
}

async function listProfileChangeRequests(user: Record<string, unknown>) {
  assertAdmin(user);

  const rows = await runSql<Record<string, unknown>>(
    `
      select
        s.*,
        c.nome as colaborador_nome,
        c.email as colaborador_email,
        da.nome as departamento_atual_nome,
        ds.nome as departamento_solicitado_nome,
        ua.nome as unidade_atual_nome,
        ua.cidade as unidade_atual_cidade,
        us.nome as unidade_solicitada_nome,
        us.cidade as unidade_solicitada_cidade
      from gestao_intranet.solicitacoes_alteracao_perfil s
      join public.colaboradores c on c.id = s.colaborador_id
      left join public.departamentos da on da.id = s.departamento_atual_id
      left join public.departamentos ds on ds.id = s.departamento_solicitado_id
      left join public.unidades ua on ua.id = s.unidade_atual_id
      left join public.unidades us on us.id = s.unidade_solicitada_id
      where s.status = 'pending'
      order by s.criado_em asc;
    `,
  );

  return rows.map(mapProfileChangeRequest);
}

async function createAnnouncement(payload: Record<string, unknown>, collaboratorId: string | null) {
  const sanitized = sanitizePayload(payload, ENTITY_CONFIG.Announcement.createFields);
  validateAnnouncementImage(sanitized);
  validateAnnouncementLinks(sanitized);
  const rows = await runSql<Record<string, unknown>>(
    `
      insert into gestao_intranet.avisos (
        titulo, conteudo, categoria, prioridade, fixado, publica_em, expira_em,
        imagem_url, imagem_path, imagem_nome, imagem_tipo, imagem_tamanho, criado_por
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      returning *;
    `,
    [
      sanitized.title,
      sanitized.content,
      sanitized.category || 'geral',
      sanitized.priority || 'media',
      sanitized.pinned || false,
      sanitized.publish_date || null,
      sanitized.expiration_date || null,
      sanitized.image_url || null,
      sanitized.image_path || null,
      sanitized.image_name || null,
      sanitized.image_type || null,
      sanitized.image_size || null,
      collaboratorId,
    ],
  );

  const announcementId = String(rows[0].id);
  await Promise.all([
    syncAnnouncementDocuments(announcementId, sanitized.document_ids),
    syncAnnouncementLinks(announcementId, sanitized.links),
  ]);
  const [creators, documentsByAnnouncement, linksByAnnouncement] = await Promise.all([
    fetchCollaboratorsByIds([String(rows[0].criado_por || '')]),
    fetchAnnouncementDocuments([announcementId]),
    fetchAnnouncementLinks([announcementId]),
  ]);
  await notifyAnnouncementAudience(rows[0], 'created', collaboratorId);
  return mapAnnouncementWithSignedUrl(rows[0], creators, documentsByAnnouncement, linksByAnnouncement);
}

function validateAnnouncementImage(payload: Record<string, unknown>) {
  const hasImagePayload =
    'image_url' in payload ||
    'image_path' in payload ||
    'image_name' in payload ||
    'image_type' in payload ||
    'image_size' in payload;

  if (!hasImagePayload) return;

  const imageUrl = typeof payload.image_url === 'string' ? payload.image_url.trim() : '';
  const imagePath = typeof payload.image_path === 'string' ? payload.image_path.trim() : '';
  const imageName = typeof payload.image_name === 'string' ? payload.image_name.trim() : '';
  const imageType = typeof payload.image_type === 'string' ? payload.image_type.trim() : '';
  const imageSize = payload.image_size;

  const hasAnyImageValue = Boolean(imageUrl || imagePath || imageName || imageType || imageSize);
  if (!hasAnyImageValue) return;

  if (!imagePath || !imageName) {
    throw new Error('A imagem do aviso precisa conter caminho e nome do arquivo.');
  }

  if (imageType && !ALLOWED_ANNOUNCEMENT_IMAGE_TYPES.has(imageType)) {
    throw new Error('Formato de imagem nao suportado. Use JPG, PNG ou WebP.');
  }

  if (imageSize != null) {
    const normalizedSize = Number(imageSize);
    if (!Number.isFinite(normalizedSize) || normalizedSize <= 0) {
      throw new Error('Tamanho da imagem invalido.');
    }
    if (normalizedSize > MAX_ANNOUNCEMENT_IMAGE_FILE_SIZE) {
      throw new Error('A imagem deve ter no maximo 2 MB.');
    }
  }
}

function validateAnnouncementLinks(payload: Record<string, unknown>) {
  if (!('links' in payload)) return;

  const links = normalizeAnnouncementLinks(payload.links);
  links.forEach((link) => {
    let parsed: URL;
    try {
      parsed = new URL(link.url);
    } catch {
      throw new Error('Um dos links do aviso nao e uma URL valida.');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Os links do aviso precisam comecar com http:// ou https://.');
    }
  });
}

function resolveAnnouncementStorageBucket(announcement: Record<string, unknown> | null | undefined) {
  const imageUrl = typeof announcement?.imagem_url === 'string' ? announcement.imagem_url : '';
  if (imageUrl.includes('/object/public/announcements/')) {
    return 'announcements';
  }

  return ANNOUNCEMENT_IMAGES_STORAGE_BUCKET;
}

async function updateAnnouncement(
  authClient: ReturnType<typeof createClient>,
  user: Record<string, unknown>,
  collaboratorId: string | null,
  id: string,
  payload: Record<string, unknown>,
) {
  const sanitized = sanitizePayload(payload, ENTITY_CONFIG.Announcement.updateFields);
  validateAnnouncementImage(sanitized);
  validateAnnouncementLinks(sanitized);
  const previousRows = await runSql<Record<string, unknown>>(
    'select * from gestao_intranet.avisos where id = $1 limit 1;',
    [id],
  );
  const previousAnnouncement = previousRows[0];
  assertAnnouncementOwnerOrAdmin(user, collaboratorId, previousAnnouncement);
  const updates: string[] = [];
  const values: unknown[] = [id];

  const assign = (column: string, value: unknown) => {
    values.push(value);
    updates.push(`"${column}" = $${values.length}`);
  };

  if ('title' in sanitized) assign('titulo', sanitized.title);
  if ('content' in sanitized) assign('conteudo', sanitized.content);
  if ('category' in sanitized) assign('categoria', sanitized.category);
  if ('priority' in sanitized) assign('prioridade', sanitized.priority);
  if ('pinned' in sanitized) assign('fixado', sanitized.pinned);
  if ('publish_date' in sanitized) assign('publica_em', sanitized.publish_date);
  if ('expiration_date' in sanitized) assign('expira_em', sanitized.expiration_date);
  if ('image_url' in sanitized) assign('imagem_url', sanitized.image_url);
  if ('image_path' in sanitized) assign('imagem_path', sanitized.image_path);
  if ('image_name' in sanitized) assign('imagem_nome', sanitized.image_name);
  if ('image_type' in sanitized) assign('imagem_tipo', sanitized.image_type);
  if ('image_size' in sanitized) assign('imagem_tamanho', sanitized.image_size);
  assign('atualizado_em', new Date().toISOString());

  const rows = await runSql<Record<string, unknown>>(
    `update gestao_intranet.avisos set ${updates.join(', ')} where id = $1 returning *;`,
    values,
  );
  const nextAnnouncement = rows[0];
  if (
    previousAnnouncement?.imagem_path &&
    previousAnnouncement.imagem_path !== nextAnnouncement?.imagem_path
  ) {
    await deleteStorageFile(
      authClient,
      previousAnnouncement.imagem_path,
      resolveAnnouncementStorageBucket(previousAnnouncement),
    );
  }
  if ('document_ids' in sanitized) {
    await syncAnnouncementDocuments(id, sanitized.document_ids);
  }
  if ('links' in sanitized) {
    await syncAnnouncementLinks(id, sanitized.links);
  }
  const [creators, documentsByAnnouncement, linksByAnnouncement] = await Promise.all([
    fetchCollaboratorsByIds([String(rows[0].criado_por || '')]),
    fetchAnnouncementDocuments([id]),
    fetchAnnouncementLinks([id]),
  ]);
  await notifyAnnouncementAudience(rows[0], 'updated', collaboratorId);
  return mapAnnouncementWithSignedUrl(nextAnnouncement, creators, documentsByAnnouncement, linksByAnnouncement);
}

async function createComment(payload: Record<string, unknown>, collaboratorId: string | null) {
  const rows = await runSql<Record<string, unknown>>(
    `
      insert into gestao_intranet.comentarios_avisos (aviso_id, conteudo, criado_por)
      values ($1,$2,$3)
      returning *;
    `,
    [payload.announcement_id, payload.content, collaboratorId],
  );
  const creators = await fetchCollaboratorsByIds([String(rows[0].criado_por || '')]);
  return mapAnnouncementComment(rows[0], creators);
}

async function createReaction(payload: Record<string, unknown>, collaboratorId: string | null) {
  const existing = await runSql<Record<string, unknown>>(
    `
      select *
      from gestao_intranet.reacoes_avisos
      where aviso_id = $1 and emoji = $2 and criado_por = $3
      limit 1;
    `,
    [payload.announcement_id, payload.emoji, collaboratorId],
  );

  if (existing[0]) {
    await runSql(`delete from gestao_intranet.reacoes_avisos where id = $1;`, [existing[0].id]);
    return { id: existing[0].id, deleted: true };
  }

  const rows = await runSql<Record<string, unknown>>(
    `
      insert into gestao_intranet.reacoes_avisos (aviso_id, emoji, criado_por)
      values ($1,$2,$3)
      returning *;
    `,
    [payload.announcement_id, payload.emoji, collaboratorId],
  );
  const creators = await fetchCollaboratorsByIds([String(rows[0].criado_por || '')]);
  return mapAnnouncementReaction(rows[0], creators);
}

async function createKnowledgeBase(payload: Record<string, unknown>, collaboratorId: string | null) {
  const rows = await runSql<Record<string, unknown>>(
    `
      insert into gestao_intranet.base_conhecimento (
        titulo, conteudo, categoria, tipo, tags, fixado, contador_util, criado_por
      ) values ($1,$2,$3,$4,$5,$6,$7,$8)
      returning *;
    `,
    [
      payload.title,
      payload.content,
      payload.category || 'geral',
      payload.type || 'faq',
      parseTags(payload.tags),
      payload.pinned || false,
      payload.helpful_count || 0,
      collaboratorId,
    ],
  );
  const creators = await fetchCollaboratorsByIds([String(rows[0].criado_por || '')]);
  return mapKnowledgeBase(rows[0], creators);
}

async function updateKnowledgeBase(id: string, payload: Record<string, unknown>) {
  const updates: string[] = [];
  const values: unknown[] = [id];
  const assign = (column: string, value: unknown) => {
    values.push(value);
    updates.push(`"${column}" = $${values.length}`);
  };

  if ('title' in payload) assign('titulo', payload.title);
  if ('content' in payload) assign('conteudo', payload.content);
  if ('category' in payload) assign('categoria', payload.category);
  if ('type' in payload) assign('tipo', payload.type);
  if ('tags' in payload) assign('tags', parseTags(payload.tags));
  if ('pinned' in payload) assign('fixado', payload.pinned);
  if ('helpful_count' in payload) assign('contador_util', payload.helpful_count);
  assign('atualizado_em', new Date().toISOString());

  const rows = await runSql<Record<string, unknown>>(
    `update gestao_intranet.base_conhecimento set ${updates.join(', ')} where id = $1 returning *;`,
    values,
  );
  const creators = await fetchCollaboratorsByIds([String(rows[0].criado_por || '')]);
  return mapKnowledgeBase(rows[0], creators);
}

async function createFeedback(payload: Record<string, unknown>, collaboratorId: string | null) {
  const rows = await runSql<Record<string, unknown>>(
    `
      insert into gestao_intranet.feedback (
        tipo, categoria, titulo, conteudo, anonimo, status, resposta_admin, criado_por
      ) values ($1,$2,$3,$4,$5,$6,$7,$8)
      returning *;
    `,
    [
      payload.type || 'sugestao',
      payload.category || 'geral',
      payload.title,
      payload.content,
      payload.anonymous || false,
      payload.status || 'pendente',
      payload.admin_response || null,
      collaboratorId,
    ],
  );
  const creators = await fetchCollaboratorsByIds([String(rows[0].criado_por || '')]);
  await notifyFeedbackAudience(rows[0], 'created', collaboratorId);
  return mapFeedback(rows[0], creators);
}

async function updateFeedback(id: string, payload: Record<string, unknown>, collaboratorId: string | null) {
  const updates: string[] = [];
  const values: unknown[] = [id];
  const assign = (column: string, value: unknown) => {
    values.push(value);
    updates.push(`"${column}" = $${values.length}`);
  };

  if ('type' in payload) assign('tipo', payload.type);
  if ('category' in payload) assign('categoria', payload.category);
  if ('title' in payload) assign('titulo', payload.title);
  if ('content' in payload) assign('conteudo', payload.content);
  if ('anonymous' in payload) assign('anonimo', payload.anonymous);
  if ('status' in payload) assign('status', payload.status);
  if ('admin_response' in payload) assign('resposta_admin', payload.admin_response);
  assign('atualizado_em', new Date().toISOString());

  const rows = await runSql<Record<string, unknown>>(
    `update gestao_intranet.feedback set ${updates.join(', ')} where id = $1 returning *;`,
    values,
  );
  const creators = await fetchCollaboratorsByIds([String(rows[0].criado_por || '')]);
  await notifyFeedbackAudience(rows[0], 'updated', collaboratorId);
  return mapFeedback(rows[0], creators);
}

async function createQuickLink(payload: Record<string, unknown>, collaboratorId: string | null) {
  const rows = await runSql<Record<string, unknown>>(
    `
      insert into gestao_intranet.links_uteis (
        nome, url, descricao, icone, categoria, mostrar_na_dashboard, criado_por
      ) values ($1,$2,$3,$4,$5,$6,$7)
      returning *;
    `,
    [
      payload.name,
      payload.url,
      payload.description || null,
      payload.icon || null,
      payload.category || 'sistema',
      payload.show_on_dashboard || false,
      collaboratorId,
    ],
  );
  const creators = await fetchCollaboratorsByIds([String(rows[0].criado_por || '')]);
  return mapQuickLink(rows[0], creators);
}

async function updateQuickLink(id: string, payload: Record<string, unknown>) {
  const updates: string[] = [];
  const values: unknown[] = [id];
  const assign = (column: string, value: unknown) => {
    values.push(value);
    updates.push(`"${column}" = $${values.length}`);
  };

  if ('name' in payload) assign('nome', payload.name);
  if ('url' in payload) assign('url', payload.url);
  if ('description' in payload) assign('descricao', payload.description);
  if ('icon' in payload) assign('icone', payload.icon);
  if ('category' in payload) assign('categoria', payload.category);
  if ('show_on_dashboard' in payload) assign('mostrar_na_dashboard', payload.show_on_dashboard);
  assign('atualizado_em', new Date().toISOString());

  const rows = await runSql<Record<string, unknown>>(
    `update gestao_intranet.links_uteis set ${updates.join(', ')} where id = $1 returning *;`,
    values,
  );
  const creators = await fetchCollaboratorsByIds([String(rows[0].criado_por || '')]);
  return mapQuickLink(rows[0], creators);
}

async function createCalendarEvent(payload: Record<string, unknown>, collaboratorId: string | null) {
  const department = await resolveDepartment(payload.department || payload.department_id);
  const unit = await resolveUnit(payload.unit || payload.unit_id);
  const responsibleId = payload.responsible_collaborator_id || payload.responsible_id || null;
  const rows = await runSql<Record<string, unknown>>(
    `
      insert into gestao_intranet.eventos_calendario (
        titulo, descricao, data_evento, horario, tipo, local, recorrencia_tipo, recorrencia_fim, recorrencia_ativa, departamento_id, unidade_id, responsavel_colaborador_id, criado_por
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      returning *;
    `,
    [
      payload.title,
      payload.description || null,
      payload.date,
      payload.time || null,
      payload.type || 'evento',
      payload.location || null,
      normalizeRecurrence(payload.recurrence),
      payload.recurrence_until || null,
      payload.recurrence_active !== false,
      department?.id || null,
      unit?.id || null,
      responsibleId || null,
      collaboratorId,
    ],
  );
  if ('participants' in payload || 'participant_ids' in payload) {
    await syncCalendarParticipants(String(rows[0].id), payload.participant_ids || payload.participants || []);
  }
  const collaboratorIds = [String(rows[0].criado_por || ''), String(rows[0].responsavel_colaborador_id || '')];
  const [departments, units, collaborators, participantsMap] = await Promise.all([
    listDepartments(),
    listUnits(),
    fetchCollaboratorsByIds(collaboratorIds),
    fetchCalendarParticipants([String(rows[0].id)]),
  ]);
  let eventRow = rows[0];
  let meetCreated = false;
  if (payload.add_google_meet && !eventRow.google_meet_url) {
    const meet = await createGoogleMeetForCalendarEvent(
      collaboratorId,
      { ...payload, date: eventRow.data_evento, time: eventRow.horario },
      participantsMap.get(String(eventRow.id)) || [],
    );
    const meetRows = await runSql<Record<string, unknown>>(
      `
        update gestao_intranet.eventos_calendario
        set google_meet_url = $2,
            google_calendar_event_id = $3,
            google_calendar_organizer_id = $4::uuid,
            atualizado_em = now()
        where id = $1
        returning *;
      `,
      [eventRow.id, meet.google_meet_url, meet.google_calendar_event_id, meet.google_calendar_organizer_id],
    );
    eventRow = meetRows[0] || eventRow;
    meetCreated = Boolean(eventRow.google_meet_url);
  }
  const participants = participantsMap.get(String(eventRow.id)) || [];
  await notifyCalendarAudience(eventRow, participants, 'created', collaboratorId);
  if (meetCreated) {
    await notifyCalendarAudience(eventRow, participants, 'meet_created', collaboratorId);
  }
  return mapCalendarEvent(
    eventRow,
    new Map(departments.map((item) => [String(item.id), item])),
    new Map(units.map((item) => [String(item.id), item])),
    collaborators,
    collaborators,
    participantsMap,
  );
}

async function updateCalendarEvent(
  user: Record<string, unknown>,
  collaboratorId: string | null,
  id: string,
  payload: Record<string, unknown>,
) {
  const previousRows = await runSql<Record<string, unknown>>(
    'select * from gestao_intranet.eventos_calendario where id = $1 limit 1;',
    [id],
  );
  assertCalendarEventOwnerOrAdmin(user, collaboratorId, previousRows[0]);

  const department = await resolveDepartment(payload.department || payload.department_id);
  const unit = await resolveUnit(payload.unit || payload.unit_id);
  const updates: string[] = [];
  const values: unknown[] = [id];
  const assign = (column: string, value: unknown) => {
    values.push(value);
    updates.push(`"${column}" = $${values.length}`);
  };

  if ('title' in payload) assign('titulo', payload.title);
  if ('description' in payload) assign('descricao', payload.description);
  if ('date' in payload) assign('data_evento', payload.date);
  if ('time' in payload) assign('horario', payload.time);
  if ('type' in payload) assign('tipo', payload.type);
  if ('location' in payload) assign('local', payload.location);
  if ('recurrence' in payload) assign('recorrencia_tipo', normalizeRecurrence(payload.recurrence));
  if ('recurrence_until' in payload) assign('recorrencia_fim', payload.recurrence_until || null);
  if ('recurrence_active' in payload) assign('recorrencia_ativa', payload.recurrence_active !== false);
  if ('recurrence_cancelled_dates' in payload) assign('recorrencia_cancelamentos', normalizeDateArray(payload.recurrence_cancelled_dates));
  if ('department' in payload || 'department_id' in payload) assign('departamento_id', department?.id || null);
  if ('unit' in payload || 'unit_id' in payload) assign('unidade_id', unit?.id || null);
  if ('responsible_collaborator_id' in payload || 'responsible_id' in payload) {
    assign('responsavel_colaborador_id', payload.responsible_collaborator_id || payload.responsible_id || null);
  }
  assign('atualizado_em', new Date().toISOString());

  const rows = await runSql<Record<string, unknown>>(
    `update gestao_intranet.eventos_calendario set ${updates.join(', ')} where id = $1 returning *;`,
    values,
  );
  if ('participants' in payload || 'participant_ids' in payload) {
    await syncCalendarParticipants(id, payload.participant_ids || payload.participants || []);
  }
  const collaboratorIds = [String(rows[0].criado_por || ''), String(rows[0].responsavel_colaborador_id || '')];
  const [departments, units, collaborators, participantsMap] = await Promise.all([
    listDepartments(),
    listUnits(),
    fetchCollaboratorsByIds(collaboratorIds),
    fetchCalendarParticipants([String(rows[0].id)]),
  ]);
  let eventRow = rows[0];
  let meetCreated = false;
  if (payload.add_google_meet && !eventRow.google_meet_url) {
    const meet = await createGoogleMeetForCalendarEvent(
      collaboratorId,
      { ...eventRow, title: eventRow.titulo, description: eventRow.descricao, date: eventRow.data_evento, time: eventRow.horario, location: eventRow.local },
      participantsMap.get(String(eventRow.id)) || [],
    );
    const meetRows = await runSql<Record<string, unknown>>(
      `
        update gestao_intranet.eventos_calendario
        set google_meet_url = $2,
            google_calendar_event_id = $3,
            google_calendar_organizer_id = $4::uuid,
            atualizado_em = now()
        where id = $1
        returning *;
      `,
      [eventRow.id, meet.google_meet_url, meet.google_calendar_event_id, meet.google_calendar_organizer_id],
    );
    eventRow = meetRows[0] || eventRow;
    meetCreated = Boolean(eventRow.google_meet_url);
  }
  const participants = participantsMap.get(String(eventRow.id)) || [];
  await notifyCalendarAudience(eventRow, participants, 'updated', collaboratorId);
  if (meetCreated) {
    await notifyCalendarAudience(eventRow, participants, 'meet_created', collaboratorId);
  }
  return mapCalendarEvent(
    eventRow,
    new Map(departments.map((item) => [String(item.id), item])),
    new Map(units.map((item) => [String(item.id), item])),
    collaborators,
    collaborators,
    participantsMap,
  );
}

async function createDocument(payload: Record<string, unknown>, collaboratorId: string | null) {
  const department = await resolveDepartment(payload.department || payload.department_id);
  const position = await resolvePosition(payload.position_id || payload.cargo_id);
  const company = await resolveCompany(payload.company);
  if (!company) {
    throw new Error('Selecione a empresa do documento.');
  }
  const visibilityConfig = resolveDocumentVisibility(payload, department, position);
  if (!payload.file_path || !payload.file_name) {
    throw new Error('Arquivo obrigatorio para criar documento.');
  }
  validateDocumentFileSize(payload.file_size);
  const rows = await runSql<Record<string, unknown>>(
    `
      insert into gestao_intranet.documentos (
        titulo, descricao, arquivo_url, arquivo_path, arquivo_nome, arquivo_tipo, arquivo_tamanho, empresa_id, categoria, departamento_id, cargo_id, visibilidade, nivel_minimo, criado_por
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      returning *;
    `,
    [
      payload.title,
      payload.description || null,
      payload.file_url || null,
      payload.file_path,
      payload.file_name,
      payload.file_type || null,
      payload.file_size || null,
      company.id,
      payload.category || 'outros',
      visibilityConfig.departmentId,
      visibilityConfig.positionId,
      visibilityConfig.visibility,
      visibilityConfig.minimumAccessLevel,
      collaboratorId,
    ],
  );
  const [departments, positions, creators, companies] = await Promise.all([
    listDepartments(),
    listPositions(),
    fetchCollaboratorsByIds([String(rows[0].criado_por || '')]),
    listCompanies(),
  ]);
  await notifyDocumentAudience(rows[0], 'created', collaboratorId);
  return mapDocumentWithSignedUrl(
    rows[0],
    new Map(departments.map((item) => [String(item.id), item])),
    new Map(positions.map((item) => [String(item.id), item])),
    creators,
    new Map(companies.map((item) => [String(item.id), item])),
  );
}

function resolveDocumentVisibility(
  payload: Record<string, unknown>,
  department: Record<string, unknown> | null | undefined,
  position: Record<string, unknown> | null | undefined,
) {
  const hasExplicitVisibility = typeof payload.visibility === 'string' || typeof payload.visibilidade === 'string';
  const rawVisibility = String(payload.visibility || payload.visibilidade || '').toLowerCase();
  const visibility = ['geral', 'setor', 'cargo', 'nivel'].includes(rawVisibility)
    ? rawVisibility
    : (position?.id ? 'cargo' : department?.id ? 'setor' : 'geral');

  if (visibility === 'setor') {
    if (!department?.id) {
      throw new Error('Selecione o setor para documentos com visibilidade por setor.');
    }
    return {
      visibility,
      departmentId: department.id,
      positionId: null,
      minimumAccessLevel: null,
    };
  }

  if (visibility === 'cargo') {
    if (!position?.id) {
      throw new Error('Selecione o cargo para documentos com visibilidade por cargo.');
    }
    return {
      visibility,
      departmentId: null,
      positionId: position.id,
      minimumAccessLevel: null,
    };
  }

  if (visibility === 'nivel') {
    const rawLevel = String(payload.minimum_access_level || payload.nivel_minimo || 'gestor').toLowerCase();
    const minimumAccessLevel = rawLevel === 'admin' ? 'admin' : 'gestor';
    return {
      visibility,
      departmentId: null,
      positionId: null,
      minimumAccessLevel,
    };
  }

  return {
    visibility: hasExplicitVisibility ? 'geral' : visibility,
    departmentId: null,
    positionId: null,
    minimumAccessLevel: null,
  };
}

function resolveDocumentStorageBucket(document: Record<string, unknown> | null | undefined) {
  const fileUrl = typeof document?.arquivo_url === 'string' ? document.arquivo_url : '';
  if (fileUrl.includes('/object/public/documents/')) {
    return 'documents';
  }

  return DOCUMENTS_STORAGE_BUCKET;
}

async function deleteStorageFile(
  authClient: ReturnType<typeof createClient>,
  filePath: unknown,
  bucket = DOCUMENTS_STORAGE_BUCKET,
) {
  void authClient;
  const normalizedPath = typeof filePath === 'string' ? filePath.trim() : '';
  if (!normalizedPath) return;

  const storageClient = createStorageAdminClient();
  if (!storageClient) {
    throw new Error('Cliente administrativo do storage nao configurado.');
  }

  const { error } = await storageClient.storage.from(bucket).remove([normalizedPath]);
  if (error) {
    throw new Error(error.message || 'Falha ao remover arquivo do storage.');
  }
}

async function updateDocument(
  authClient: ReturnType<typeof createClient>,
  id: string,
  payload: Record<string, unknown>,
  collaboratorId: string | null,
) {
  const department = await resolveDepartment(payload.department || payload.department_id);
  const position = await resolvePosition(payload.position_id || payload.cargo_id);
  const shouldUpdateVisibility =
    'visibility' in payload ||
    'visibilidade' in payload ||
    'minimum_access_level' in payload ||
    'nivel_minimo' in payload ||
    'position_id' in payload ||
    'cargo_id' in payload ||
    'department' in payload ||
    'department_id' in payload;
  const visibilityConfig = shouldUpdateVisibility ? resolveDocumentVisibility(payload, department, position) : null;
  if ('file_size' in payload) {
    validateDocumentFileSize(payload.file_size);
  }
  const previousRows = await runSql<Record<string, unknown>>(
    'select * from gestao_intranet.documentos where id = $1 limit 1;',
    [id],
  );
  const previousDocument = previousRows[0];
  const updates: string[] = [];
  const values: unknown[] = [id];
  const assign = (column: string, value: unknown) => {
    values.push(value);
    updates.push(`"${column}" = $${values.length}`);
  };

  if ('title' in payload) assign('titulo', payload.title);
  if ('description' in payload) assign('descricao', payload.description);
  if ('file_url' in payload) assign('arquivo_url', payload.file_url);
  if ('file_path' in payload) assign('arquivo_path', payload.file_path);
  if ('file_name' in payload) assign('arquivo_nome', payload.file_name);
  if ('file_type' in payload) assign('arquivo_tipo', payload.file_type);
  if ('file_size' in payload) assign('arquivo_tamanho', payload.file_size);
  if ('company' in payload) {
    const company = await resolveCompany(payload.company);
    if (!company) {
      throw new Error('Selecione a empresa do documento.');
    }
    assign('empresa_id', company.id);
  }
  if ('category' in payload) assign('categoria', payload.category);
  if (visibilityConfig) {
    assign('departamento_id', visibilityConfig.departmentId);
    assign('cargo_id', visibilityConfig.positionId);
    assign('visibilidade', visibilityConfig.visibility);
    assign('nivel_minimo', visibilityConfig.minimumAccessLevel);
  }
  assign('atualizado_em', new Date().toISOString());

  const rows = await runSql<Record<string, unknown>>(
    `update gestao_intranet.documentos set ${updates.join(', ')} where id = $1 returning *;`,
    values,
  );
  const nextDocument = rows[0];
  if (
    previousDocument?.arquivo_path &&
    nextDocument?.arquivo_path &&
    previousDocument.arquivo_path !== nextDocument.arquivo_path
  ) {
    await deleteStorageFile(
      authClient,
      previousDocument.arquivo_path,
      resolveDocumentStorageBucket(previousDocument),
    );
  }
  const [departments, positions, creators, companies] = await Promise.all([
    listDepartments(),
    listPositions(),
    fetchCollaboratorsByIds([String(rows[0].criado_por || '')]),
    listCompanies(),
  ]);
  await notifyDocumentAudience(rows[0], 'updated', collaboratorId);
  return mapDocumentWithSignedUrl(
    rows[0],
    new Map(departments.map((item) => [String(item.id), item])),
    new Map(positions.map((item) => [String(item.id), item])),
    creators,
    new Map(companies.map((item) => [String(item.id), item])),
  );
}

async function updateEmployee(id: string, payload: Record<string, unknown>) {
  const [department, unit] = await Promise.all([
    'department' in payload || 'department_id' in payload
      ? resolveDepartment(payload.department || payload.department_id)
      : Promise.resolve(null),
    'unit' in payload || 'unit_id' in payload
      ? resolveUnit(payload.unit || payload.unit_id)
      : Promise.resolve(null),
  ]);
  const updates: string[] = [];
  const values: unknown[] = [id];
  const assign = (column: string, value: unknown) => {
    values.push(value);
    updates.push(`${column} = $${values.length}`);
  };

  if ('name' in payload) assign('nome', payload.name);
  if ('email' in payload) assign('email', payload.email || null);
  if ('phone' in payload) assign('telefone', payload.phone || null);
  if ('department' in payload || 'department_id' in payload) assign('departamento_id', department?.id || null);
  if ('function_role' in payload) assign('funcao', payload.function_role || null);
  if ('unit' in payload || 'unit_id' in payload) assign('unidade_id', unit?.id || null);
  if ('birth_date' in payload) assign('data_nascimento', payload.birth_date || null);
  if ('photo_url' in payload) assign('foto_url', payload.photo_url || null);
  assign('atualizado_em', new Date().toISOString());

  const employeeRows = await runSql<Record<string, unknown>>(
    `update public.colaboradores
      set ${updates.join(', ')}
      where id = $1
      returning id, nome, email, telefone, departamento_id, cargo_id, cargo, funcao, unidade_id, data_nascimento, status, criado_em, atualizado_em;`,
    values,
  );

  const [profiles, departments, units, intranetSystem] = await Promise.all([
    runSql<Record<string, unknown>>(
      `
        select id as colaborador_id, foto_url
        from public.colaboradores
        where id = $1
        limit 1;
      `,
      [id],
    ),
    listDepartments(),
    listUnits(),
    getIntranetSystem(),
  ]);

  const accessRows = intranetSystem?.id
    ? await runSql<Record<string, unknown>>(
        `
          select nivel_acesso
          from public.acessos_usuario_sistema
          where colaborador_id = $1 and sistema_id = $2 and ativo = true
          limit 1;
        `,
        [id, intranetSystem.id],
      )
    : [];

  return mapEmployee(
    employeeRows[0],
    profiles[0],
    new Map(departments.map((item) => [String(item.id), item])),
    new Map(units.map((item) => [String(item.id), item])),
    accessRows[0]?.nivel_acesso ? String(accessRows[0].nivel_acesso) : null,
  );
}

async function deleteEmployee(id: string) {
  await runSql(`delete from public.colaboradores where id = $1;`, [id]);
  return { success: true };
}

async function resolveCollaboratorIdByEmail(email: unknown) {
  if (!email) return null;
  const rows = await runSql<Record<string, unknown>>(
    `
      select id
      from public.colaboradores
      where lower(trim(email)) = lower(trim($1))
      limit 1;
    `,
    [email],
  );
  return rows[0]?.id || null;
}

async function createUserPermission(payload: Record<string, unknown>) {
  const collaboratorId = payload.collaborator_id || (await resolveCollaboratorIdByEmail(payload.user_email));
  if (!collaboratorId) {
    throw new Error('Nenhum colaborador encontrado para o e-mail informado.');
  }

  const collaborators = await fetchCollaboratorsByIds([String(collaboratorId)]);
  const collaborator = collaborators.get(String(collaboratorId));
  const modules = restrictModulePermissionsForCollaborator(
    (payload.modules || {}) as Record<string, unknown>,
    collaborator,
  );
  const rows = await runSql<Record<string, unknown>>(
    `
      insert into gestao_intranet.permissoes_usuario (
        colaborador_id, mod_avisos, mod_links, mod_colaboradores, mod_documentos,
        mod_calendario, mod_conhecimento, mod_feedback
      ) values ($1,$2,$3,$4,$5,$6,$7,$8)
      on conflict (colaborador_id) do update
      set
        mod_avisos = excluded.mod_avisos,
        mod_links = excluded.mod_links,
        mod_colaboradores = excluded.mod_colaboradores,
        mod_documentos = excluded.mod_documentos,
        mod_calendario = excluded.mod_calendario,
        mod_conhecimento = excluded.mod_conhecimento,
        mod_feedback = excluded.mod_feedback,
        atualizado_em = now()
      returning *;
    `,
    [
      collaboratorId,
      modules.avisos || 'view',
      modules.links || 'view',
      modules.colaboradores || 'view',
      modules.documentos || 'view',
      modules.calendario || 'view',
      modules.conhecimento || 'view',
      modules.feedback || 'view',
    ],
  );
  return mapPermissionRow(rows[0], collaborators);
}

async function updateUserPermission(id: string, payload: Record<string, unknown>) {
  const existingRows = await runSql<Record<string, unknown>>(
    'select colaborador_id from gestao_intranet.permissoes_usuario where id = $1 limit 1;',
    [id],
  );
  const collaboratorId = String(existingRows[0]?.colaborador_id || '');
  const collaborators = await fetchCollaboratorsByIds(collaboratorId ? [collaboratorId] : []);
  const collaborator = collaborators.get(collaboratorId);
  const modules = restrictModulePermissionsForCollaborator(
    (payload.modules || {}) as Record<string, unknown>,
    collaborator,
  );
  const rows = await runSql<Record<string, unknown>>(
    `
      update gestao_intranet.permissoes_usuario
      set
        mod_avisos = $2,
        mod_links = $3,
        mod_colaboradores = $4,
        mod_documentos = $5,
        mod_calendario = $6,
        mod_conhecimento = $7,
        mod_feedback = $8,
        atualizado_em = now()
      where id = $1
      returning *;
    `,
    [
      id,
      modules.avisos || 'view',
      modules.links || 'view',
      modules.colaboradores || 'view',
      modules.documentos || 'view',
      modules.calendario || 'view',
      modules.conhecimento || 'view',
      modules.feedback || 'view',
    ],
  );
  return mapPermissionRow(rows[0], collaborators);
}

function normalizeTrustedIpPayload(payload: Record<string, unknown>) {
  const ipCidr = String(payload.ip_cidr || '').trim();
  return {
    name: String(payload.name || ipCidr).trim(),
    description: null,
    ipCidr,
    accessLevel: 'usuario',
    active: true,
    modules: defaultModulePermissions(),
  };
}

async function createTrustedIpAccess(payload: Record<string, unknown>) {
  const data = normalizeTrustedIpPayload(payload);
  if (!data.name) throw new Error('Nome da rede obrigatorio.');
  if (!data.ipCidr) throw new Error('IP ou CIDR obrigatorio.');

  const rows = await runSql<Record<string, unknown>>(
    `
      insert into gestao_intranet.acessos_ip_confiavel (
        nome, descricao, ip_cidr, nivel_acesso, ativo,
        mod_avisos, mod_links, mod_colaboradores, mod_documentos,
        mod_calendario, mod_conhecimento, mod_feedback
      ) values ($1,$2,$3::cidr,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      returning *, ip_cidr::text as ip_cidr;
    `,
    [
      data.name,
      data.description,
      data.ipCidr,
      data.accessLevel,
      data.active,
      data.modules.avisos || 'view',
      data.modules.links || 'view',
      data.modules.colaboradores || 'view',
      data.modules.documentos || 'view',
      data.modules.calendario || 'view',
      data.modules.conhecimento || 'view',
      data.modules.feedback || 'view',
    ],
  );
  return mapTrustedIpAccessRow(rows[0]);
}

async function updateTrustedIpAccess(id: string, payload: Record<string, unknown>) {
  const data = normalizeTrustedIpPayload(payload);
  if (!data.name) throw new Error('Nome da rede obrigatorio.');
  if (!data.ipCidr) throw new Error('IP ou CIDR obrigatorio.');

  const rows = await runSql<Record<string, unknown>>(
    `
      update gestao_intranet.acessos_ip_confiavel
      set nome = $2,
          descricao = $3,
          ip_cidr = $4::cidr,
          nivel_acesso = $5,
          ativo = $6,
          mod_avisos = $7,
          mod_links = $8,
          mod_colaboradores = $9,
          mod_documentos = $10,
          mod_calendario = $11,
          mod_conhecimento = $12,
          mod_feedback = $13,
          atualizado_em = now()
      where id = $1
      returning *, ip_cidr::text as ip_cidr;
    `,
    [
      id,
      data.name,
      data.description,
      data.ipCidr,
      data.accessLevel,
      data.active,
      data.modules.avisos || 'view',
      data.modules.links || 'view',
      data.modules.colaboradores || 'view',
      data.modules.documentos || 'view',
      data.modules.calendario || 'view',
      data.modules.conhecimento || 'view',
      data.modules.feedback || 'view',
    ],
  );
  if (!rows[0]) throw new Error('Acesso por rede nao encontrado.');
  return mapTrustedIpAccessRow(rows[0]);
}

async function updateProfileChangeRequest(
  user: Record<string, unknown>,
  reviewerCollaboratorId: string | null,
  id: string,
  payload: Record<string, unknown>,
) {
  assertAdmin(user);

  const status = String(payload.status || '').toLowerCase();
  if (status !== 'approved' && status !== 'rejected') {
    throw new Error('Status invalido para a solicitacao.');
  }

  const requestRows = await runSql<Record<string, unknown>>(
    `
      select *
      from gestao_intranet.solicitacoes_alteracao_perfil
      where id = $1
        and status = 'pending'
      limit 1;
    `,
    [id],
  );

  const request = requestRows[0];
  if (!request) {
    throw new Error('Solicitacao pendente nao encontrada.');
  }

  if (status === 'approved') {
    await runSql(
      `
        update public.colaboradores
        set departamento_id = $2,
            unidade_id = $3,
            atualizado_em = now()
        where id = $1;
      `,
      [
        request.colaborador_id,
        request.departamento_solicitado_id || request.departamento_atual_id || null,
        request.unidade_solicitada_id || request.unidade_atual_id || null,
      ],
    );
  }

  const rows = await runSql<Record<string, unknown>>(
    `
      update gestao_intranet.solicitacoes_alteracao_perfil
      set status = $2,
          observacao = coalesce($3, observacao),
          analisado_por = $4,
          analisado_em = now(),
          atualizado_em = now()
      where id = $1
      returning *;
    `,
    [id, status, normalizeOptionalText(payload.review_note), reviewerCollaboratorId],
  );

  await createNotifications([request.colaborador_id], {
    type: 'perfil',
    title: status === 'approved' ? 'Solicitacao de perfil aprovada' : 'Solicitacao de perfil recusada',
    message: status === 'approved'
      ? 'Sua solicitacao de alteracao de perfil foi aprovada.'
      : 'Sua solicitacao de alteracao de perfil foi recusada.',
    link: '/perfil',
    referenceType: 'ProfileChangeRequest',
    referenceId: id,
    createdBy: reviewerCollaboratorId,
    excludeIds: [reviewerCollaboratorId],
  });

  return mapProfileChangeRequest(rows[0]);
}

async function deleteBaseEntity(entityName: keyof typeof ENTITY_CONFIG, id: string) {
  const config = ENTITY_CONFIG[entityName];
  await runSql(`delete from ${config.schema}.${config.table} where id = $1;`, [id]);
  return { success: true };
}

async function deleteDocument(authClient: ReturnType<typeof createClient>, id: string, collaboratorId: string | null) {
  const rows = await runSql<Record<string, unknown>>(
    'select * from gestao_intranet.documentos where id = $1 limit 1;',
    [id],
  );
  const document = rows[0];

  await notifyDocumentAudience(document, 'deleted', collaboratorId);
  await deleteBaseEntity('Document', id);

  if (document?.arquivo_path) {
    await deleteStorageFile(
      authClient,
      document.arquivo_path,
      resolveDocumentStorageBucket(document),
    );
  }

  return { success: true };
}

async function deleteAnnouncement(
  authClient: ReturnType<typeof createClient>,
  user: Record<string, unknown>,
  collaboratorId: string | null,
  id: string,
) {
  const rows = await runSql<Record<string, unknown>>(
    'select * from gestao_intranet.avisos where id = $1 limit 1;',
    [id],
  );
  const announcement = rows[0];
  assertAnnouncementOwnerOrAdmin(user, collaboratorId, announcement);

  await notifyAnnouncementAudience(announcement, 'deleted', collaboratorId);
  await deleteBaseEntity('Announcement', id);

  if (announcement?.imagem_path) {
    await deleteStorageFile(
      authClient,
      announcement.imagem_path,
      resolveAnnouncementStorageBucket(announcement),
    );
  }

  return { success: true };
}

async function deleteCalendarEvent(
  user: Record<string, unknown>,
  collaboratorId: string | null,
  id: string,
) {
  const rows = await runSql<Record<string, unknown>>(
    'select * from gestao_intranet.eventos_calendario where id = $1 limit 1;',
    [id],
  );
  const event = rows[0];
  assertCalendarEventOwnerOrAdmin(user, collaboratorId, event);

  const participantsMap = await fetchCalendarParticipants([id]);
  await notifyCalendarAudience(event, participantsMap.get(id) || [], 'deleted', collaboratorId);
  await deleteBaseEntity('CalendarEvent', id);
  return { success: true };
}

async function listEntity(
  entity: string,
  orderBy?: string,
  limit?: number,
  user?: Record<string, unknown>,
  filters: Record<string, unknown> = {},
) {
  switch (entity) {
    case 'Announcement':
      return listAnnouncements(orderBy, limit, {
        includeInactive: Boolean(filters.include_inactive) && Boolean(user) && canEditModule(user as Record<string, unknown>, 'avisos'),
        filters,
      });
    case 'HomeAnnouncement':
      return listHomeAnnouncements(limit);
    case 'AnnouncementComment':
      return listAnnouncementComments({}, orderBy, limit);
    case 'AnnouncementReaction':
      return listAnnouncementReactions({}, orderBy, limit);
    case 'CalendarEvent':
      return listCalendarEvents(orderBy, limit);
    case 'UpcomingCalendarEvent':
      return listUpcomingCalendarEvents(limit || 2);
    case 'Document':
      return listDocuments(orderBy, limit, user);
    case 'DocumentStorageOrphan':
      return listDocumentStorageOrphans(user);
    case 'Profile':
      return [await getCurrentProfile(user as Record<string, unknown>)];
    case 'ProfileChangeRequest':
      return listProfileChangeRequests(user as Record<string, unknown>);
    case 'Employee':
      return listEmployees();
    case 'EmployeeBirthday':
      return listEmployeeBirthdays(limit);
    case 'Feedback':
      return listFeedback(orderBy, limit);
    case 'KnowledgeBase':
      return listKnowledgeBase(orderBy, limit);
    case 'DashboardQuickLink':
      return listDashboardQuickLinks(limit || 6);
    case 'QuickLink':
      return listQuickLinks(orderBy, limit);
    case 'User':
      return listUsers();
    case 'UserPermission':
      return listUserPermissions(orderBy, limit);
    case 'TrustedIpAccess':
      return listTrustedIpAccesses(orderBy, limit);
    default:
      throw new Error('Entidade invalida.');
  }
}

function getEntityModule(entity: string) {
  switch (entity) {
    case 'Announcement':
    case 'HomeAnnouncement':
    case 'AnnouncementComment':
    case 'AnnouncementReaction':
      return 'avisos';
    case 'CalendarEvent':
    case 'UpcomingCalendarEvent':
      return 'calendario';
    case 'Document':
    case 'DocumentStorageOrphan':
      return 'documentos';
    case 'Profile':
    case 'ProfileAvatar':
    case 'ProfileSignature':
      return null;
    case 'ProfileChangeRequest':
      return 'admin';
    case 'Employee':
    case 'EmployeeBirthday':
    case 'User':
      return 'colaboradores';
    case 'Feedback':
      return 'feedback';
    case 'KnowledgeBase':
      return 'conhecimento';
    case 'DashboardQuickLink':
    case 'QuickLink':
      return 'links';
    case 'UserPermission':
    case 'TrustedIpAccess':
      return 'admin';
    default:
      return null;
  }
}

async function filterEntity(
  entity: string,
  filters: Record<string, unknown>,
  orderBy?: string,
  limit?: number,
  user?: Record<string, unknown>,
) {
  switch (entity) {
    case 'Announcement':
      return listEntity(entity, orderBy, limit, user, filters);
    case 'AnnouncementComment':
      return listAnnouncementComments(filters, orderBy, limit);
    case 'AnnouncementReaction':
      return listAnnouncementReactions(filters, orderBy, limit);
    case 'Document':
      return listDocuments(orderBy, limit, user, filters);
    case 'UserPermission':
      return filterUserPermissions(filters, orderBy, limit);
    default:
      return listEntity(entity, orderBy, limit, user, filters);
  }
}

async function createEntity(entity: string, payload: Record<string, unknown>, collaboratorId: string | null) {
  switch (entity) {
    case 'Announcement':
      return createAnnouncement(payload, collaboratorId);
    case 'AnnouncementComment':
      return createComment(payload, collaboratorId);
    case 'AnnouncementReaction':
      return createReaction(payload, collaboratorId);
    case 'CalendarEvent':
      return createCalendarEvent(payload, collaboratorId);
    case 'Document':
      return createDocument(payload, collaboratorId);
    case 'Feedback':
      return createFeedback(payload, collaboratorId);
    case 'KnowledgeBase':
      return createKnowledgeBase(payload, collaboratorId);
    case 'QuickLink':
      return createQuickLink(payload, collaboratorId);
    case 'UserPermission':
      return createUserPermission(payload);
    case 'TrustedIpAccess':
      return createTrustedIpAccess(payload);
    default:
      throw new Error('Criacao nao suportada para esta entidade.');
  }
}

async function updateEntity(
  authClient: ReturnType<typeof createClient>,
  user: Record<string, unknown>,
  collaboratorId: string | null,
  entity: string,
  id: string,
  payload: Record<string, unknown>,
) {
  switch (entity) {
    case 'Announcement':
      return updateAnnouncement(authClient, user, collaboratorId, id, payload);
    case 'CalendarEvent':
      return updateCalendarEvent(user, collaboratorId, id, payload);
    case 'Document':
      return updateDocument(authClient, id, payload, collaboratorId);
    case 'Profile':
      return updateCurrentProfile(user, payload);
    case 'ProfileAvatar':
      return updateCurrentAvatar(user, payload);
    case 'ProfileSignature':
      return updateCurrentSignature(user, payload);
    case 'ProfileChangeRequest':
      return updateProfileChangeRequest(user, collaboratorId, id, payload);
    case 'Employee':
      return updateEmployee(id, payload);
    case 'Feedback':
      return updateFeedback(id, payload, collaboratorId);
    case 'KnowledgeBase':
      return updateKnowledgeBase(id, payload);
    case 'QuickLink':
      return updateQuickLink(id, payload);
    case 'UserPermission':
      return updateUserPermission(id, payload);
    case 'TrustedIpAccess':
      return updateTrustedIpAccess(id, payload);
    default:
      throw new Error('Atualizacao nao suportada para esta entidade.');
  }
}

async function deleteEntity(
  authClient: ReturnType<typeof createClient>,
  user: Record<string, unknown>,
  collaboratorId: string | null,
  entity: string,
  id: string,
) {
  switch (entity) {
    case 'Announcement':
      return deleteAnnouncement(authClient, user, collaboratorId, id);
    case 'AnnouncementComment':
      return deleteBaseEntity('AnnouncementComment', id);
    case 'AnnouncementReaction':
      return deleteBaseEntity('AnnouncementReaction', id);
    case 'CalendarEvent':
      return deleteCalendarEvent(user, collaboratorId, id);
    case 'Document':
      return deleteDocument(authClient, id, collaboratorId);
    case 'Employee':
      return deleteEmployee(id);
    case 'Feedback':
      return deleteBaseEntity('Feedback', id);
    case 'KnowledgeBase':
      return deleteBaseEntity('KnowledgeBase', id);
    case 'QuickLink':
      return deleteBaseEntity('QuickLink', id);
    case 'UserPermission':
      return deleteBaseEntity('UserPermission', id);
    case 'TrustedIpAccess':
      return deleteBaseEntity('TrustedIpAccess', id);
    default:
      throw new Error('Remocao nao suportada para esta entidade.');
  }
}

Deno.serve(async (request) => {
  const corsHeaders = buildCorsHeaders(request);
  const json = (data: unknown, status = 200) => jsonResponse(data, status, corsHeaders);

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!supabaseUrl || !supabaseAnonKey || !sql) {
      return json({ error: 'Secrets da function nao configurados.' }, 500);
    }

    if (request.method === 'GET') {
      const url = new URL(request.url);
      if (url.searchParams.has('code') && url.searchParams.has('state')) {
        return handleGoogleOAuthCallback(request);
      }
      return json({ error: 'Metodo invalido.' }, 405);
    }

    const body = await request.json().catch(() => ({}));
    const authHeader = request.headers.get('Authorization') || '';
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    const action = String(body.action || '');
    const resource = typeof body.resource === 'string' ? body.resource : '';
    const entity = typeof body.entity === 'string' ? body.entity : '';
    const orderBy = typeof body.orderBy === 'string' ? body.orderBy : undefined;
    const limit = typeof body.limit === 'number' ? body.limit : undefined;
    const offset = typeof body.offset === 'number' && body.offset >= 0 ? body.offset : 0;
    const id = typeof body.id === 'string' ? body.id : '';
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
    const filters = body.filters && typeof body.filters === 'object' ? body.filters : {};
    const catalog = typeof body.catalog === 'string' ? body.catalog : '';

    const context = !authError && user
      ? await getContext({
          id: user.id,
          email: user.email,
          user_metadata: user.user_metadata,
        })
      : await getTrustedIpContext(request);

    if (!context) {
      return json({ error: 'Nao autenticado.', code: 'auth_required' }, 401);
    }

    if (action === 'me' || action === 'trustedIpAccess') {
      if (action === 'me') {
        await registrarAcessoIntranet(context.collaboratorId, request);
      }
      return json({ user: context.user });
    }

    if (action === 'clear_password_change_required') {
      await runSql(
        'update public.colaboradores set precisa_trocar_senha = false, atualizado_em = now() where id = $1;',
        [context.collaboratorId],
      );
      return json({ success: true });
    }

    if (resource === 'notifications') {
      if (action === 'list') {
        return json({ data: await listNotifications(context.collaboratorId, limit || 20) });
      }
      if (action === 'mark_read') {
        return json({ data: await markNotificationRead(context.collaboratorId, id || String(payload.id || '')) });
      }
      if (action === 'mark_all_read') {
        return json({ data: await markAllNotificationsRead(context.collaboratorId) });
      }
      return json({ error: 'Acao de notificacao invalida.' }, 400);
    }

    if (resource === 'googleCalendar') {
      if (action === 'status') {
        return json({ data: await getGoogleCalendarStatus(context.collaboratorId) });
      }
      if (action === 'start') {
        return json({ data: await startGoogleCalendarOAuth(request, context.collaboratorId, payload.redirect_to) });
      }
      if (action === 'disconnect') {
        return json({ data: await disconnectGoogleCalendar(context.collaboratorId) });
      }
      return json({ error: 'Acao Google Calendar invalida.' }, 400);
    }

    if (resource === 'accessLogs') {
      assertAdmin(context.user as Record<string, unknown>);
      if (action === 'list') {
        return json(await listAccessLogsIntranet(limit || 25, offset));
      }
      return json({ error: 'Acao de log de acesso invalida.' }, 400);
    }

    if (resource === 'possessionTerms') {
      if (action === 'list') {
        return json({ rows: await listPossessionTermsForCollaborator(context.collaboratorId) });
      }
      if (action === 'sign') {
        return json(await signPossessionTermAsCollaborator(context.collaboratorId, {
          termoId: String(body.termo_id || ''),
          pdfBase64: String(body.pdf_base64 || ''),
        }));
      }
      return json({ error: 'Acao de termo de posse invalida.' }, 400);
    }

    if (resource === 'birthdayTemplate') {
      assertAdmin(context.user as Record<string, unknown>);
      if (action === 'get') {
        return json({ data: await getBirthdayTemplate() });
      }
      if (action === 'save') {
        return json({ data: await saveBirthdayTemplate(authClient, payload as Record<string, unknown>, context.collaboratorId) });
      }
      return json({ error: 'Acao de template de aniversario invalida.' }, 400);
    }

    if (resource === 'employeeNotifications') {
      assertModuleEdit(context.user as Record<string, unknown>, 'colaboradores');
      if (action === 'list') {
        const email = typeof body.email === 'string' ? body.email.trim() : '';
        if (!email) {
          return json({ error: 'E-mail do colaborador e obrigatorio.' }, 400);
        }
        return json(await listEmployeeNotifications(email, limit || 20, offset));
      }
      return json({ error: 'Acao de notificacoes de colaborador invalida.' }, 400);
    }

    if (action === 'catalog') {
      if (catalog === 'departments') {
        return json({ rows: await listDepartments() });
      }

      if (catalog === 'units') {
        return json({ rows: await listUnits() });
      }

      if (catalog === 'positions') {
        return json({ rows: await listPositions() });
      }

      if (catalog === 'companies') {
        return json({ rows: await listCompanies() });
      }

      return json({ error: 'Catalogo invalido.' }, 400);
    }

    if (action === 'list') {
      const moduleKey = getEntityModule(entity);
      if (moduleKey === 'admin') {
        assertAdmin(context.user as Record<string, unknown>);
      } else if (moduleKey) {
        assertModuleView(context.user as Record<string, unknown>, moduleKey);
      }
      return json({ rows: await listEntity(entity, orderBy, limit, context.user as Record<string, unknown>) });
    }

    if (action === 'filter') {
      const moduleKey = getEntityModule(entity);
      if (moduleKey === 'admin') {
        assertAdmin(context.user as Record<string, unknown>);
      } else if (moduleKey) {
        assertModuleView(context.user as Record<string, unknown>, moduleKey);
      }
      return json({
        rows: await filterEntity(
          entity,
          filters as Record<string, unknown>,
          orderBy,
          limit,
          context.user as Record<string, unknown>,
        ),
      });
    }

    if (action === 'create') {
      const moduleKey = getEntityModule(entity);
      if (entity === 'AnnouncementComment' || entity === 'AnnouncementReaction') {
        assertModuleView(context.user as Record<string, unknown>, 'avisos');
      } else if (entity === 'Feedback') {
        assertModuleView(context.user as Record<string, unknown>, 'feedback');
      } else if (moduleKey === 'admin') {
        assertAdmin(context.user as Record<string, unknown>);
      } else if (moduleKey) {
        assertModuleEdit(context.user as Record<string, unknown>, moduleKey);
      }
      return json({ row: await createEntity(entity, payload as Record<string, unknown>, context.collaboratorId) });
    }

    if (action === 'update') {
      if (!id) return json({ error: 'ID obrigatorio.' }, 400);
      const moduleKey = getEntityModule(entity);
      if (moduleKey === 'admin') {
        assertAdmin(context.user as Record<string, unknown>);
      } else if (moduleKey) {
        assertModuleEdit(context.user as Record<string, unknown>, moduleKey);
      }
      return json({
        row: await updateEntity(
          authClient,
          context.user as Record<string, unknown>,
          context.collaboratorId,
          entity,
          id,
          payload as Record<string, unknown>,
        ),
      });
    }

    if (action === 'delete') {
      if (!id) return json({ error: 'ID obrigatorio.' }, 400);
      const moduleKey = getEntityModule(entity);
      if (entity === 'AnnouncementReaction') {
        assertModuleView(context.user as Record<string, unknown>, 'avisos');
        const reactionRows = await runSql<Record<string, unknown>>(
          'select criado_por from gestao_intranet.reacoes_avisos where id = $1 limit 1;',
          [id],
        );
        const reactionRow = reactionRows[0];
        const isOwner = reactionRow && String(reactionRow.criado_por) === String(context.collaboratorId);
        if (reactionRow && !isOwner && (context.user as Record<string, unknown>).role !== 'admin') {
          return json({ error: 'Voce so pode remover suas proprias reacoes.' }, 403);
        }
      } else if (moduleKey === 'admin') {
        assertAdmin(context.user as Record<string, unknown>);
      } else if (moduleKey) {
        assertModuleEdit(context.user as Record<string, unknown>, moduleKey);
      }
      return json(await deleteEntity(
        authClient,
        context.user as Record<string, unknown>,
        context.collaboratorId,
        entity,
        id,
      ));
    }

    return json({ error: 'Acao invalida.' }, 400);
  } catch (error) {
    const hasKnownStatus = typeof (error as { status?: unknown })?.status === 'number';
    if (!hasKnownStatus) {
      console.error('intranet-api error:', error);
    }
    return json(
      {
        error: hasKnownStatus ? normalizeError(error) : 'Erro ao processar a solicitacao.',
        code: getErrorCode(error),
      },
      getErrorStatus(error),
    );
  }
});

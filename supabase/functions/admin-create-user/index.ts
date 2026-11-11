import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { adminCreateUserBodySchema } from '../_shared/validation.ts';

const databaseUrl = Deno.env.get('DATABASE_URL');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const sql = databaseUrl
  ? postgres(databaseUrl, {
      prepare: false,
      max: 3,
      idle_timeout: 5,
      connect_timeout: 15,
    })
  : null;

function generateTemporaryPassword(length = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });
}

function normalizePayload(payload: Record<string, unknown> = {}) {
  const fields = ['nome', 'email', 'funcao', 'cpf', 'telefone', 'departamento_id', 'cargo_id', 'cargo', 'data_nascimento', 'data_admissao', 'status', 'unidade_id', 'empresa_id'];
  const normalized = fields.reduce<Record<string, unknown>>((acc, field) => {
    if (field in payload) {
      acc[field] = payload[field];
    }
    return acc;
  }, {});

  if (typeof normalized.email === 'string') {
    normalized.email = normalized.email.trim().toLowerCase() || null;
  }

  if (typeof normalized.telefone === 'string') {
    normalized.telefone = normalizeDigits(normalized.telefone.trim()) || null;
  }

  if (typeof normalized.cpf === 'string') {
    normalized.cpf = normalizeDigits(normalized.cpf.trim()) || null;
  }

  return normalized;
}

function normalizeDigits(value: string | null) {
  return value ? value.replace(/\D/g, '') : null;
}

async function validateUniqueCollaboratorFields(payload: Record<string, unknown>) {
  if (!sql) return;

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
  const telefone = typeof payload.telefone === 'string' ? payload.telefone.trim() : null;
  const cpf = normalizeDigits(typeof payload.cpf === 'string' ? payload.cpf.trim() : null);

  if (email) {
    const emailRows = await sql.unsafe(
      'select id from public.colaboradores where lower(trim(email)) = lower(trim($1)) limit 1;',
      [email],
    );

    if (emailRows[0]) {
      throw new Error('Ja existe um colaborador com este email.');
    }
  }

  if (cpf) {
    const cpfRows = await sql.unsafe(
      "select id from public.colaboradores where regexp_replace(coalesce(cpf, ''), '\\D', '', 'g') = $1 limit 1;",
      [cpf],
    );

    if (cpfRows[0]) {
      throw new Error('Ja existe um colaborador com este CPF.');
    }
  }

  if (telefone) {
    const phoneRows = await sql.unsafe(
      'select id from public.colaboradores where telefone = $1 limit 1;',
      [telefone],
    );

    if (phoneRows[0]) {
      throw new Error('Ja existe um colaborador com este telefone.');
    }
  }
}

function validateCollaboratorDocumentFields(payload: Record<string, unknown>) {
  const cpf = typeof payload.cpf === 'string' ? payload.cpf : null;
  const telefone = typeof payload.telefone === 'string' ? payload.telefone : null;

  if (cpf && cpf.length !== 11) {
    throw new Error('CPF deve conter exatamente 11 digitos.');
  }

  if (telefone && telefone.length !== 11) {
    throw new Error('Telefone deve conter exatamente 11 digitos.');
  }
}

function mapDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');

  if (message.includes('already been registered') || message.includes('User already registered')) {
    return 'Ja existe um colaborador com este email.';
  }

  if (message.includes('colaboradores_cpf_key')) {
    return 'Ja existe um colaborador com este CPF.';
  }

  if (message.includes('colaboradores_email_unique_idx')) {
    return 'Ja existe um colaborador com este email.';
  }

  if (message.includes('colaboradores_telefone_unique_idx')) {
    return 'Ja existe um colaborador com este telefone.';
  }

  return message || 'Erro interno.';
}

function getErrorStatus(error: unknown) {
  const message = mapDatabaseError(error);

  if (
    message === 'Ja existe um colaborador com este CPF.' ||
    message === 'Ja existe um colaborador com este email.' ||
    message === 'Ja existe um colaborador com este telefone.' ||
    message === 'CPF deve conter exatamente 11 digitos.' ||
    message === 'Telefone deve conter exatamente 11 digitos.'
  ) {
    return 400;
  }

  return 500;
}

async function fetchRowById(schema: string, table: string, id: string) {
  if (!sql) return null;

  const rows = await sql.unsafe(
    `select * from ${schema}.${table} where id = $1 limit 1;`,
    [id],
  );

  return rows[0] || null;
}

async function resolveAuthenticatedCollaborator(authUser: { id: string; email?: string | null }) {
  if (!sql) return null;

  const byIdRows = await sql.unsafe('select * from public.colaboradores where id = $1 limit 1;', [authUser.id]);
  if (byIdRows[0]) {
    return byIdRows[0];
  }

  const normalizedEmail = typeof authUser.email === 'string' ? authUser.email.trim().toLowerCase() : null;
  if (!normalizedEmail) {
    return null;
  }

  const byEmailRows = await sql.unsafe(
    'select * from public.colaboradores where lower(trim(email)) = lower(trim($1)) limit 1;',
    [normalizedEmail],
  );

  return byEmailRows[0] || null;
}

async function canManageCentralCollaborators(collaborator: Record<string, unknown> | null) {
  if (!sql || !collaborator) return false;

  if (collaborator.status === 'inativo') {
    return false;
  }

  if (collaborator.funcao === 'admin') {
    return true;
  }

  if (collaborator.funcao !== 'gestor') {
    return false;
  }

  const rows = await sql.unsafe(
    `
      select 1
      from gestao_ativos.permissoes_central
      where funcao = 'gestor'
        and modulo = 'colaboradores'
        and nivel_acesso = 'gerenciar'
      limit 1;
    `,
  );

  return Boolean(rows[0]);
}

function buildCentralCollaboratorAuditMetadata({
  before,
  after,
  baseMetadata = {},
}: {
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  baseMetadata?: Record<string, unknown>;
}) {
  return {
    origem: 'central',
    colaborador_id_afetado: after?.id ?? before?.id ?? null,
    colaborador_nome_afetado: typeof (after?.nome ?? before?.nome) === 'string' ? after?.nome ?? before?.nome : null,
    colaborador_email_afetado: typeof (after?.email ?? before?.email) === 'string' ? after?.email ?? before?.email : null,
    funcao_anterior: before?.funcao ?? null,
    funcao_nova: after?.funcao ?? null,
    status_anterior: before?.status ?? null,
    status_novo: after?.status ?? null,
    unidade_id_anterior: before?.unidade_id ?? null,
    unidade_id_nova: after?.unidade_id ?? null,
    departamento_id_anterior: before?.departamento_id ?? null,
    departamento_id_novo: after?.departamento_id ?? null,
    ...baseMetadata,
  };
}

async function insertCentralAuditLog({
  action,
  entity,
  recordId,
  responsibleCollaboratorId,
  responsibleEmail,
  before,
  after,
  metadata = {},
}: {
  action: 'criar' | 'atualizar' | 'excluir' | 'redefinir_senha' | 'desvincular' | 'importar';
  entity: string;
  recordId?: string | null;
  responsibleCollaboratorId?: string | null;
  responsibleEmail?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}) {
  if (!sql) return;

  await sql.unsafe(
    `
      insert into gestao_ativos.logs_auditoria (
        entidade,
        acao,
        registro_id,
        responsavel_colaborador_id,
        responsavel_email,
        antes,
        depois,
        metadados
      )
      values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb);
    `,
    [
      entity,
      action,
      recordId ?? null,
      responsibleCollaboratorId ?? null,
      responsibleEmail ?? null,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      JSON.stringify(metadata || {}),
    ],
  );
}

Deno.serve(async (request) => {
  const corsHeaders = buildCorsHeaders(request);
  const json = (data: unknown, status = 200) => jsonResponse(data, status, corsHeaders);

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !sql) {
      return json({ error: 'Secrets da function nao configurados.' }, 500);
    }

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

    if (authError || !user) {
      return json({ error: 'Nao autenticado.' }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const rawBody = await request.json().catch(() => ({}));
    const parsedBody = adminCreateUserBodySchema.safeParse(rawBody);

    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0];
      const field = issue?.path?.join('.') || 'payload';
      return json({ error: `Campo invalido: ${field}.` }, 400);
    }

    const body = parsedBody.data;
    const action = String(body.action || 'create');
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const collaboratorId = String(body.id || '').trim();
    const payload = normalizePayload(body);

    const responsibleCollaborator = await resolveAuthenticatedCollaborator(user);
    const responsibleCollaboratorId = responsibleCollaborator?.id || user.id;
    const responsibleEmail = responsibleCollaborator?.email || user.email || null;
    const isAdmin = responsibleCollaborator?.funcao === 'admin' && responsibleCollaborator?.status !== 'inativo';
    const canManageCollaborators = await canManageCentralCollaborators(responsibleCollaborator);

    if (!canManageCollaborators) {
      return json({ error: 'Apenas administradores podem gerenciar colaboradores.' }, 403);
    }

    if (action === 'delete') {
      if (!collaboratorId) {
        return json({ error: 'ID obrigatorio.' }, 400);
      }

      if (collaboratorId === user.id) {
        return json({ error: 'Voce nao pode excluir seu proprio usuario por aqui.' }, 400);
      }

      const beforeRow = await fetchRowById('public', 'colaboradores', collaboratorId);

      if (!beforeRow) {
        return json({ error: 'Colaborador nao encontrado.' }, 404);
      }

      if (!isAdmin && (beforeRow.funcao === 'admin' || beforeRow.funcao === 'gestor')) {
        return json({ error: 'Apenas administradores podem excluir colaboradores admin ou gestor.' }, 403);
      }

      await sql.unsafe('delete from public.colaboradores where id = $1;', [collaboratorId]);

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(collaboratorId);
      if (deleteError) {
        return json({ error: deleteError.message || 'Falha ao excluir usuario no Auth.' }, 400);
      }

      await insertCentralAuditLog({
        action: 'excluir',
        entity: 'colaboradores',
        recordId: collaboratorId,
        responsibleCollaboratorId,
        responsibleEmail,
        before: beforeRow,
        after: null,
        metadata: buildCentralCollaboratorAuditMetadata({
          before: beforeRow,
          after: null,
        }),
      });

      return json({ success: true });
    }

    if (action === 'update_password') {
      if (!collaboratorId) {
        return json({ error: 'ID obrigatorio.' }, 400);
      }

      if (!password || password.length < 6) {
        return json({ error: 'Senha obrigatoria com pelo menos 6 caracteres.' }, 400);
      }

      const collaboratorRow = await fetchRowById('public', 'colaboradores', collaboratorId);

      if (!collaboratorRow) {
        return json({ error: 'Colaborador nao encontrado.' }, 404);
      }

      if (!isAdmin && (collaboratorRow.funcao === 'admin' || collaboratorRow.funcao === 'gestor')) {
        return json({ error: 'Apenas administradores podem redefinir senha de colaboradores admin ou gestor.' }, 403);
      }

      const { error: updatePasswordError } = await adminClient.auth.admin.updateUserById(collaboratorId, {
        password,
      });

      if (updatePasswordError) {
        return json({ error: updatePasswordError.message || 'Falha ao atualizar senha no Auth.' }, 400);
      }

      await sql.unsafe(
        'update public.colaboradores set precisa_trocar_senha = true, atualizado_em = now() where id = $1;',
        [collaboratorId],
      );

      await insertCentralAuditLog({
        action: 'redefinir_senha',
        entity: 'colaboradores',
        recordId: collaboratorId,
        responsibleCollaboratorId,
        responsibleEmail,
        before: collaboratorRow,
        after: collaboratorRow,
        metadata: buildCentralCollaboratorAuditMetadata({
          before: collaboratorRow,
          after: collaboratorRow,
          baseMetadata: {
            tipo: 'reset_manual',
          },
        }),
      });

      return json({ success: true });
    }

    if (action === 'update_email') {
      if (!collaboratorId) {
        return json({ error: 'ID obrigatorio.' }, 400);
      }

      if (!email) {
        return json({ error: 'Novo email obrigatorio.' }, 400);
      }

      const collaboratorRow = await fetchRowById('public', 'colaboradores', collaboratorId);

      if (!collaboratorRow) {
        return json({ error: 'Colaborador nao encontrado.' }, 404);
      }

      if (!isAdmin && (collaboratorRow.funcao === 'admin' || collaboratorRow.funcao === 'gestor')) {
        return json({ error: 'Apenas administradores podem alterar email de colaboradores admin ou gestor.' }, 403);
      }

      const emailRows = await sql.unsafe(
        'select id from public.colaboradores where lower(trim(email)) = lower(trim($1)) and id <> $2 limit 1;',
        [email, collaboratorId],
      );

      if (emailRows[0]) {
        return json({ error: 'Ja existe um colaborador com este email.' }, 400);
      }

      const shouldResetPassword = body.reset_password === true;
      const generatedPassword = shouldResetPassword ? generateTemporaryPassword() : null;

      const updateAuthPayload: Record<string, unknown> = {
        email,
        email_confirm: true,
      };

      if (generatedPassword) {
        updateAuthPayload.password = generatedPassword;
      }

      const { error: updateEmailError } = await adminClient.auth.admin.updateUserById(collaboratorId, updateAuthPayload);

      if (updateEmailError) {
        return json({ error: mapDatabaseError(updateEmailError.message || 'Falha ao atualizar email no Auth.') }, 400);
      }

      const rows = await sql.unsafe(
        `
          update public.colaboradores
          set email = $2, precisa_trocar_senha = coalesce($3, precisa_trocar_senha), atualizado_em = now()
          where id = $1
          returning *;
        `,
        [collaboratorId, email, shouldResetPassword ? true : null],
      );

      await insertCentralAuditLog({
        action: 'atualizar',
        entity: 'colaboradores',
        recordId: collaboratorId,
        responsibleCollaboratorId,
        responsibleEmail,
        before: collaboratorRow,
        after: rows[0] || null,
        metadata: buildCentralCollaboratorAuditMetadata({
          before: collaboratorRow,
          after: rows[0] || null,
          baseMetadata: {
            campo: 'email',
            email_anterior: collaboratorRow.email || null,
            email_novo: email,
            senha_redefinida: shouldResetPassword,
          },
        }),
      });

      return json({ row: rows[0] || null, generated_password: generatedPassword });
    }

    if (action === 'unlink_assignments') {
      if (!collaboratorId) {
        return json({ error: 'ID obrigatorio.' }, 400);
      }

      const collaboratorRows = await sql.unsafe(
        'select * from public.colaboradores where id = $1 limit 1;',
        [collaboratorId],
      );

      const collaborator = collaboratorRows[0];

      if (!collaborator) {
        return json({ error: 'Colaborador nao encontrado.' }, 404);
      }

      if (collaborator.status !== 'inativo') {
        return json({ error: 'So e permitido desvincular itens de colaboradores inativos.' }, 400);
      }

      const updatedAssets = await sql.unsafe(
        `
          update gestao_ativos.ativos
          set
            usuario_id = null,
            status = 'disponivel',
            atualizado_em = now()
          where usuario_id = $1
          returning id;
        `,
        [collaboratorId],
      );

      const updatedLines = await sql.unsafe(
        `
          update gestao_ativos.linhas_corporativas
          set
            colaborador_id = null,
            status = 'disponivel',
            atualizado_em = now()
          where colaborador_id = $1
          returning id;
        `,
        [collaboratorId],
      );

      const removedSystemAccesses = await sql.unsafe(
        `
          delete from public.acessos_usuario_sistema
          where colaborador_id = $1
          returning id;
        `,
        [collaboratorId],
      );

      await insertCentralAuditLog({
        action: 'desvincular',
        entity: 'colaboradores',
        recordId: collaboratorId,
        responsibleCollaboratorId,
        responsibleEmail,
        before: collaborator,
        after: collaborator,
        metadata: buildCentralCollaboratorAuditMetadata({
          before: collaborator,
          after: collaborator,
          baseMetadata: {
            ativos_count: updatedAssets.length,
            linhas_count: updatedLines.length,
            sistemas_count: removedSystemAccesses.length,
            total_count: updatedAssets.length + updatedLines.length + removedSystemAccesses.length,
          },
        }),
      });

      return json({
        success: true,
        ativos_count: updatedAssets.length,
        linhas_count: updatedLines.length,
        sistemas_count: removedSystemAccesses.length,
        total_count: updatedAssets.length + updatedLines.length + removedSystemAccesses.length,
      });
    }

    if (action !== 'create') {
      return json({ error: 'Acao invalida.' }, 400);
    }

    if (!isAdmin && (payload.funcao === 'admin' || payload.funcao === 'gestor')) {
      return json({ error: 'Apenas administradores podem criar colaboradores admin ou gestor.' }, 403);
    }

    if (!email) {
      return json({ error: 'Email obrigatorio.' }, 400);
    }

    const generatedPassword = generateTemporaryPassword();

    validateCollaboratorDocumentFields(payload);
    await validateUniqueCollaboratorFields({ email, telefone: payload.telefone, cpf: payload.cpf });

    const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: {
        full_name: payload.nome || email.split('@')[0],
        funcao: payload.funcao || 'usuario',
      },
    });

    if (createError || !createdUser.user) {
      return json({ error: mapDatabaseError(createError?.message || 'Falha ao criar usuario no Auth.') }, 400);
    }

    try {
      const upsertPayload = {
        nome: payload.nome || email.split('@')[0],
        email,
        funcao: payload.funcao || 'usuario',
        cpf: payload.cpf ?? null,
        telefone: payload.telefone ?? null,
        departamento_id: payload.departamento_id ?? null,
        cargo_id: payload.cargo_id ?? null,
        cargo: payload.cargo ?? null,
        data_nascimento: payload.data_nascimento ?? null,
        data_admissao: payload.data_admissao ?? null,
        status: payload.status || 'ativo',
        unidade_id: payload.unidade_id ?? null,
        empresa_id: payload.empresa_id ?? null,
      };

      const rows = await sql.unsafe(
        `
          insert into public.colaboradores (
            id,
            nome,
            email,
            funcao,
            cpf,
            telefone,
            departamento_id,
            cargo_id,
            cargo,
            data_nascimento,
            data_admissao,
            status,
            unidade_id,
            empresa_id,
            precisa_trocar_senha
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true)
          on conflict (id) do update
          set
            nome = excluded.nome,
            email = excluded.email,
            funcao = excluded.funcao,
            cpf = excluded.cpf,
            telefone = excluded.telefone,
            departamento_id = excluded.departamento_id,
            cargo_id = excluded.cargo_id,
            cargo = excluded.cargo,
            data_nascimento = excluded.data_nascimento,
            data_admissao = excluded.data_admissao,
            status = excluded.status,
            unidade_id = excluded.unidade_id,
            empresa_id = excluded.empresa_id,
            precisa_trocar_senha = true,
            atualizado_em = now()
          returning *;
        `,
        [
          createdUser.user.id,
          upsertPayload.nome,
          upsertPayload.email,
          upsertPayload.funcao,
          upsertPayload.cpf,
          upsertPayload.telefone,
          upsertPayload.departamento_id,
          upsertPayload.cargo_id,
          upsertPayload.cargo,
          upsertPayload.data_nascimento,
          upsertPayload.data_admissao,
          upsertPayload.status,
          upsertPayload.unidade_id,
          upsertPayload.empresa_id,
        ],
      );

      await insertCentralAuditLog({
        action: 'criar',
        entity: 'colaboradores',
        recordId: rows[0]?.id || createdUser.user.id,
        responsibleCollaboratorId,
        responsibleEmail,
        before: null,
        after: rows[0] || null,
        metadata: buildCentralCollaboratorAuditMetadata({
          before: null,
          after: rows[0] || null,
        }),
      });

      return json({ row: rows[0] || null, generated_password: generatedPassword });
    } catch (dbError) {
      await adminClient.auth.admin.deleteUser(createdUser.user.id).catch(() => null);
      throw dbError;
    }
  } catch (error) {
    return json({ error: mapDatabaseError(error) }, getErrorStatus(error));
  }
});

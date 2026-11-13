import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { createSql, withTransaction } from '../_shared/db.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { CLEAR_MUST_CHANGE_PASSWORD_SQL, mapMustChangePassword } from '../_shared/auth.ts';

const SCHEMA = 'gestao_comunicacao';
const SYSTEM_SLUG = 'comunicacao';
const MAX_MENSAGEM_LENGTH = 4000;
const DEFAULT_LIST_LIMIT = 50;

const ATTACHMENTS_BUCKET = 'comunicacao-anexos';

const databaseUrl = Deno.env.get('DATABASE_URL');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const sql = databaseUrl
  ? createSql(databaseUrl, { max: 3 })
  : null;

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });
}

function createStorageAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

async function deleteAnexosStorage(paths: string[]) {
  const validPaths = paths.filter((path) => typeof path === 'string' && path.length > 0);
  if (!validPaths.length) return;

  const storageClient = createStorageAdminClient();
  if (!storageClient) {
    console.error('Storage admin client indisponivel para remover anexos:', validPaths);
    return;
  }

  const { error } = await storageClient.storage.from(ATTACHMENTS_BUCKET).remove(validPaths);
  if (error) {
    console.error('Falha ao remover anexos do storage:', { paths: validPaths, message: error.message });
  }
}

function getErrorStatus(error: unknown) {
  const status = Number((error as { status?: number })?.status);
  if (Number.isFinite(status) && status >= 400) return status;
  return 500;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Falha ao consultar a comunicacao.');
}

function parseInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

async function getAuthenticatedUser(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw Object.assign(new Error('Supabase nao configurado.'), { status: 500 });
  }

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    throw Object.assign(new Error('Sessao expirada. Faca login novamente.'), { status: 401 });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await authClient.auth.getUser();

  if (error || !data.user) {
    throw Object.assign(new Error('Sessao expirada. Faca login novamente.'), { status: 401 });
  }

  return data.user;
}

async function getCurrentCollaborator(user: { id: string; email?: string }) {
  if (!sql) return null;

  const rows = await sql.unsafe(
    `
      select *
      from public.colaboradores
      where id = $1
         or lower(email) = lower($2)
      order by case when id = $1 then 0 else 1 end
      limit 1;
    `,
    [user.id, user.email || ''],
  );

  return rows[0] || null;
}

async function getComunicacaoAccess(collaboratorId: string) {
  if (!sql) return null;

  const rows = await sql.unsafe(
    `
      select
        aus.*,
        row_to_json(s) as sistema
      from public.acessos_usuario_sistema aus
      join public.sistemas s on s.id = aus.sistema_id
      where aus.colaborador_id = $1
        and aus.ativo = true
        and s.slug = $2
        and s.ativo = true
      limit 1;
    `,
    [collaboratorId, SYSTEM_SLUG],
  );

  return rows[0] || null;
}

function ensureHasAccess(access: Record<string, unknown> | null) {
  if (!access || !['admin', 'gestor', 'usuario'].includes(String(access.nivel_acesso || ''))) {
    throw Object.assign(new Error('Seu usuario nao possui acesso liberado a Comunicacao.'), { status: 403 });
  }
}

async function ensureCanAccessCanal(canalId: string, collaboratorId: string) {
  const rows = await sql.unsafe(
    `
      select c.id
      from ${SCHEMA}.canais c
      join ${SCHEMA}.membros_canal m on m.canal_id = c.id and m.colaborador_id = $2
      where c.id = $1 and c.ativo
      limit 1;
    `,
    [canalId, collaboratorId],
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Canal nao encontrado ou voce nao e membro.'), { status: 404 });
  }
}

async function ensureCanAccessConversa(conversaId: string, collaboratorId: string) {
  const rows = await sql.unsafe(
    `
      select 1
      from ${SCHEMA}.participantes_conversa
      where conversa_id = $1 and colaborador_id = $2
      limit 1;
    `,
    [conversaId, collaboratorId],
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Conversa nao encontrada ou sem permissao.'), { status: 404 });
  }
}

async function resolveMencoes(candidateIds: unknown): Promise<string[]> {
  const ids = Array.isArray(candidateIds)
    ? [...new Set(candidateIds.map((id) => String(id)))].filter(Boolean)
    : [];
  if (ids.length === 0) return [];

  const rows = await sql.unsafe(
    `
      select c.id
      from public.colaboradores c
      join public.acessos_usuario_sistema aus on aus.colaborador_id = c.id
      join public.sistemas s on s.id = aus.sistema_id
      where s.slug = $1
        and s.ativo = true
        and aus.ativo = true
        and c.status = 'ativo'
        and c.id = any($2::uuid[]);
    `,
    [SYSTEM_SLUG, ids],
  );
  return rows.map((row: { id: string }) => row.id);
}

function slugify(nome: string) {
  return nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function generateUniqueCanalSlug(nome: string) {
  const base = slugify(nome) || 'canal';
  let slug = base;
  let suffix = 2;

  while (true) {
    const rows = await sql.unsafe(`select 1 from ${SCHEMA}.canais where slug = $1 limit 1;`, [slug]);
    if (!rows[0]) return slug;
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
}

function ensureCanArchiveCanal(
  canal: Record<string, unknown>,
  collaboratorId: string,
  access: Record<string, unknown> | null,
) {
  const isAdmin = access?.nivel_acesso === 'admin';
  const isOwner = canal.criado_por && String(canal.criado_por) === collaboratorId;
  if (!isAdmin && !isOwner) {
    throw Object.assign(
      new Error('Apenas o criador do canal ou um administrador pode arquiva-lo.'),
      { status: 403 },
    );
  }
}

Deno.serve(async (request) => {
  const corsHeaders = buildCorsHeaders(request);
  const json = (data: unknown, status = 200) => jsonResponse(data, status, corsHeaders);

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!sql) {
      return json({ error: 'DATABASE_URL nao configurada.' }, 500);
    }

    const user = await getAuthenticatedUser(request);
    const collaborator = await getCurrentCollaborator(user);
    const access = collaborator?.id ? await getComunicacaoAccess(String(collaborator.id)) : null;

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'me') {
      return json({ row: collaborator, access, must_change_password: mapMustChangePassword(collaborator) });
    }

    if (action === 'clear_password_change_required') {
      if (!collaborator?.id) {
        return json({ error: 'Nao autenticado.', code: 'auth_required' }, 401);
      }
      await sql.unsafe(CLEAR_MUST_CHANGE_PASSWORD_SQL, [collaborator.id]);
      return json({ success: true });
    }

    ensureHasAccess(access);

    if (action === 'list_canais') {
      const rows = await sql.unsafe(
        `
          select
            c.*,
            (mc.id is not null) as membro,
            (
              select count(*)::int
              from ${SCHEMA}.mensagens m
              where m.canal_id = c.id
                and m.excluida_em is null
                and m.autor_id <> $1
                and m.criado_em > coalesce(lm.ultima_leitura_em, '-infinity'::timestamptz)
            ) as nao_lidas,
            (
              select count(*)::int
              from ${SCHEMA}.mensagens m
              where m.canal_id = c.id
                and m.excluida_em is null
                and m.autor_id <> $1
                and m.mencoes @> array[$1]::uuid[]
                and m.criado_em > coalesce(lm.ultima_leitura_em, '-infinity'::timestamptz)
            ) as mencoes_nao_lidas
          from ${SCHEMA}.canais c
          left join ${SCHEMA}.membros_canal mc on mc.canal_id = c.id and mc.colaborador_id = $1
          left join ${SCHEMA}.leituras_mensagem lm on lm.canal_id = c.id and lm.colaborador_id = $1
          where c.ativo
          order by c.ordem asc;
        `,
        [collaborator.id],
      );
      return json({ rows });
    }

    if (action === 'marcar_lida') {
      const canalId = body.canal_id ? String(body.canal_id) : null;
      const conversaId = body.conversa_id ? String(body.conversa_id) : null;
      if (!canalId && !conversaId) {
        return json({ error: 'canal_id ou conversa_id obrigatorio.' }, 400);
      }

      if (canalId) {
        await ensureCanAccessCanal(canalId, collaborator.id);
        await sql.unsafe(
          `
            insert into ${SCHEMA}.leituras_mensagem (colaborador_id, canal_id, ultima_leitura_em, atualizado_em)
            values ($1, $2, now(), now())
            on conflict (colaborador_id, canal_id) where canal_id is not null
            do update set ultima_leitura_em = now(), atualizado_em = now();
          `,
          [collaborator.id, canalId],
        );
      } else {
        await ensureCanAccessConversa(conversaId!, collaborator.id);
        await sql.unsafe(
          `
            insert into ${SCHEMA}.leituras_mensagem (colaborador_id, conversa_id, ultima_leitura_em, atualizado_em)
            values ($1, $2, now(), now())
            on conflict (colaborador_id, conversa_id) where conversa_id is not null
            do update set ultima_leitura_em = now(), atualizado_em = now();
          `,
          [collaborator.id, conversaId],
        );
      }

      return json({ ok: true });
    }

    if (action === 'create_canal') {
      const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
      const descricao = typeof body.descricao === 'string' ? body.descricao.trim() : null;
      const icone = typeof body.icone === 'string' ? body.icone.trim() : null;

      if (!nome || nome.length > 80) {
        return json({ error: 'Nome do canal invalido.' }, 400);
      }

      const slug = await generateUniqueCanalSlug(nome);
      const row = await withTransaction(sql, async (trx) => {
        const [canal] = await trx.unsafe(
          `
            insert into ${SCHEMA}.canais (slug, nome, descricao, icone, ordem, criado_por)
            values (
              $1, $2, $3, $4,
              coalesce((select max(ordem) from ${SCHEMA}.canais where ativo), 0) + 1,
              $5
            )
            returning *;
          `,
          [slug, nome, descricao, icone, collaborator.id],
        );
        await trx.unsafe(
          `insert into ${SCHEMA}.membros_canal (canal_id, colaborador_id) values ($1, $2);`,
          [canal.id, collaborator.id],
        );
        return canal;
      });
      return json({ row: { ...row, membro: true } });
    }

    if (action === 'join_canal') {
      const canalId = String(body.canal_id || '');
      const canalRows = await sql.unsafe(
        `select id from ${SCHEMA}.canais where id = $1 and ativo limit 1;`,
        [canalId],
      );
      if (!canalRows[0]) {
        return json({ error: 'Canal nao encontrado.' }, 404);
      }

      const rows = await sql.unsafe(
        `
          insert into ${SCHEMA}.membros_canal (canal_id, colaborador_id)
          values ($1, $2)
          on conflict (canal_id, colaborador_id) do nothing
          returning *;
        `,
        [canalId, collaborator.id],
      );
      return json({ row: rows[0] || { canal_id: canalId, colaborador_id: collaborator.id } });
    }

    if (action === 'leave_canal') {
      const canalId = String(body.canal_id || '');
      await sql.unsafe(
        `delete from ${SCHEMA}.membros_canal where canal_id = $1 and colaborador_id = $2;`,
        [canalId, collaborator.id],
      );
      return json({ ok: true });
    }

    if (action === 'archive_canal') {
      const canalId = String(body.canal_id || '');
      const canalRows = await sql.unsafe(
        `select * from ${SCHEMA}.canais where id = $1 and ativo limit 1;`,
        [canalId],
      );
      const canal = canalRows[0];
      if (!canal) {
        return json({ error: 'Canal nao encontrado.' }, 404);
      }

      ensureCanArchiveCanal(canal, String(collaborator.id), access);

      const rows = await sql.unsafe(
        `update ${SCHEMA}.canais set ativo = false where id = $1 returning *;`,
        [canalId],
      );
      return json({ row: rows[0] });
    }

    if (action === 'list_mensagens') {
      const canalId = String(body.canal_id || '');
      if (!canalId) return json({ error: 'canal_id obrigatorio.' }, 400);
      await ensureCanAccessCanal(canalId, collaborator.id);

      const limit = parseInteger(body.limit, DEFAULT_LIST_LIMIT, 1, 200);
      const before = body.before ? String(body.before) : null;

      const rows = await sql.unsafe(
        `
          select
            m.*,
            json_build_object('id', c.id, 'nome', c.nome, 'email', c.email) as autor,
            case when p.id is not null then
              json_build_object(
                'id', p.id,
                'conteudo', p.conteudo,
                'excluida_em', p.excluida_em,
                'autor', json_build_object('id', pc.id, 'nome', pc.nome, 'email', pc.email)
              )
            else null end as resposta_a,
            coalesce(
              (
                select json_agg(json_build_object(
                  'id', a.id, 'nome_arquivo', a.nome_arquivo, 'tipo_mime', a.tipo_mime,
                  'tamanho_bytes', a.tamanho_bytes, 'storage_path', a.storage_path
                ) order by a.criado_em asc)
                from ${SCHEMA}.anexos_mensagem a
                where a.mensagem_id = m.id
              ),
              '[]'::json
            ) as anexos,
            coalesce(
              (
                select json_agg(json_build_object('emoji', t.emoji, 'total', t.total, 'reagiu', t.reagiu))
                from (
                  select emoji, count(*)::int as total,
                         bool_or(colaborador_id = $3) as reagiu
                  from ${SCHEMA}.reacoes_mensagem
                  where mensagem_id = m.id
                  group by emoji
                ) t
              ),
              '[]'::json
            ) as reacoes
          from ${SCHEMA}.mensagens m
          join public.colaboradores c on c.id = m.autor_id
          left join ${SCHEMA}.mensagens p on p.id = m.resposta_a_id
          left join public.colaboradores pc on pc.id = p.autor_id
          where m.canal_id = $1
            and ($2::timestamptz is null or m.criado_em < $2::timestamptz)
          order by m.criado_em desc
          limit ${limit};
        `,
        [canalId, before, collaborator.id],
      );

      return json({ rows: rows.reverse() });
    }

    if (action === 'create_mensagem') {
      const canalId = String(body.canal_id || '');
      const conteudo = typeof body.conteudo === 'string' ? body.conteudo.trim() : '';
      const anexos = Array.isArray(body.anexos) ? body.anexos : [];
      const respostaAId = body.resposta_a_id ? String(body.resposta_a_id) : null;
      if (!canalId) return json({ error: 'canal_id obrigatorio.' }, 400);
      if ((!conteudo && anexos.length === 0) || conteudo.length > MAX_MENSAGEM_LENGTH) {
        return json({ error: 'Mensagem invalida.' }, 400);
      }
      await ensureCanAccessCanal(canalId, collaborator.id);
      const mencoes = await resolveMencoes(body.mencoes);

      let respostaA = null;
      if (respostaAId) {
        const [parent] = await sql.unsafe(
          `
            select m.id, m.conteudo, m.excluida_em,
              json_build_object('id', c.id, 'nome', c.nome, 'email', c.email) as autor
            from ${SCHEMA}.mensagens m
            join public.colaboradores c on c.id = m.autor_id
            where m.id = $1 and m.canal_id = $2 and m.excluida_em is null
            limit 1;
          `,
          [respostaAId, canalId],
        );
        if (!parent) {
          return json({ error: 'Mensagem original nao encontrada, excluida ou de outro canal.' }, 400);
        }
        respostaA = parent;
      }

      const row = await withTransaction(sql, async (trx) => {
        const [mensagem] = await trx.unsafe(
          `
            insert into ${SCHEMA}.mensagens (canal_id, autor_id, conteudo, resposta_a_id, mencoes)
            values ($1, $2, $3, $4, $5::uuid[])
            returning *;
          `,
          [canalId, collaborator.id, conteudo || '', respostaAId, mencoes],
        );

        const anexosRows = [];
        for (const anexo of anexos) {
          const [anexoRow] = await trx.unsafe(
            `
              insert into ${SCHEMA}.anexos_mensagem (mensagem_id, nome_arquivo, tipo_mime, tamanho_bytes, storage_path)
              values ($1, $2, $3, $4, $5)
              returning id, nome_arquivo, tipo_mime, tamanho_bytes, storage_path;
            `,
            [mensagem.id, String(anexo.nome_arquivo || ''), String(anexo.tipo_mime || ''), Number(anexo.tamanho_bytes || 0), String(anexo.storage_path || '')],
          );
          anexosRows.push(anexoRow);
        }

        return { ...mensagem, anexos: anexosRows };
      });

      return json({
        row: {
          ...row,
          autor: { id: collaborator.id, nome: collaborator.nome, email: collaborator.email },
          resposta_a: respostaA,
          reacoes: [],
        },
      });
    }

    if (action === 'update_mensagem') {
      const id = String(body.id || '');
      const conteudo = typeof body.conteudo === 'string' ? body.conteudo.trim() : '';
      if (!id) return json({ error: 'id obrigatorio.' }, 400);
      if (!conteudo || conteudo.length > MAX_MENSAGEM_LENGTH) {
        return json({ error: 'Mensagem invalida.' }, 400);
      }

      const rows = await sql.unsafe(
        `
          update ${SCHEMA}.mensagens
          set conteudo = $1, editada_em = now()
          where id = $2
            and autor_id = $3
            and excluida_em is null
          returning *;
        `,
        [conteudo, id, collaborator.id],
      );

      if (!rows[0]) {
        return json({ error: 'Mensagem nao encontrada ou sem permissao.' }, 403);
      }
      return json({ row: rows[0] });
    }

    if (action === 'delete_mensagem') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'id obrigatorio.' }, 400);

      const isAdmin = access?.nivel_acesso === 'admin';
      const { row, anexoPaths } = await withTransaction(sql, async (trx) => {
        const [updated] = await trx.unsafe(
          `
            update ${SCHEMA}.mensagens
            set excluida_em = now()
            where id = $1
              and (autor_id = $2 or $3)
              and excluida_em is null
            returning *;
          `,
          [id, collaborator.id, isAdmin],
        );

        if (!updated) return { row: null, anexoPaths: [] };

        const anexos = await trx.unsafe(
          `
            delete from ${SCHEMA}.anexos_mensagem
            where mensagem_id = $1
            returning storage_path;
          `,
          [id],
        );

        return { row: updated, anexoPaths: anexos.map((a: { storage_path: string }) => a.storage_path) };
      });

      if (!row) {
        return json({ error: 'Mensagem nao encontrada ou sem permissao.' }, 403);
      }
      await deleteAnexosStorage(anexoPaths);
      return json({ row });
    }

    if (action === 'list_colaboradores') {
      const search = typeof body.search === 'string' ? body.search.trim() : '';

      const rows = await sql.unsafe(
        `
          select c.id, c.nome, c.email
          from public.colaboradores c
          join public.acessos_usuario_sistema aus on aus.colaborador_id = c.id
          join public.sistemas s on s.id = aus.sistema_id
          where s.slug = $1
            and s.ativo = true
            and aus.ativo = true
            and c.id <> $2
            and c.status = 'ativo'
            and ($3 = '' or c.nome ilike '%' || $3 || '%' or c.email ilike '%' || $3 || '%')
          order by c.nome asc
          limit 50;
        `,
        [SYSTEM_SLUG, collaborator.id, search],
      );

      return json({ rows });
    }

    if (action === 'list_conversas') {
      const rows = await sql.unsafe(
        `
          select
            cd.id,
            cd.ultima_mensagem_em,
            (
              select json_agg(json_build_object('id', c.id, 'nome', c.nome, 'email', c.email))
              from ${SCHEMA}.participantes_conversa pc2
              join public.colaboradores c on c.id = pc2.colaborador_id
              where pc2.conversa_id = cd.id
                and pc2.colaborador_id <> $1
            ) as outros_participantes,
            (
              select row_to_json(m)
              from (
                select conteudo, criado_em, autor_id, excluida_em
                from ${SCHEMA}.mensagens_diretas
                where conversa_id = cd.id
                order by criado_em desc
                limit 1
              ) m
            ) as ultima_mensagem,
            (
              select count(*)::int
              from ${SCHEMA}.mensagens_diretas md
              where md.conversa_id = cd.id
                and md.excluida_em is null
                and md.autor_id <> $1
                and md.criado_em > coalesce(lm.ultima_leitura_em, '-infinity'::timestamptz)
            ) as nao_lidas,
            (
              select count(*)::int
              from ${SCHEMA}.mensagens_diretas md
              where md.conversa_id = cd.id
                and md.excluida_em is null
                and md.autor_id <> $1
                and md.mencoes @> array[$1]::uuid[]
                and md.criado_em > coalesce(lm.ultima_leitura_em, '-infinity'::timestamptz)
            ) as mencoes_nao_lidas
          from ${SCHEMA}.conversas_diretas cd
          join ${SCHEMA}.participantes_conversa pc on pc.conversa_id = cd.id and pc.colaborador_id = $1
          left join ${SCHEMA}.leituras_mensagem lm on lm.conversa_id = cd.id and lm.colaborador_id = $1
          order by cd.ultima_mensagem_em desc nulls last, cd.criado_em desc;
        `,
        [collaborator.id],
      );

      return json({ rows });
    }

    if (action === 'start_conversa') {
      const otherId = String(body.colaborador_id || '');
      if (!otherId) return json({ error: 'colaborador_id obrigatorio.' }, 400);
      if (otherId === collaborator.id) {
        return json({ error: 'Nao e possivel iniciar conversa consigo mesmo.' }, 400);
      }

      const existing = await sql.unsafe(
        `
          select pc1.conversa_id
          from ${SCHEMA}.participantes_conversa pc1
          join ${SCHEMA}.participantes_conversa pc2 on pc2.conversa_id = pc1.conversa_id
          where pc1.colaborador_id = $1
            and pc2.colaborador_id = $2
            and (
              select count(*) from ${SCHEMA}.participantes_conversa pc3 where pc3.conversa_id = pc1.conversa_id
            ) = 2
          limit 1;
        `,
        [collaborator.id, otherId],
      );

      if (existing[0]) {
        return json({ row: { id: existing[0].conversa_id }, created: false });
      }

      const row = await withTransaction(sql, async (trx) => {
        const [conversa] = await trx.unsafe(
          `insert into ${SCHEMA}.conversas_diretas default values returning id;`,
        );
        await trx.unsafe(
          `insert into ${SCHEMA}.participantes_conversa (conversa_id, colaborador_id) values ($1, $2), ($1, $3);`,
          [conversa.id, collaborator.id, otherId],
        );
        return conversa;
      });

      return json({ row, created: true });
    }

    if (action === 'list_mensagens_diretas') {
      const conversaId = String(body.conversa_id || '');
      if (!conversaId) return json({ error: 'conversa_id obrigatorio.' }, 400);
      await ensureCanAccessConversa(conversaId, collaborator.id);

      const limit = parseInteger(body.limit, DEFAULT_LIST_LIMIT, 1, 200);
      const before = body.before ? String(body.before) : null;

      const rows = await sql.unsafe(
        `
          select
            m.*,
            json_build_object('id', c.id, 'nome', c.nome, 'email', c.email) as autor,
            case when p.id is not null then
              json_build_object(
                'id', p.id,
                'conteudo', p.conteudo,
                'excluida_em', p.excluida_em,
                'autor', json_build_object('id', pc.id, 'nome', pc.nome, 'email', pc.email)
              )
            else null end as resposta_a,
            coalesce(
              (
                select json_agg(json_build_object(
                  'id', a.id, 'nome_arquivo', a.nome_arquivo, 'tipo_mime', a.tipo_mime,
                  'tamanho_bytes', a.tamanho_bytes, 'storage_path', a.storage_path
                ) order by a.criado_em asc)
                from ${SCHEMA}.anexos_mensagem a
                where a.mensagem_direta_id = m.id
              ),
              '[]'::json
            ) as anexos,
            coalesce(
              (
                select json_agg(json_build_object('emoji', t.emoji, 'total', t.total, 'reagiu', t.reagiu))
                from (
                  select emoji, count(*)::int as total,
                         bool_or(colaborador_id = $3) as reagiu
                  from ${SCHEMA}.reacoes_mensagem
                  where mensagem_direta_id = m.id
                  group by emoji
                ) t
              ),
              '[]'::json
            ) as reacoes
          from ${SCHEMA}.mensagens_diretas m
          join public.colaboradores c on c.id = m.autor_id
          left join ${SCHEMA}.mensagens_diretas p on p.id = m.resposta_a_id
          left join public.colaboradores pc on pc.id = p.autor_id
          where m.conversa_id = $1
            and ($2::timestamptz is null or m.criado_em < $2::timestamptz)
          order by m.criado_em desc
          limit ${limit};
        `,
        [conversaId, before, collaborator.id],
      );

      return json({ rows: rows.reverse() });
    }

    if (action === 'create_mensagem_direta') {
      const conversaId = String(body.conversa_id || '');
      const conteudo = typeof body.conteudo === 'string' ? body.conteudo.trim() : '';
      const anexos = Array.isArray(body.anexos) ? body.anexos : [];
      const respostaAId = body.resposta_a_id ? String(body.resposta_a_id) : null;
      if (!conversaId) return json({ error: 'conversa_id obrigatorio.' }, 400);
      if ((!conteudo && anexos.length === 0) || conteudo.length > MAX_MENSAGEM_LENGTH) {
        return json({ error: 'Mensagem invalida.' }, 400);
      }
      await ensureCanAccessConversa(conversaId, collaborator.id);
      const mencoes = await resolveMencoes(body.mencoes);

      let respostaA = null;
      if (respostaAId) {
        const [parent] = await sql.unsafe(
          `
            select m.id, m.conteudo, m.excluida_em,
              json_build_object('id', c.id, 'nome', c.nome, 'email', c.email) as autor
            from ${SCHEMA}.mensagens_diretas m
            join public.colaboradores c on c.id = m.autor_id
            where m.id = $1 and m.conversa_id = $2 and m.excluida_em is null
            limit 1;
          `,
          [respostaAId, conversaId],
        );
        if (!parent) {
          return json({ error: 'Mensagem original nao encontrada, excluida ou de outra conversa.' }, 400);
        }
        respostaA = parent;
      }

      const row = await withTransaction(sql, async (trx) => {
        const [mensagem] = await trx.unsafe(
          `
            insert into ${SCHEMA}.mensagens_diretas (conversa_id, autor_id, conteudo, resposta_a_id, mencoes)
            values ($1, $2, $3, $4, $5::uuid[])
            returning *;
          `,
          [conversaId, collaborator.id, conteudo || '', respostaAId, mencoes],
        );

        const anexosRows = [];
        for (const anexo of anexos) {
          const [anexoRow] = await trx.unsafe(
            `
              insert into ${SCHEMA}.anexos_mensagem (mensagem_direta_id, nome_arquivo, tipo_mime, tamanho_bytes, storage_path)
              values ($1, $2, $3, $4, $5)
              returning id, nome_arquivo, tipo_mime, tamanho_bytes, storage_path;
            `,
            [mensagem.id, String(anexo.nome_arquivo || ''), String(anexo.tipo_mime || ''), Number(anexo.tamanho_bytes || 0), String(anexo.storage_path || '')],
          );
          anexosRows.push(anexoRow);
        }

        return { ...mensagem, anexos: anexosRows };
      });

      return json({
        row: {
          ...row,
          autor: { id: collaborator.id, nome: collaborator.nome, email: collaborator.email },
          resposta_a: respostaA,
          reacoes: [],
        },
      });
    }

    if (action === 'update_mensagem_direta') {
      const id = String(body.id || '');
      const conteudo = typeof body.conteudo === 'string' ? body.conteudo.trim() : '';
      if (!id) return json({ error: 'id obrigatorio.' }, 400);
      if (!conteudo || conteudo.length > MAX_MENSAGEM_LENGTH) {
        return json({ error: 'Mensagem invalida.' }, 400);
      }

      const rows = await sql.unsafe(
        `
          update ${SCHEMA}.mensagens_diretas
          set conteudo = $1, editada_em = now()
          where id = $2
            and autor_id = $3
            and excluida_em is null
          returning *;
        `,
        [conteudo, id, collaborator.id],
      );

      if (!rows[0]) {
        return json({ error: 'Mensagem nao encontrada ou sem permissao.' }, 403);
      }
      return json({ row: rows[0] });
    }

    if (action === 'delete_mensagem_direta') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'id obrigatorio.' }, 400);

      const { row, anexoPaths } = await withTransaction(sql, async (trx) => {
        const [updated] = await trx.unsafe(
          `
            update ${SCHEMA}.mensagens_diretas
            set excluida_em = now()
            where id = $1
              and autor_id = $2
              and excluida_em is null
            returning *;
          `,
          [id, collaborator.id],
        );

        if (!updated) return { row: null, anexoPaths: [] };

        const anexos = await trx.unsafe(
          `
            delete from ${SCHEMA}.anexos_mensagem
            where mensagem_direta_id = $1
            returning storage_path;
          `,
          [id],
        );

        return { row: updated, anexoPaths: anexos.map((a: { storage_path: string }) => a.storage_path) };
      });

      if (!row) {
        return json({ error: 'Mensagem nao encontrada ou sem permissao.' }, 403);
      }
      await deleteAnexosStorage(anexoPaths);
      return json({ row });
    }

    if (action === 'toggle_reacao') {
      const mensagemId = body.mensagem_id ? String(body.mensagem_id) : null;
      const mensagemDiretaId = body.mensagem_direta_id ? String(body.mensagem_direta_id) : null;
      const emoji = typeof body.emoji === 'string' ? body.emoji.trim() : '';

      if ((!mensagemId && !mensagemDiretaId) || (mensagemId && mensagemDiretaId)) {
        return json({ error: 'Informe mensagem_id ou mensagem_direta_id.' }, 400);
      }
      if (!emoji || emoji.length > 8) {
        return json({ error: 'Emoji invalido.' }, 400);
      }

      if (mensagemId) {
        const [mensagem] = await sql.unsafe(
          `select canal_id from ${SCHEMA}.mensagens where id = $1 and excluida_em is null limit 1;`,
          [mensagemId],
        );
        if (!mensagem) return json({ error: 'Mensagem nao encontrada.' }, 404);
        await ensureCanAccessCanal(mensagem.canal_id, collaborator.id);
      } else {
        const [mensagem] = await sql.unsafe(
          `select conversa_id from ${SCHEMA}.mensagens_diretas where id = $1 and excluida_em is null limit 1;`,
          [mensagemDiretaId],
        );
        if (!mensagem) return json({ error: 'Mensagem nao encontrada.' }, 404);
        await ensureCanAccessConversa(mensagem.conversa_id, collaborator.id);
      }

      const result = await withTransaction(sql, async (trx) => {
        const deleted = await trx.unsafe(
          `
            delete from ${SCHEMA}.reacoes_mensagem
            where colaborador_id = $1
              and emoji = $2
              and coalesce(mensagem_id, '00000000-0000-0000-0000-000000000000') = coalesce($3::uuid, '00000000-0000-0000-0000-000000000000')
              and coalesce(mensagem_direta_id, '00000000-0000-0000-0000-000000000000') = coalesce($4::uuid, '00000000-0000-0000-0000-000000000000')
            returning id;
          `,
          [collaborator.id, emoji, mensagemId, mensagemDiretaId],
        );

        if (deleted.length > 0) {
          return { action: 'removed', row: deleted[0] };
        }

        const [inserted] = await trx.unsafe(
          `
            insert into ${SCHEMA}.reacoes_mensagem (mensagem_id, mensagem_direta_id, colaborador_id, emoji)
            values ($1, $2, $3, $4)
            returning *;
          `,
          [mensagemId, mensagemDiretaId, collaborator.id, emoji],
        );
        return { action: 'added', row: inserted };
      });

      return json(result);
    }

    if (action === 'search_mensagens') {
      const query = typeof body.query === 'string' ? body.query.trim() : '';
      const canalId = body.canal_id ? String(body.canal_id) : null;
      const conversaId = body.conversa_id ? String(body.conversa_id) : null;
      const limit = parseInteger(body.limit, 30, 1, 100);

      if (query.length < 2) {
        return json({ rows: [] });
      }
      if (canalId) await ensureCanAccessCanal(canalId, collaborator.id);
      if (conversaId) await ensureCanAccessConversa(conversaId, collaborator.id);

      const rows = await sql.unsafe(
        `
          select * from (
            select
              m.id, 'canal' as tipo, m.canal_id, c2.slug as destino_slug, c2.nome as destino_nome,
              m.conteudo, m.criado_em,
              json_build_object('id', c.id, 'nome', c.nome, 'email', c.email) as autor
            from ${SCHEMA}.mensagens m
            join ${SCHEMA}.canais c2 on c2.id = m.canal_id and c2.ativo
            join ${SCHEMA}.membros_canal mc2 on mc2.canal_id = c2.id and mc2.colaborador_id = $4
            join public.colaboradores c on c.id = m.autor_id
            where m.excluida_em is null
              and m.conteudo ilike '%' || $1 || '%'
              and ($2::uuid is null or m.canal_id = $2::uuid)
              and $3::uuid is null

            union all

            select
              m.id, 'direta' as tipo, m.conversa_id as canal_id, null as destino_slug,
              (
                select oc.nome
                from ${SCHEMA}.participantes_conversa opc
                join public.colaboradores oc on oc.id = opc.colaborador_id
                where opc.conversa_id = m.conversa_id and opc.colaborador_id <> $4
                limit 1
              ) as destino_nome,
              m.conteudo, m.criado_em,
              json_build_object('id', c.id, 'nome', c.nome, 'email', c.email) as autor
            from ${SCHEMA}.mensagens_diretas m
            join ${SCHEMA}.participantes_conversa pp on pp.conversa_id = m.conversa_id and pp.colaborador_id = $4
            join public.colaboradores c on c.id = m.autor_id
            where m.excluida_em is null
              and m.conteudo ilike '%' || $1 || '%'
              and ($3::uuid is null or m.conversa_id = $3::uuid)
              and $2::uuid is null
          ) resultado
          order by criado_em desc
          limit ${limit};
        `,
        [query, canalId, conversaId, collaborator.id],
      );

      return json({ rows });
    }

    return json({ error: 'Acao invalida.' }, 400);
  } catch (error) {
    return json({ error: getErrorMessage(error) }, getErrorStatus(error));
  }
});

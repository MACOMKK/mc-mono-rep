// Aviso de atualizacao generico e cross-app (tabelas public.avisos / public.avisos_aceites): um
// aviso ativo por sistema (sistema_slug), bloqueante ate o colaborador aceitar a versao vigente.
// Qualquer *-api que quiser esse comportamento chama estes helpers com o proprio `sql`
// (postgres.js), em vez de duplicar a logica de versionamento/upsert em cada Edge Function --
// mesmo espirito de `_shared/email.ts#enqueueEmail`.

type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Array<Record<string, unknown>>>;

export interface Aviso {
  id: string;
  sistema_slug: string;
  titulo: string;
  mensagem: string;
  versao: number;
  obrigatorio: boolean;
  ativo: boolean;
  modo_teste: boolean;
  requer_atualizacao: boolean;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface AvisoAceite {
  id: string;
  aviso_id: string;
  colaborador_id: string;
  versao_aceita: number;
  aceito_em: string;
}

export async function obterAvisoAtivo(
  sql: SqlTag,
  { sistemaSlug, colaboradorId }: { sistemaSlug: string; colaboradorId: string },
): Promise<{ aviso: Aviso | null; aceite: AvisoAceite | null }> {
  const avisos = await sql`
    select * from public.avisos where sistema_slug = ${sistemaSlug} and ativo = true limit 1;
  `;
  const aviso = (avisos[0] as Aviso | undefined) || null;
  if (!aviso) return { aviso: null, aceite: null };

  // modo teste: so o criador do aviso o enxerga -- todo o resto do sistema segue sem bloqueio ate
  // o admin desligar o modo teste (ver criarOuAtualizarAviso).
  if (aviso.modo_teste && aviso.criado_por !== colaboradorId) {
    return { aviso: null, aceite: null };
  }

  const aceites = await sql`
    select * from public.avisos_aceites where aviso_id = ${aviso.id} and colaborador_id = ${colaboradorId} limit 1;
  `;
  return { aviso, aceite: (aceites[0] as AvisoAceite | undefined) || null };
}

export async function aceitarAviso(
  sql: SqlTag,
  { avisoId, colaboradorId }: { avisoId: string; colaboradorId: string },
): Promise<AvisoAceite> {
  const avisos = await sql`select * from public.avisos where id = ${avisoId} and ativo = true limit 1;`;
  const aviso = avisos[0] as Aviso | undefined;
  if (!aviso) {
    throw Object.assign(new Error('Aviso nao encontrado ou inativo.'), { status: 404 });
  }

  // versao_aceita sempre vem do banco (aviso.versao), nunca de um valor enviado pelo client.
  const rows = await sql`
    insert into public.avisos_aceites (aviso_id, colaborador_id, versao_aceita)
    values (${avisoId}, ${colaboradorId}, ${aviso.versao})
    on conflict (aviso_id, colaborador_id)
    do update set versao_aceita = excluded.versao_aceita, aceito_em = now()
    returning *;
  `;
  return rows[0] as AvisoAceite;
}

export interface SalvarAvisoInput {
  id?: string | null;
  sistemaSlug: string;
  titulo: string;
  mensagem: string;
  obrigatorio: boolean;
  ativo: boolean;
  modoTeste: boolean;
  requerAtualizacao: boolean;
  criadoPor: string;
  // Quando true, inativa automaticamente o aviso ativo conflitante antes de salvar -- so setado
  // apos o admin confirmar isso explicitamente no dialogo de conflito (ver 409 abaixo).
  forcarInativarAnterior?: boolean;
}

// So um aviso ativo por sistema (indice unico parcial avisos_one_active_per_sistema_idx). Detectado
// aqui explicitamente (nao so pegando a violation 23505 do insert/update) pra poder devolver o
// titulo do aviso conflitante na mensagem, que o admin usa pra decidir se confirma a troca.
async function encontrarAvisoAtivoConflitante(
  sql: SqlTag,
  { sistemaSlug, idAtual }: { sistemaSlug: string; idAtual?: string | null },
): Promise<Aviso | undefined> {
  const rows = idAtual
    ? await sql`select * from public.avisos where sistema_slug = ${sistemaSlug} and ativo = true and id <> ${idAtual} limit 1;`
    : await sql`select * from public.avisos where sistema_slug = ${sistemaSlug} and ativo = true limit 1;`;
  return rows[0] as Aviso | undefined;
}

// Edita o aviso identificado por `input.id` (o que estiver aberto no formulario do admin) em vez
// de adivinhar por `ativo = true` -- antes, salvar um aviso ja inativo criava uma linha nova por
// engano em vez de editar o que estava na tela. Sem `id`, sempre cria um aviso novo (acao
// explicita do admin, botao "Criar novo aviso"). Incrementa versao so quando titulo/mensagem/
// obrigatorio/ativo mudam de fato -- alternar so `modo_teste` nao forca reaceite de quem ja aceitou.
export async function criarOuAtualizarAviso(sql: SqlTag, input: SalvarAvisoInput): Promise<Aviso> {
  if (input.ativo) {
    const conflitante = await encontrarAvisoAtivoConflitante(sql, { sistemaSlug: input.sistemaSlug, idAtual: input.id });
    if (conflitante) {
      if (!input.forcarInativarAnterior) {
        throw Object.assign(
          new Error(`Ja existe um aviso ativo ("${conflitante.titulo}"). Confirme para inativa-lo e ativar este.`),
          { status: 409 },
        );
      }
      await sql`update public.avisos set ativo = false, atualizado_em = now() where id = ${conflitante.id};`;
    }
  }

  if (!input.id) {
    const rows = await sql`
      insert into public.avisos (sistema_slug, titulo, mensagem, versao, obrigatorio, ativo, modo_teste, requer_atualizacao, criado_por)
      values (${input.sistemaSlug}, ${input.titulo}, ${input.mensagem}, 1, ${input.obrigatorio}, ${input.ativo}, ${input.modoTeste}, ${input.requerAtualizacao}, ${input.criadoPor})
      returning *;
    `;
    return rows[0] as Aviso;
  }

  const existentes = await sql`
    select * from public.avisos where id = ${input.id} and sistema_slug = ${input.sistemaSlug} limit 1;
  `;
  const existente = existentes[0] as Aviso | undefined;
  if (!existente) {
    throw Object.assign(new Error('Aviso nao encontrado.'), { status: 404 });
  }

  const mudouConteudo = existente.titulo !== input.titulo || existente.mensagem !== input.mensagem
    || existente.obrigatorio !== input.obrigatorio || existente.ativo !== input.ativo
    || existente.requer_atualizacao !== input.requerAtualizacao;
  const novaVersao = mudouConteudo ? existente.versao + 1 : existente.versao;

  const rows = await sql`
    update public.avisos
    set titulo = ${input.titulo}, mensagem = ${input.mensagem}, obrigatorio = ${input.obrigatorio},
      ativo = ${input.ativo}, modo_teste = ${input.modoTeste}, requer_atualizacao = ${input.requerAtualizacao},
      versao = ${novaVersao}, atualizado_em = now()
    where id = ${existente.id}
    returning *;
  `;
  return rows[0] as Aviso;
}

export interface AvisoComEstatisticas extends Aviso {
  total_aceites: number;
  total_usuarios_atingidos: number;
}

// Historico de avisos de um sistema, com contagem de aceites (na versao vigente de cada aviso) e
// o total de usuarios ativos com acesso ao sistema no momento da consulta -- serve pro admin
// acompanhar quantos colaboradores ja "leram e estao cientes" de cada aviso que ele criou.
export async function listarAvisos(
  sql: SqlTag,
  { sistemaSlug }: { sistemaSlug: string },
): Promise<AvisoComEstatisticas[]> {
  const rows = await sql`
    select
      a.*,
      (
        select count(*)::int from public.avisos_aceites aa
        where aa.aviso_id = a.id and aa.versao_aceita = a.versao
      ) as total_aceites,
      (
        select count(*)::int
        from public.acessos_usuario_sistema aus
        join public.sistemas s on s.id = aus.sistema_id
        join public.colaboradores c on c.id = aus.colaborador_id
        where s.slug = ${sistemaSlug} and s.ativo = true and aus.ativo = true and c.status = 'ativo'
      ) as total_usuarios_atingidos
    from public.avisos a
    where a.sistema_slug = ${sistemaSlug}
    order by a.criado_em desc;
  `;
  return rows as AvisoComEstatisticas[];
}

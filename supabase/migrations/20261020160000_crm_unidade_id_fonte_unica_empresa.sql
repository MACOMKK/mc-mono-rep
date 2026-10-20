-- Nivel 2, item 11 da auditoria do CRM (2026-10-20): leads.empresa/clientes_crm.empresa (texto
-- livre, 3 valores fixos) e unidade_id (FK real para public.unidades) sao duas fontes de verdade
-- para a mesma informacao, podendo divergir -- e o fallback fuzzy (`like '%ananindeua%'` etc) em
-- prepare_lead_phase1() e fragil a erro de digitacao. clientes_crm nunca ganhou unidade_id.
--
-- Correcao: unidade_id passa a ser a unica entrada editavel; empresa passa a ser sempre derivada
-- dela via trigger (nunca mais digitada livremente nem adivinhada por texto).

-- 1) clientes_crm ganha unidade_id, espelhando leads.
alter table gestao_crm.clientes_crm
  add column if not exists unidade_id uuid references public.unidades(id) on delete restrict;

create index if not exists idx_crm_clientes_unidade_id
  on gestao_crm.clientes_crm (unidade_id);

-- 2) Backfill deterministico: empresa hoje so tem 3 valores possiveis (check constraint), entao o
-- match contra public.unidades.nome nao e uma adivinhacao sobre texto arbitrario.
update gestao_crm.clientes_crm c
set unidade_id = (
  select u.id from public.unidades u
  where (c.empresa = 'Macom Ananindeua' and lower(u.nome) like '%ananindeua%')
     or (c.empresa = 'Macom Belém' and lower(u.nome) like '%bel%')
     or (c.empresa = 'Macom Paragominas' and lower(u.nome) like '%paragominas%')
  order by u.nome
  limit 1
)
where c.unidade_id is null;

-- 3) Funcao compartilhada: resolve o texto de empresa a partir da unidade (direcao inversa do
-- fallback fuzzy antigo -- aqui e sempre pela FK, nunca por adivinhacao de texto).
create or replace function gestao_crm.empresa_from_unidade(p_unidade_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when lower(u.nome) like '%paragominas%' then 'Macom Paragominas'
    when lower(u.nome) like '%bel%' then 'Macom Belém'
    else 'Macom Ananindeua'
  end
  from public.unidades u
  where u.id = p_unidade_id;
$$;

comment on function gestao_crm.empresa_from_unidade(uuid) is
  'Deriva o texto de empresa (Macom Ananindeua/Belem/Paragominas) a partir de unidade_id -- unica '
  'fonte de verdade depois da migracao 20261020160000. Nao usar texto livre pra inferir unidade.';

-- 4) prepare_lead_phase1(): troca o fallback fuzzy (empresa -> unidade_id) por: exigir unidade_id
-- explicito e sempre sobrescrever empresa a partir dele (unidade_id -> empresa).
create or replace function gestao_crm.prepare_lead_phase1()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  assigned_collaborator_id uuid;
  distribution_config gestao_crm.configuracoes_distribuicao%rowtype;
  manual_responsavel_unidade_id uuid;
  sla_minutes integer := 30;
  has_active_seller boolean;
  etapa_atual record;
  etapa_mudou boolean;
  motivo_aplica_em text;
  motivo_status_ok boolean;
begin
  select e.nome, e.tipo, e.chave_sistema, e.exige_motivo
  into etapa_atual
  from gestao_crm.etapas_pipeline e
  where e.id = new.etapa_id;

  if not found then
    raise exception using errcode = '23503', message = 'Etapa do pipeline nao encontrada.';
  end if;

  etapa_mudou := tg_op = 'INSERT' or new.etapa_id is distinct from old.etapa_id;

  if etapa_atual.tipo = 'ganho'
     and (tg_op = 'INSERT' or old.etapa_tipo is distinct from 'ganho')
     and coalesce(current_setting('gestao_crm.allow_convertido', true), '') <> 'on' then
    raise exception using
      errcode = '23514',
      message = 'Lead so pode ser convertido ao aceitar uma proposta ou fechar uma venda.';
  end if;

  motivo_aplica_em := case
    when etapa_atual.tipo in ('ganho', 'perdido') then etapa_atual.tipo
    when etapa_atual.exige_motivo then 'qualificado'
  end;

  if motivo_aplica_em is null then
    new.motivo_status_id = null;
  elsif etapa_mudou or new.motivo_status_id is distinct from old.motivo_status_id then
    if new.motivo_status_id is null then
      raise exception using errcode = '23514', message = format('Selecione um motivo para mover o lead para %s.', etapa_atual.nome);
    end if;

    select exists (
      select 1 from gestao_crm.motivos_status m
      where m.id = new.motivo_status_id and m.aplica_em = motivo_aplica_em and m.ativo
    ) into motivo_status_ok;

    if not motivo_status_ok then
      raise exception using errcode = '23514', message = format('O motivo selecionado nao e valido para a etapa %s.', etapa_atual.nome);
    end if;
  end if;

  if etapa_atual.tipo <> 'perdido' then
    new.motivo_perda = null;
    new.perdido_em = null;
  elsif new.perdido_em is null then
    new.perdido_em = now();
  end if;

  if etapa_atual.tipo = 'ganho' and new.convertido_em is null then
    new.convertido_em = now();
  elsif etapa_atual.tipo <> 'ganho' then
    new.convertido_em = null;
  end if;

  if new.unidade_id is null then
    raise exception using errcode = '23514', message = 'Unidade do lead e obrigatoria para distribuicao.';
  end if;

  new.empresa := gestao_crm.empresa_from_unidade(new.unidade_id);

  select * into distribution_config
  from gestao_crm.configuracoes_distribuicao
  where unidade_id = new.unidade_id;

  sla_minutes = coalesce(distribution_config.sla_primeiro_contato_minutos, 30);

  if new.responsavel_id is not null then
    select c.unidade_id into manual_responsavel_unidade_id
    from public.colaboradores c
    join public.acessos_usuario_sistema aus on aus.colaborador_id = c.id and aus.ativo = true
    join public.sistemas s on s.id = aus.sistema_id and s.slug = 'crm' and s.ativo = true
    where c.id = new.responsavel_id and c.status <> 'inativo';

    if manual_responsavel_unidade_id is null or manual_responsavel_unidade_id <> new.unidade_id then
      raise exception using errcode = '23514', message = 'Responsavel deve possuir acesso ao CRM e pertencer a unidade do lead.';
    end if;
  end if;

  if tg_op = 'INSERT' and new.responsavel_id is null then
    perform pg_advisory_xact_lock(hashtextextended(new.unidade_id::text, 0));

    if distribution_config.ativa then
      if distribution_config.estrategia = 'rodizio' then
        select vd.colaborador_id into assigned_collaborator_id
        from gestao_crm.vendedores_distribuicao vd
        join public.colaboradores c on c.id = vd.colaborador_id
        left join gestao_crm.leads active_lead
          on active_lead.responsavel_id = vd.colaborador_id
         and active_lead.etapa_tipo = 'em_andamento'
        where vd.unidade_id = new.unidade_id and vd.ativo and c.status <> 'inativo'
        group by vd.colaborador_id, vd.ultimo_lead_atribuido_em, vd.limite_leads_ativos
        having count(active_lead.id) < coalesce(vd.limite_leads_ativos, distribution_config.limite_padrao_leads_ativos, 2147483647)
        order by vd.ultimo_lead_atribuido_em nulls first, vd.colaborador_id
        limit 1;
      else
        select vd.colaborador_id into assigned_collaborator_id
        from gestao_crm.vendedores_distribuicao vd
        join public.colaboradores c on c.id = vd.colaborador_id
        left join gestao_crm.leads active_lead
          on active_lead.responsavel_id = vd.colaborador_id
         and active_lead.etapa_tipo = 'em_andamento'
        where vd.unidade_id = new.unidade_id and vd.ativo and c.status <> 'inativo'
        group by vd.colaborador_id, vd.ultimo_lead_atribuido_em, vd.limite_leads_ativos
        having count(active_lead.id) < coalesce(vd.limite_leads_ativos, distribution_config.limite_padrao_leads_ativos, 2147483647)
        order by count(active_lead.id), vd.ultimo_lead_atribuido_em nulls first, vd.colaborador_id
        limit 1;
      end if;

      if assigned_collaborator_id is null then
        select exists (
          select 1
          from gestao_crm.vendedores_distribuicao vd
          join public.colaboradores c on c.id = vd.colaborador_id
          where vd.unidade_id = new.unidade_id and vd.ativo and c.status <> 'inativo'
        ) into has_active_seller;

        if has_active_seller then
          raise exception using errcode = '23514', message = 'Todos os vendedores ativos desta unidade atingiram o limite de leads ativos.';
        else
          raise exception using errcode = '23514', message = 'Nenhum vendedor ativo nesta unidade para distribuicao automatica.';
        end if;
      end if;

      new.responsavel_id = assigned_collaborator_id;
      update gestao_crm.vendedores_distribuicao
      set ultimo_lead_atribuido_em = now()
      where unidade_id = new.unidade_id and colaborador_id = assigned_collaborator_id;
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.atribuido_em = case when new.responsavel_id is null then null else now() end;
  elsif new.responsavel_id is distinct from old.responsavel_id then
    new.atribuido_em = case when new.responsavel_id is null then null else now() end;
  end if;

  if new.sla_primeiro_contato_em is null then
    new.sla_primeiro_contato_em = coalesce(new.criado_em, now()) + make_interval(mins => sla_minutes);
  end if;

  return new;
end;
$$;

comment on function gestao_crm.prepare_lead_phase1() is
  'Regras do lead pela etapa (etapas_pipeline.tipo/exige_motivo): motivo obrigatorio na etapa com '
  'exige_motivo=true e nas etapas tipo ganho/perdido (validado contra motivos_status.aplica_em, so '
  'quando a etapa ou o motivo mudam); entrar em etapa tipo ganho so com '
  'gestao_crm.allow_convertido = on (setada por apply_venda_outcome() e pelo branch venda_realizada '
  'de apply_activity_outcome()); perdido_em/convertido_em pelo tipo; distribuicao por carga de leads '
  'com etapa_tipo em_andamento; empresa e sempre derivada de unidade_id via '
  'gestao_crm.empresa_from_unidade() (nunca adivinhada por texto -- ver migracao 20261020160000). '
  'Roda depois de trg_crm_leads_a_sync_etapa, que ja deixa etapa_id/etapa_tipo coerentes com status. '
  'Mantenha em sincronia com apply_activity_outcome(), prepare_activity_business_state() e '
  'apps/crm/src/lib/leadStatus.js. A sincronizacao do cliente fica em '
  'sync_cliente_status_relacionamento() -- nao replique esse UPDATE aqui.';

-- 5) clientes_crm: mesma garantia (empresa sempre derivada de unidade_id quando presente). Nao
-- torna unidade_id not null aqui -- so depois de confirmar que o backfill (passo 2) cobriu 100%
-- das linhas existentes (ver Verificacao no plano).
create or replace function gestao_crm.sync_crm_cliente_empresa_from_unidade()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
begin
  if new.unidade_id is not null then
    new.empresa := gestao_crm.empresa_from_unidade(new.unidade_id);
  end if;
  return new;
end;
$$;

comment on function gestao_crm.sync_crm_cliente_empresa_from_unidade() is
  'Deriva clientes_crm.empresa a partir de unidade_id (gestao_crm.empresa_from_unidade) sempre que '
  'unidade_id vier preenchido -- nunca mais texto livre divergente. Ver migracao 20261020160000.';

drop trigger if exists trg_crm_clientes_sync_empresa on gestao_crm.clientes_crm;
create trigger trg_crm_clientes_sync_empresa
  before insert or update on gestao_crm.clientes_crm
  for each row execute function gestao_crm.sync_crm_cliente_empresa_from_unidade();

notify pgrst, 'reload schema';

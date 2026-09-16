-- 20260915130000 renomeou gestao_crm.clientes para gestao_crm.clientes_crm, mas
-- ALTER TABLE ... RENAME nao reescreve o corpo de funcoes/triggers -- essas 3
-- funcoes ainda referenciavam "gestao_crm.clientes" (nome antigo) no texto do
-- corpo e passaram a falhar em runtime com "relation gestao_crm.clientes does
-- not exist" (reproduzido ao mover um lead para "convertido").

create or replace function gestao_crm.sync_cliente_status_on_lead_convertido()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
begin
  if new.status = 'convertido' and coalesce(old.status, '') is distinct from 'convertido' then
    update gestao_crm.clientes_crm
    set status_relacionamento = 'cliente'
    where id = new.cliente_id
      and status_relacionamento = 'lead';
  end if;

  return new;
end;
$$;

create or replace function gestao_crm.apply_activity_outcome()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
begin
  if new.status <> 'concluida' then
    return new;
  end if;

  update gestao_crm.leads
  set primeiro_contato_em = case
    when new.resultado <> 'sem_resposta' then coalesce(primeiro_contato_em, now())
    else primeiro_contato_em
  end
  where id = new.lead_id;

  if new.resultado = 'venda_realizada' then
    update gestao_crm.leads
    set status = 'convertido', convertido_em = coalesce(convertido_em, now())
    where id = new.lead_id;

    update gestao_crm.clientes_crm
    set status_relacionamento = 'cliente'
    where id = new.cliente_id;
  elsif new.resultado = 'lead_perdido' then
    update gestao_crm.leads
    set status = 'perdido', motivo_perda = new.motivo_resultado, perdido_em = coalesce(perdido_em, now())
    where id = new.lead_id;
  elsif new.resultado = 'proposta_enviada' then
    update gestao_crm.leads set status = 'proposta'
    where id = new.lead_id and status in ('novo', 'tentativa_contato', 'em_contato', 'qualificado', 'proposta');
  elsif new.resultado in ('visita_agendada', 'test_drive') then
    update gestao_crm.leads set status = 'qualificado'
    where id = new.lead_id and status in ('novo', 'tentativa_contato', 'em_contato', 'qualificado');
  elsif new.resultado = 'contato_realizado' then
    update gestao_crm.leads set status = 'em_contato'
    where id = new.lead_id and status in ('novo', 'tentativa_contato');
  elsif new.resultado = 'sem_resposta' then
    update gestao_crm.leads set status = 'tentativa_contato'
    where id = new.lead_id and status = 'novo';
  end if;

  return new;
end;
$$;

create or replace function public.crm_can_access_cliente(cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = gestao_crm, public
as $$
  select exists (
    select 1
    from gestao_crm.clientes_crm c
    where c.id = cliente_id
      and (
        public.crm_access_level() = 'admin'
        or c.criado_por = public.crm_current_colaborador_id()
        or exists (
          select 1
          from gestao_crm.leads l
          where l.cliente_id = c.id
            and (
              (public.crm_access_level() = 'gestor' and l.unidade_id = public.crm_current_unidade_id())
              or (
                public.crm_access_level() = 'usuario'
                and (l.responsavel_id = public.crm_current_colaborador_id() or l.criado_por = public.crm_current_colaborador_id())
              )
            )
        )
      )
  );
$$;

notify pgrst, 'reload schema';

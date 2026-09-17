-- Camada 2 de permissao para o modulo Oficina (Checklist): novos papeis
-- 'inspetor' (realiza o checklist) e 'gestor' (gerencia o modulo), sem
-- reaproveitar a hierarquia de aprovacao do Financeiro (aprovador/financeiro/
-- contas_a_pagar nao fazem sentido pra Oficina).
--
-- auto_create_servicos_permissoes() hoje so provisiona a linha 'financeiro'
-- quando o colaborador ganha acesso ao sistema servicos (Camada 1) -- estende
-- para tambem provisionar 'oficina'. Diferente de financeiro (que usa o
-- default da coluna, 'usuario'), oficina e' provisionada com papel explicito
-- 'nenhum': e' um modulo novo, sem uso real em producao ainda, entao ninguem
-- deve herdar acesso automatico -- o admin libera manualmente quem precisar.
-- O backfill abaixo (colaboradores que ja tem acesso ao servicos hoje) segue
-- a mesma regra, sem excecao.

alter table gestao_servicos.permissoes_modulo
  drop constraint if exists permissoes_modulo_papel_check;

alter table gestao_servicos.permissoes_modulo
  add constraint permissoes_modulo_papel_check
  check (papel in ('nenhum', 'usuario', 'aprovador', 'financeiro', 'contas_a_pagar', 'inspetor', 'gestor'));

create or replace function public.auto_create_servicos_permissoes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ativo and new.sistema_id = (select id from public.sistemas where slug = 'servicos') then
    insert into gestao_servicos.permissoes_modulo (colaborador_id, modulo)
    values (new.colaborador_id, 'financeiro')
    on conflict (colaborador_id, modulo) do nothing;

    insert into gestao_servicos.permissoes_modulo (colaborador_id, modulo, papel)
    values (new.colaborador_id, 'oficina', 'nenhum')
    on conflict (colaborador_id, modulo) do nothing;
  end if;
  return new;
end;
$$;

-- Backfill: colaboradores que ja tem acesso ativo ao servicos mas ainda nao
-- tem linha de permissao para 'oficina' (o modulo nao existia ate agora).
insert into gestao_servicos.permissoes_modulo (colaborador_id, modulo, papel)
select aus.colaborador_id, 'oficina', 'nenhum'
from public.acessos_usuario_sistema aus
join public.sistemas s on s.id = aus.sistema_id
where aus.ativo = true
  and s.slug = 'servicos'
  and s.ativo = true
on conflict (colaborador_id, modulo) do nothing;

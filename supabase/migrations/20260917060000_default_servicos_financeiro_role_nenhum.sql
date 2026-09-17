-- Mesma logica ja aplicada em Oficina (20260917030000/20260917050000), agora tambem para
-- Financeiro: ganhar acesso ao sistema SERVICOS (Camada 1) nao deveria mais destravar
-- automaticamente o modulo como 'usuario' -- com varios modulos previstos, cada um deve
-- ser liberado explicitamente pelo admin.
--
-- Diferente de Oficina, Financeiro esta em producao com usuarios reais e ativos: nao ha
-- UPDATE/backfill aqui. Colaboradores que ja tem linha 'financeiro' em
-- gestao_servicos.permissoes_modulo (praticamente todos com acesso ativo hoje) ficam
-- intocados por causa do 'on conflict do nothing' -- isso so muda o papel de quem ganhar
-- acesso ao SERVICOS pela primeira vez a partir de agora.
--
-- O fallback de public.servicos_module_role() para 'financeiro' continua 'usuario' quando
-- falta linha (comportamento defensivo inalterado): o trigger abaixo sempre cria a linha
-- explicitamente, entao esse fallback na pratica so seria acionado num cenario de delecao
-- manual da linha -- fora do escopo desta mudanca.

create or replace function public.auto_create_servicos_permissoes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ativo and new.sistema_id = (select id from public.sistemas where slug = 'servicos') then
    insert into gestao_servicos.permissoes_modulo (colaborador_id, modulo, papel)
    values (new.colaborador_id, 'financeiro', 'nenhum')
    on conflict (colaborador_id, modulo) do nothing;

    insert into gestao_servicos.permissoes_modulo (colaborador_id, modulo, papel)
    values (new.colaborador_id, 'oficina', 'nenhum')
    on conflict (colaborador_id, modulo) do nothing;
  end if;
  return new;
end;
$$;

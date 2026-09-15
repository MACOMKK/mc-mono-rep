-- Numeração automática de patrimônio por tipo (categoria) de equipamento.
-- Formato: <SIGLA>-<sequencial 3 dígitos>, sequência independente por categoria.

create table gestao_ativos.patrimonio_sequencias (
  categoria text primary key,
  sigla text not null,
  proximo_numero integer not null default 1
);

insert into gestao_ativos.patrimonio_sequencias (categoria, sigla) values
  ('notebook', 'NOTE'),
  ('desktop', 'DESK'),
  ('monitor', 'MON'),
  ('impressora', 'IMPR'),
  ('celular', 'CEL'),
  ('tablet', 'TAB'),
  ('periferico', 'PERIF'),
  ('rede', 'REDE'),
  ('servidor', 'SERV'),
  ('outro', 'OUTR');

create function gestao_ativos.gerar_patrimonio(p_categoria text)
returns text
language plpgsql
as $$
declare
  v_sigla text;
  v_numero integer;
begin
  update gestao_ativos.patrimonio_sequencias
  set proximo_numero = proximo_numero + 1
  where categoria = coalesce(p_categoria, '')
  returning sigla, proximo_numero - 1 into v_sigla, v_numero;

  if v_sigla is null then
    update gestao_ativos.patrimonio_sequencias
    set proximo_numero = proximo_numero + 1
    where categoria = 'outro'
    returning sigla, proximo_numero - 1 into v_sigla, v_numero;
  end if;

  return v_sigla || '-' || lpad(v_numero::text, 3, '0');
end;
$$;

create function gestao_ativos.set_patrimonio_ativos()
returns trigger
language plpgsql
as $$
begin
  if new.patrimonio is null or btrim(new.patrimonio) = '' then
    new.patrimonio := gestao_ativos.gerar_patrimonio(new.categoria);
  end if;
  return new;
end;
$$;

create trigger trg_set_patrimonio_ativos
before insert on gestao_ativos.ativos
for each row
execute function gestao_ativos.set_patrimonio_ativos();

-- Backfill: equipamentos já cadastrados sem patrimônio recebem número na
-- ordem de criação, por categoria. Equipamentos com patrimônio já
-- preenchido manualmente não são alterados.
do $$
declare
  r record;
begin
  for r in
    select id, categoria
    from gestao_ativos.ativos
    where patrimonio is null or btrim(patrimonio) = ''
    order by criado_em
  loop
    update gestao_ativos.ativos
    set patrimonio = gestao_ativos.gerar_patrimonio(r.categoria)
    where id = r.id;
  end loop;
end;
$$;

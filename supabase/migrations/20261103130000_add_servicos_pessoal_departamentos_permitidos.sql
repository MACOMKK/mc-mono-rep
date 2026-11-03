alter table gestao_servicos.configuracoes_modulo
  add column if not exists pessoal_departamentos_permitidos uuid[];

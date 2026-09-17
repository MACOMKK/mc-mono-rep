-- Seed de um motivo padrao para 'convertido' pensado para o fluxo de fechamento de
-- venda (gestao_crm.vendas exige motivo_status_id) -- sem isso, o primeiro uso da tela
-- de Propostas/Vendas ficaria travado ate um admin cadastrar manualmente um motivo em
-- /configuracoes/motivos-insucesso. Catalogo continua editavel normalmente depois.

insert into gestao_crm.motivos_status (status, nome, ativo)
values ('convertido', 'Venda fechada', true)
on conflict (status, nome) do nothing;

notify pgrst, 'reload schema';

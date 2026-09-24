import { beforeEach, describe, expect, it, vi } from 'vitest';

// crmDataClient.js chama crmApi.propostas/crmApi.vendas apenas depois das validacoes
// sincronas (lead_id, veiculo_estoque_id, valor_final, motivo_status_id). Mockamos o
// crmApi para capturar o payload calculado (valor_final) sem bater na rede/Supabase.
vi.mock('@macom/api-client/crmApi', () => ({
  crmApi: {
    propostas: {
      create: vi.fn(async (payload) => ({ id: 'proposta-1', ...payload })),
      update: vi.fn(async (id, payload) => ({ id, ...payload })),
      acceptProposta: vi.fn(async ({ propostaId, vendaPayload }) => ({
        proposta: { id: propostaId, status: 'aceita' },
        venda: { id: 'venda-1', proposta_id: propostaId, ...vendaPayload },
      })),
    },
    vendas: {
      closeVenda: vi.fn(async ({ vendaPayload }) => ({
        venda: { id: 'venda-1', ...vendaPayload },
      })),
      cancelVenda: vi.fn(async ({ vendaId, motivo_cancelamento }) => ({
        venda: { id: vendaId, status: 'cancelada', motivo_cancelamento },
      })),
      list: vi.fn(async () => []),
      listPage: vi.fn(async () => ({ rows: [], count: 0 })),
    },
  },
}));

vi.mock('@macom/api-client/supabaseClient', () => ({
  supabase: undefined,
  assertSupabaseConfigured: vi.fn(),
}));

const { crmApi } = await import('@macom/api-client/crmApi');
const { crmDataClient } = await import('@/api/crmDataClient');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PropostaRepository.create (calculo de valor_final)', () => {
  it('subtrai o desconto do valor do veiculo', async () => {
    await crmDataClient.entities.Proposta.create({
      lead_id: 'lead-1',
      veiculo_estoque_id: 'veiculo-1',
      valor_veiculo: 100000,
      desconto_valor: 5000,
    });

    expect(crmApi.propostas.create).toHaveBeenCalledWith(
      expect.objectContaining({ valor_final: 95000 }),
    );
  });

  it('nunca deixa valor_final negativo quando o desconto excede o valor do veiculo', async () => {
    await crmDataClient.entities.Proposta.create({
      lead_id: 'lead-1',
      veiculo_estoque_id: 'veiculo-1',
      valor_veiculo: 10000,
      desconto_valor: 50000,
    });

    expect(crmApi.propostas.create).toHaveBeenCalledWith(
      expect.objectContaining({ valor_final: 0 }),
    );
  });

  it('trata valor_veiculo/desconto ausentes como zero', async () => {
    await crmDataClient.entities.Proposta.create({
      lead_id: 'lead-1',
      veiculo_estoque_id: 'veiculo-1',
    });

    expect(crmApi.propostas.create).toHaveBeenCalledWith(
      expect.objectContaining({ valor_final: 0 }),
    );
  });

  it('exige lead_id', async () => {
    await expect(crmDataClient.entities.Proposta.create({
      veiculo_estoque_id: 'veiculo-1',
      valor_veiculo: 1000,
    })).rejects.toThrow(/vinculada a um lead/);
    expect(crmApi.propostas.create).not.toHaveBeenCalled();
  });

  it('exige veiculo do estoque ou descricao do veiculo', async () => {
    await expect(crmDataClient.entities.Proposta.create({
      lead_id: 'lead-1',
      valor_veiculo: 1000,
    })).rejects.toThrow(/Selecione um veiculo do estoque ou descreva/);
    expect(crmApi.propostas.create).not.toHaveBeenCalled();
  });

  it('aceita descricao livre do veiculo quando nao ha vinculo com o estoque', async () => {
    await crmDataClient.entities.Proposta.create({
      lead_id: 'lead-1',
      veiculo_descricao: 'Gol 1.0 usado',
      valor_veiculo: 20000,
    });

    expect(crmApi.propostas.create).toHaveBeenCalledWith(
      expect.objectContaining({ veiculo_estoque_id: null, veiculo_descricao: 'Gol 1.0 usado' }),
    );
  });
});

describe('PropostaRepository.aceitar (validacao de aceite)', () => {
  const baseVendaData = {
    veiculo_estoque_id: 'veiculo-1',
    valor_final: 90000,
    motivo_status_id: 'motivo-1',
  };

  it('rejeita aceite sem veiculo vinculado', async () => {
    await expect(crmDataClient.entities.Proposta.aceitar('proposta-1', {
      ...baseVendaData,
      veiculo_estoque_id: undefined,
    })).rejects.toThrow(/Vincule um veiculo do estoque/);
    expect(crmApi.propostas.acceptProposta).not.toHaveBeenCalled();
  });

  it('rejeita aceite sem valor final', async () => {
    await expect(crmDataClient.entities.Proposta.aceitar('proposta-1', {
      ...baseVendaData,
      valor_final: undefined,
    })).rejects.toThrow(/Informe o valor final/);
    expect(crmApi.propostas.acceptProposta).not.toHaveBeenCalled();
  });

  it('rejeita aceite sem motivo de conversao do lead', async () => {
    await expect(crmDataClient.entities.Proposta.aceitar('proposta-1', {
      ...baseVendaData,
      motivo_status_id: undefined,
    })).rejects.toThrow(/Selecione o motivo de conversao/);
    expect(crmApi.propostas.acceptProposta).not.toHaveBeenCalled();
  });

  it('aceita quando veiculo, valor final e motivo estao presentes', async () => {
    const result = await crmDataClient.entities.Proposta.aceitar('proposta-1', baseVendaData);

    expect(crmApi.propostas.acceptProposta).toHaveBeenCalledWith(
      expect.objectContaining({
        propostaId: 'proposta-1',
        vendaPayload: expect.objectContaining({
          veiculo_estoque_id: 'veiculo-1',
          valor_final: 90000,
          motivo_status_id: 'motivo-1',
        }),
      }),
    );
    expect(result.venda.id).toBe('venda-1');
  });
});

describe('VendaRepository.closeVenda (validacao de fechamento direto)', () => {
  const baseData = {
    lead_id: 'lead-1',
    veiculo_estoque_id: 'veiculo-1',
    valor_final: 50000,
    motivo_status_id: 'motivo-1',
  };

  it('exige lead_id', async () => {
    await expect(crmDataClient.entities.Venda.closeVenda({
      ...baseData,
      lead_id: undefined,
    })).rejects.toThrow(/vinculada a um lead/);
    expect(crmApi.vendas.closeVenda).not.toHaveBeenCalled();
  });

  it('exige veiculo vendido', async () => {
    await expect(crmDataClient.entities.Venda.closeVenda({
      ...baseData,
      veiculo_estoque_id: undefined,
    })).rejects.toThrow(/Selecione o veiculo vendido/);
    expect(crmApi.vendas.closeVenda).not.toHaveBeenCalled();
  });

  it('exige valor final', async () => {
    await expect(crmDataClient.entities.Venda.closeVenda({
      ...baseData,
      valor_final: undefined,
    })).rejects.toThrow(/Informe o valor final/);
    expect(crmApi.vendas.closeVenda).not.toHaveBeenCalled();
  });

  it('exige motivo de conversao do lead', async () => {
    await expect(crmDataClient.entities.Venda.closeVenda({
      ...baseData,
      motivo_status_id: undefined,
    })).rejects.toThrow(/Selecione o motivo de conversao/);
    expect(crmApi.vendas.closeVenda).not.toHaveBeenCalled();
  });

  it('fecha a venda quando todos os campos obrigatorios estao presentes', async () => {
    const venda = await crmDataClient.entities.Venda.closeVenda(baseData);

    expect(crmApi.vendas.closeVenda).toHaveBeenCalledWith(
      expect.objectContaining({
        vendaPayload: expect.objectContaining(baseData),
      }),
    );
    expect(venda.id).toBe('venda-1');
  });
});

describe('VendaRepository.cancelar (validacao de cancelamento/estorno)', () => {
  it('exige o id da venda', async () => {
    await expect(crmDataClient.entities.Venda.cancelar(undefined, {
      motivo_cancelamento: 'Cliente desistiu',
    })).rejects.toThrow(/Venda obrigatoria/);
    expect(crmApi.vendas.cancelVenda).not.toHaveBeenCalled();
  });

  it('exige motivo do cancelamento', async () => {
    await expect(crmDataClient.entities.Venda.cancelar('venda-1', {}))
      .rejects.toThrow(/Informe o motivo do cancelamento/);
    expect(crmApi.vendas.cancelVenda).not.toHaveBeenCalled();

    await expect(crmDataClient.entities.Venda.cancelar('venda-1', { motivo_cancelamento: '   ' }))
      .rejects.toThrow(/Informe o motivo do cancelamento/);
    expect(crmApi.vendas.cancelVenda).not.toHaveBeenCalled();
  });

  it('envia o motivo cortado para o crmApi', async () => {
    const venda = await crmDataClient.entities.Venda.cancelar('venda-1', {
      motivo_cancelamento: '  Veiculo trocado  ',
    });

    expect(crmApi.vendas.cancelVenda).toHaveBeenCalledWith({
      vendaId: 'venda-1',
      motivo_cancelamento: 'Veiculo trocado',
    });
    expect(venda.status).toBe('cancelada');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Cobertura para o Card 3 (2026-11-04): resumo de vendas, avaliacoes_cliente (CSAT) e tags em
// clientes, ate agora sem nenhum teste automatizado. Mesmo padrao de mock de
// leadCreation.rules.test.js: crmApi e mockado para capturar o payload/filtros calculados pelos
// repositories de crmDataClient.js, sem bater na rede/Supabase.
vi.mock('@macom/api-client/crmApi', () => ({
  crmApi: {
    clientes: {
      update: vi.fn(async (id, data) => ({ id, nome: 'Cliente Teste', ...data })),
      getResumoVendas: vi.fn(async () => ({
        veiculo_atual: null,
        ultima_compra: null,
        ticket_medio: null,
        avaliacoes: { media: null, total: 0 },
        cliente_recorrente: false,
      })),
    },
    avaliacoes_cliente: {
      list: vi.fn(async () => []),
      create: vi.fn(async (data) => ({ id: 'avaliacao-1', criado_em: '2026-11-04T10:00:00Z', ...data })),
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

describe('Cliente.getResumoVendas', () => {
  it('delega para crmApi.clientes.getResumoVendas com o id do cliente', async () => {
    await crmDataClient.entities.Cliente.getResumoVendas('cliente-1');
    expect(crmApi.clientes.getResumoVendas).toHaveBeenCalledWith('cliente-1');
  });
});

describe('Cliente.updateTags', () => {
  it('envia as tags via crmApi.clientes.update e retorna o cliente mapeado', async () => {
    crmApi.clientes.update.mockResolvedValueOnce({
      id: 'cliente-1',
      nome: 'Joao',
      tags: ['Cliente recorrente', 'Interessado em troca'],
    });

    const cliente = await crmDataClient.entities.Cliente.updateTags('cliente-1', [
      'Cliente recorrente',
      'Interessado em troca',
    ]);

    expect(crmApi.clientes.update).toHaveBeenCalledWith('cliente-1', {
      tags: ['Cliente recorrente', 'Interessado em troca'],
    });
    expect(cliente.tags).toEqual(['Cliente recorrente', 'Interessado em troca']);
  });

  it('mapeia tags ausentes como lista vazia', async () => {
    crmApi.clientes.update.mockResolvedValueOnce({ id: 'cliente-1', nome: 'Joao' });

    const cliente = await crmDataClient.entities.Cliente.updateTags('cliente-1', []);

    expect(cliente.tags).toEqual([]);
  });
});

describe('AvaliacaoCliente.create', () => {
  it('converte nota para numero e envia comentario vazio como null', async () => {
    await crmDataClient.entities.AvaliacaoCliente.create({
      cliente_id: 'cliente-1',
      nota: '5',
      comentario: '  ',
    });

    expect(crmApi.avaliacoes_cliente.create).toHaveBeenCalledWith({
      cliente_id: 'cliente-1',
      nota: 5,
      comentario: null,
    });
  });

  it('mantem o comentario preenchido, sem espacos nas pontas', async () => {
    await crmDataClient.entities.AvaliacaoCliente.create({
      cliente_id: 'cliente-1',
      nota: 4,
      comentario: '  Atendimento rapido  ',
    });

    expect(crmApi.avaliacoes_cliente.create).toHaveBeenCalledWith({
      cliente_id: 'cliente-1',
      nota: 4,
      comentario: 'Atendimento rapido',
    });
  });

  it('retorna a avaliacao mapeada com os campos de data normalizados', async () => {
    const avaliacao = await crmDataClient.entities.AvaliacaoCliente.create({
      cliente_id: 'cliente-1',
      nota: 5,
      comentario: '',
    });

    expect(avaliacao).toMatchObject({
      id: 'avaliacao-1',
      cliente_id: 'cliente-1',
      nota: 5,
      comentario: '',
      created_date: '2026-11-04T10:00:00Z',
    });
  });
});

describe('AvaliacaoCliente.listByCliente', () => {
  it('filtra por cliente_id, ordena por criado_em desc e limita a 50', async () => {
    await crmDataClient.entities.AvaliacaoCliente.listByCliente('cliente-1');

    expect(crmApi.avaliacoes_cliente.list).toHaveBeenCalledWith({
      filters: { cliente_id: 'cliente-1' },
      orderBy: 'criado_em',
      ascending: false,
      limit: 50,
    });
  });

  it('mapeia nota ausente como null e comentario ausente como string vazia', async () => {
    crmApi.avaliacoes_cliente.list.mockResolvedValueOnce([
      { id: 'avaliacao-2', cliente_id: 'cliente-1', nota: null, comentario: null },
    ]);

    const [avaliacao] = await crmDataClient.entities.AvaliacaoCliente.listByCliente('cliente-1');

    expect(avaliacao.nota).toBeNull();
    expect(avaliacao.comentario).toBe('');
  });
});

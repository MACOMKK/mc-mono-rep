import { ArrowLeft, Printer } from 'lucide-react';

import { Button } from '@macom/ui';
import { AVARIA_TIPOS, DOCUMENTACAO_ITENS, PNEUS, SEGURANCA_ITENS } from '@/lib/checklistItens';
import mitsubishiLogo from '@/assets/oficina/mitsubishi-logo.jpg';
import suzukiLogo from '@/assets/oficina/suzuki-logo.jpg';
import vehicleDiagram from '@/assets/oficina/vehicle-diagram.png';
import './checklistDocumento.css';

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function Campo({ label, valor, className = '' }) {
  return (
    <div className={`flex items-center border border-black px-1 py-[2px] ${className}`}>
      <span className="shrink-0">{label}</span>
      <span className="ml-1 font-bold">{valor}</span>
    </div>
  );
}

function StatusBox({ valor }) {
  return (
    <div className="mx-auto flex h-[14px] w-[46px] items-center justify-center border border-black text-[7.5pt] font-bold">
      {valor || ''}
    </div>
  );
}

function Check({ marcado }) {
  return (
    <span className="mr-1 inline-flex h-[11px] w-[11px] shrink-0 items-center justify-center border border-black align-middle text-[8pt] font-bold leading-none">
      {marcado ? 'X' : ''}
    </span>
  );
}

const NIVEIS_LEGENDA = [
  { valor: 0, label: 'V' },
  { valor: 0.25, label: '1/4' },
  { valor: 0.5, label: '1/2' },
  { valor: 0.75, label: '3/4' },
  { valor: 1, label: 'C' },
];

function FuelGauge({ nivel }) {
  const v = Math.max(0, Math.min(1, nivel ?? 0.5));
  const cx = 50;
  const cy = 48;
  const r = 38;
  const strokeWidth = 7;

  const angleFor = (val) => 180 - val * 180;
  const toXY = (val, radius) => {
    const rad = (angleFor(val) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) };
  };

  const start = toXY(0, r);
  const end = toXY(1, r);
  const needleEnd = toXY(v, r - strokeWidth - 2);

  return (
    <svg viewBox="0 0 100 58" className="h-[76px] w-[130px] shrink-0">
      <path
        d={`M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`}
        fill="none"
        stroke="#F5A623"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {NIVEIS_LEGENDA.map((nivelItem) => {
        const tickInner = toXY(nivelItem.valor, r - strokeWidth / 2 - 1);
        const tickOuter = toXY(nivelItem.valor, r + strokeWidth / 2 + 1);
        const labelPos = toXY(nivelItem.valor, r + strokeWidth / 2 + 8);
        return (
          <g key={nivelItem.valor}>
            <line
              x1={tickInner.x}
              y1={tickInner.y}
              x2={tickOuter.x}
              y2={tickOuter.y}
              stroke="#000"
              strokeWidth={0.8}
            />
            <text
              x={labelPos.x}
              y={labelPos.y}
              fontSize="7"
              fontWeight="bold"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {nivelItem.label}
            </text>
          </g>
        );
      })}
      <line x1={cx} y1={cy} x2={needleEnd.x} y2={needleEnd.y} stroke="#E30613" strokeWidth={1.6} />
      <circle cx={cx} cy={cy} r={2.4} fill="#000" />
    </svg>
  );
}

const PNEU_LINHAS = [
  { key: 'ok', label: 'Dentro das especs.', cor: '#00A651' },
  { key: 'atencao', label: 'Atenção', cor: '#FFF200' },
  { key: 'risco', label: 'Risco à Segurança', cor: '#E30613' },
];

const COMUNICACOES_OPCOES = [
  { key: 'concessionarias', label: 'Das concessionárias Mitsubishi e/ou reparadores autorizados Mitsubishi' },
  { key: 'grupo', label: 'De qualquer empresa pertencente ao grupo Mitsubishi' },
  { key: 'parceiro', label: 'De qualquer parceiro Mitsubishi' },
];

export default function ChecklistDocumento({ row, avarias = [], itensPorCategoria = {}, onVoltar }) {
  const documentacao = itensPorCategoria.documentacao || {};
  const seguranca = itensPorCategoria.seguranca || {};
  const pneus = itensPorCategoria.pneus || {};

  return (
    <div>
      <div className="no-print mb-4 flex justify-between rounded-lg border border-border bg-card p-3">
        <Button type="button" variant="outline" size="sm" onClick={onVoltar}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Button type="button" variant="default" size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Imprimir / salvar PDF
        </Button>
      </div>

      <div className="doc-sheet mx-auto shadow-[0_10px_40px_-12px_rgba(0,0,0,0.35)]">
        <div className="flex items-start gap-3">
          <img src={mitsubishiLogo} alt="Mitsubishi Motors" className="w-[70px] shrink-0 object-contain" />
          <div className="shrink-0">
            <div className="text-[20pt] font-black leading-none">MACOM</div>
            <div className="mt-[2px] border-t-2 border-black pt-[2px] text-[10pt] font-bold leading-none">
              J. C. MARANHÃO COM. E REP. LTDA.
            </div>
            <div className="mt-1 text-[7.5pt]">
              E-mail: <b>agendamentomit@jcmempresas.com.br</b>
            </div>
          </div>
          <div className="flex-1 text-[7pt] leading-[1.35]">
            <div>• Rodovia Mário Covas, 555 - Coqueiro - Ananindeua - Pará</div>
            <div className="pl-2">Fone: (91) 3075-9000 / 3075-9035 / 3075-9036</div>
            <div>• Trav. D. Romualdo Coelho, 648 - Umarizal - Belém - Pará</div>
            <div className="pl-2">Fone: (91) 3075-9200 / 3075-9214 / 3075-9215</div>
            <div>• Rodovia PA 256, nº 301 Lote 1 - Nova Conquista - Paragominas - PA</div>
            <div className="pl-2">Fone: (91) 98414-9433</div>
          </div>
          <img src={suzukiLogo} alt="Suzuki" className="w-[80px] shrink-0 object-contain" />
        </div>

        <div className="mt-2 bg-[#E30613] py-[3px] text-center text-[12pt] font-bold text-white">
          CHECK LIST DE SERVIÇOS
          {row.numero ? <span className="ml-2 text-[8pt] font-normal">Nº {row.numero}</span> : null}
        </div>

        <div className="mt-1 grid grid-cols-[1fr_1fr_0.8fr_0.8fr]">
          <Campo label="Cliente:" valor={row.cliente_nome} className="col-span-2" />
          <Campo label="O.S.:" valor={row.os} />
          <Campo label="Data:" valor={formatDate(row.data)} />
          <Campo label="Placa:" valor={row.veiculo_placa} />
          <Campo label="Modelo:" valor={row.veiculo_modelo} />
          <Campo label="Cor:" valor={row.veiculo_cor} />
          <Campo label="Km:" valor={row.km} />
        </div>

        <p className="mt-1 text-[6.5pt] leading-[1.25]">
          A inspeção do veículo é limitada a testes específicos e não inclui desmontagem e exames internos. Todo
          esforço é feito para detectar qualquer condição anormal para o veículo testado.
          <br />
          A Mitsubishi e seus concessionários se isentam de responsabilidade de informar, em caso de condições
          anormais, que não podem ser detectados pelos métodos de diagnóstico ou pelos equipamentos de teste
          aplicados.
        </p>

        <div className="mt-1 bg-[#E9E9E9] py-[2px] text-center text-[9pt] font-bold text-[#E30613]">
          INSPEÇÃO DO VEÍCULO
        </div>

        <div className="mt-1 flex items-center gap-1 text-[8pt] italic">
          <Check marcado={row.pintura_suja} />
          Veículo com pintura suja, impossibilitando inspeção/identificação de riscos e danos.
        </div>

        <div className="mt-1 flex gap-2">
          <div className="relative w-[80mm] shrink-0">
            <img src={vehicleDiagram} alt="Diagrama do veículo" className="w-full" />
            {avarias.map((avaria) => {
              const tipo = AVARIA_TIPOS.find((t) => t.key === avaria.tipo);
              return (
                <span
                  key={avaria.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2 text-[10pt] font-bold text-[#E30613]"
                  style={{ left: `${avaria.pos_x}%`, top: `${avaria.pos_y}%` }}
                >
                  {tipo?.simbolo || '?'}
                </span>
              );
            })}
          </div>
          <div className="flex-1">
            <div className="bg-[#FCE6D2] p-1">
              <div className="flex items-center justify-center gap-2">
                <span className="text-[7.5pt] font-semibold leading-tight">
                  Nível de
                  <br />
                  combustível
                </span>
                <FuelGauge nivel={row.nivel_combustivel} />
              </div>
            </div>
            <div className="mt-2 bg-[#D9E7F5] px-1 py-[2px] text-[8pt] font-bold">
              Observações / Reclamações do Cliente:
            </div>
            <div className="mt-1 whitespace-pre-wrap text-[7.5pt] leading-[1.6]">{row.observacoes}</div>
          </div>
        </div>

        <div className="mt-1 bg-[#FFF200] px-2 py-[2px] text-[8pt] font-bold">
          Legenda: <span className="ml-4 text-[#E30613]">#</span> quebrado,
          <span className="ml-2 text-[#E30613]">⚡</span> amassado,
          <span className="ml-2 text-[#E30613]">/</span> riscado,
          <span className="ml-2 text-[#E30613]">Θ</span> mancha
        </div>

        <div className="mt-1 grid grid-cols-2 gap-2">
          <div>
            <div className="flex bg-[#BFE0EF] text-[8pt] font-bold">
              <span className="w-[22px] border border-black px-1">01</span>
              <span className="flex-1 border border-l-0 border-black px-1">Documentação</span>
              <span className="w-[60px] border border-l-0 border-black text-center">Status</span>
            </div>
            {DOCUMENTACAO_ITENS.map((item, i) => (
              <div key={item} className="flex text-[8pt]">
                <span className="w-[22px] border border-t-0 border-black px-1">{i + 1}</span>
                <span className="flex-1 border border-l-0 border-t-0 border-black px-1">{item}</span>
                <span className="w-[60px] border border-l-0 border-t-0 border-black py-[1px]">
                  <StatusBox valor={documentacao[item]} />
                </span>
              </div>
            ))}
          </div>
          <div>
            <div className="flex bg-[#BFE0EF] text-[8pt] font-bold">
              <span className="w-[22px] border border-black px-1">02</span>
              <span className="flex-1 border border-l-0 border-black px-1">Segurança</span>
              <span className="w-[60px] border border-l-0 border-black text-center">Status</span>
            </div>
            {SEGURANCA_ITENS.map((item, i) => (
              <div key={item} className="flex text-[8pt]">
                <span className="w-[22px] border border-t-0 border-black px-1">{i + 1}</span>
                <span className="flex-1 border border-l-0 border-t-0 border-black px-1">{item}</span>
                <span className="w-[60px] border border-l-0 border-t-0 border-black py-[1px]">
                  <StatusBox valor={seguranca[item]} />
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-1 bg-[#FFF200] px-2 py-[2px] text-center text-[8pt] font-bold">
          Legenda: <span className="ml-6 text-[#E30613]">OK</span> = conforme
          <span className="ml-6 text-[#E30613]">AS</span> = ausente
          <span className="ml-6 text-[#E30613]">AV</span> = avariado
        </div>

        <div className="mt-1 flex gap-2">
          <div className="w-[58%]">
            <div className="flex bg-[#BFE0EF] text-[8pt] font-bold">
              <span className="w-[22px] border border-black px-1">03</span>
              <span className="flex-1 border border-l-0 border-black px-1">Checagem dos Pneus*</span>
            </div>
            <table className="w-full border-collapse text-center text-[8pt]">
              <thead>
                <tr>
                  <th className="w-[38%] border border-t-0 border-black" />
                  {PNEUS.map((p) => (
                    <th key={p} className="border border-t-0 border-black font-bold">
                      {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PNEU_LINHAS.map((linha) => (
                  <tr key={linha.key}>
                    <td className="border border-black pr-1 text-right">{linha.label}</td>
                    {PNEUS.map((p) => (
                      <td key={p} className="border border-black" style={{ backgroundColor: linha.cor }}>
                        {pneus[p] === linha.key ? <b>X</b> : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex-1 border border-black p-1">
            <div className="text-center text-[7.5pt] font-bold">
              Estou de acordo em receber informações / comunicações eletrônicas provindas:
            </div>
            <div className="mt-1 space-y-[2px] text-[7.5pt]">
              {COMUNICACOES_OPCOES.map((opcao) => (
                <div key={opcao.key} className="flex items-center">
                  <Check marcado={(row.comunicacoes || []).includes(opcao.key)} />
                  {opcao.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-1 text-[6.5pt] font-bold">
          * A inspeção deverá ser realizada na presença do Cliente. Utilize a ferramenta padrão PROFUNDÍMETRO e cheque
          a profundidade do pneu em diversos pontos.
        </p>

        <div className="mt-1 flex bg-[#BFE0EF] text-[8pt] font-bold">
          <span className="w-[22px] border border-black px-1">04</span>
          <span className="flex-1 border border-l-0 border-black px-1">Entrega</span>
        </div>
        <div className="mt-1 flex items-center text-[8pt]">
          <Check marcado={row.entrega_conferida} />
          Inspecionar o veículo e verificar se a condição atual corresponde a inspeção do momento da recepção.
        </div>
        <div className="mt-1 text-[8pt]">
          Observações: <span className="font-bold">{row.entrega_observacoes}</span>
        </div>

        <div className="doc-line mt-[2px]" />
        <div className="mt-2 flex items-end justify-between text-[8pt]">
          <div>
            Responsável pela Inspeção: <b>{row.colaborador_nome}</b>
            {row.colaborador_assinatura_url ? (
              <img
                src={row.colaborador_assinatura_url}
                alt="Assinatura do responsável"
                className="mt-[-6px] h-8 w-36 object-contain"
              />
            ) : (
              <span className="ml-1">___________________________</span>
            )}
          </div>
          <div>
            Data: <b>{formatDate(row.data)}</b>
          </div>
          <div>
            Hora: <b>{formatTime(row.data_entrada)}</b>
          </div>
        </div>

        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-[46%] border border-[#E30613] p-1 text-center text-[7.5pt] text-[#E30613]">
              A Concessionária não se responsabiliza por objetos deixados no interior do veículo e não
              declarados/relacionados na ocasião do preenchimento deste Check List.
            </div>
            <div className="flex-1 text-center text-[8pt]">
              {row.assinatura_cliente ? (
                <img src={row.assinatura_cliente} alt="Assinatura do cliente" className="mx-auto h-8 object-contain" />
              ) : (
                <div className="h-8" />
              )}
              <div className="doc-line" />
              <b>Cliente</b>
            </div>
            <div className="w-[110px] text-center text-[7.5pt]">
              <div className="border border-[#E30613] italic text-[#E30613]">ENTRADA</div>
              <div className="mt-1">{formatDate(row.data_entrada)}</div>
              <div>{formatTime(row.data_entrada)} hs</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-[46%] border border-[#E30613] p-1 text-center text-[7.5pt] italic">
              Declaro ter recebido de volta o veículo acima descrito, devidamente reparado e nas mesmas (ou melhores)
              condições em que foi deixado na oficina da Concessionária.
            </div>
            <div className="flex-1 text-center text-[8pt]">
              {row.assinatura_cliente ? (
                <img
                  src={row.assinatura_cliente}
                  alt="Assinatura do cliente na entrega"
                  className="mx-auto h-8 object-contain"
                />
              ) : (
                <div className="h-8" />
              )}
              <div className="doc-line" />
              <b>Cliente</b>
            </div>
            <div className="w-[110px] text-center text-[7.5pt]">
              <div className="border border-[#E30613] italic text-[#E30613]">SAÍDA</div>
              <div className="mt-1">{formatDate(row.data_saida)}</div>
              <div>{row.data_saida ? `${formatTime(row.data_saida)} hs` : '___:___ hs'}</div>
            </div>
          </div>
        </div>
      </div>

      {row.fotos?.length ? (
        <div className="doc-sheet doc-page-2 mx-auto mt-6 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.35)]">
          <div className="flex items-center gap-3">
            <img src={mitsubishiLogo} alt="Mitsubishi Motors" className="w-[50px] shrink-0 object-contain" />
            <div className="text-[14pt] font-black leading-none">MACOM</div>
            <div className="flex-1 text-right text-[8pt]">
              Cliente: <b>{row.cliente_nome}</b> · Placa: <b>{row.veiculo_placa}</b> · O.S.: <b>{row.os}</b>
              {row.numero ? (
                <>
                  {' '}
                  · Nº <b>{row.numero}</b>
                </>
              ) : null}
            </div>
          </div>
          <div className="mt-2 bg-[#E30613] py-[3px] text-center text-[12pt] font-bold text-white">
            FOTOS DO VEÍCULO
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {row.fotos.map((foto, i) => (
              <div key={foto.storage_path || i} className="border border-black p-1">
                <img src={foto.url} alt={foto.legenda || foto.categoria} className="h-[45mm] w-full object-cover" />
                <div className="mt-[2px] text-center text-[7.5pt] leading-tight">
                  <b>
                    {i + 1}. {foto.categoria}
                  </b>
                  {foto.legenda ? <div>{foto.legenda}</div> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

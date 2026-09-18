import { CATEGORIA_ITENS, CATEGORIA_LABEL, statusOptionsPorCategoria } from '@/lib/checklistItens';

const COR_PNEU = {
  ok: 'bg-green-500',
  atencao: 'bg-yellow-400',
  risco: 'bg-red-500',
};

export default function ChecklistItensList({ categoria, valores = {}, onChange, readOnly = false }) {
  const itens = CATEGORIA_ITENS[categoria] || [];
  const opcoesStatus = statusOptionsPorCategoria(categoria);

  if (categoria === 'pneus') {
    return (
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold">{CATEGORIA_LABEL[categoria] || categoria}</h3>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {itens.map((item) => (
            <div key={item} className="flex flex-col items-center gap-3 rounded-lg border p-3">
              <span className="text-sm font-bold">{item}</span>
              <div className="flex w-full flex-col gap-2">
                {opcoesStatus.map((opcao) => (
                  <button
                    key={opcao.value}
                    type="button"
                    disabled={readOnly}
                    onClick={() => onChange?.(item, opcao.value)}
                    className={
                      'flex items-center gap-2 rounded-full border px-3 py-2 text-left text-xs font-medium transition-colors ' +
                      (valores[item] === opcao.value
                        ? 'border-foreground bg-muted'
                        : 'border-input bg-transparent hover:bg-accent')
                    }
                  >
                    <span className={`h-3 w-3 shrink-0 rounded-full ${COR_PNEU[opcao.value] || 'bg-muted-foreground'}`} />
                    {opcao.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          * A inspeção deverá ser realizada na presença do cliente, utilizando profundímetro.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">{CATEGORIA_LABEL[categoria] || categoria}</h3>

      <div className="flex flex-col divide-y rounded-lg border">
        {itens.map((item) => (
          <div key={item} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm">{item}</span>
            <div className="flex gap-1">
              {opcoesStatus.map((opcao) => (
                <button
                  key={opcao.value}
                  type="button"
                  disabled={readOnly}
                  onClick={() => onChange?.(item, opcao.value)}
                  className={
                    'h-8 rounded-md border px-3 text-xs font-semibold transition-colors ' +
                    (valores[item] === opcao.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-transparent hover:bg-accent')
                  }
                >
                  {opcao.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

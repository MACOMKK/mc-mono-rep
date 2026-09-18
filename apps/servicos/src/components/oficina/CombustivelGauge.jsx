const CX = 100;
const CY = 102;
const RAIO = 70;

function pontoNoAngulo(valor, raio) {
  const phi = ((1 - valor) * 180 * Math.PI) / 180;
  return {
    x: CX + raio * Math.cos(phi),
    y: CY - raio * Math.sin(phi),
  };
}

function tick(valor) {
  const externo = pontoNoAngulo(valor, RAIO + 6);
  const interno = pontoNoAngulo(valor, RAIO - 10);
  return { x1: interno.x, y1: interno.y, x2: externo.x, y2: externo.y };
}

const MARCAS = [
  { valor: 0.25, label: '1/4' },
  { valor: 0.5, label: '1/2' },
  { valor: 0.75, label: '3/4' },
];

export default function CombustivelGauge({ value = 0.5, onChange, readOnly = false }) {
  const ponteiro = pontoNoAngulo(value, RAIO - 14);
  const percentual = Math.round(value * 100);

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-2">
      <svg viewBox="0 0 200 120" className="w-full max-w-[220px]">
        <path
          d={`M ${CX - RAIO} ${CY} A ${RAIO} ${RAIO} 0 0 1 ${CX + RAIO} ${CY}`}
          fill="none"
          stroke="#f5a623"
          strokeWidth="7"
          strokeLinecap="round"
        />

        {MARCAS.map((marca) => {
          const t = tick(marca.valor);
          const labelPos = pontoNoAngulo(marca.valor, RAIO + 22);
          return (
            <g key={marca.valor}>
              <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="#f5a623" strokeWidth="3" strokeLinecap="round" />
              <text x={labelPos.x} y={labelPos.y} textAnchor="middle" dominantBaseline="middle" className="fill-foreground text-[10px] font-medium">
                {marca.label}
              </text>
            </g>
          );
        })}

        <line x1={CX - RAIO - 6} y1={CY} x2={CX - RAIO + 8} y2={CY} stroke="#f5a623" strokeWidth="3" strokeLinecap="round" />
        <text x={CX - RAIO - 10} y={CY + 12} textAnchor="middle" className="fill-foreground text-[10px] font-medium">V</text>

        <line x1={CX + RAIO - 8} y1={CY} x2={CX + RAIO + 6} y2={CY} stroke="#f5a623" strokeWidth="3" strokeLinecap="round" />
        <text x={CX + RAIO + 10} y={CY + 12} textAnchor="middle" className="fill-foreground text-[10px] font-medium">C</text>

        <line x1={CX} y1={CY} x2={ponteiro.x} y2={ponteiro.y} stroke="#E30613" strokeWidth="3" strokeLinecap="round" />
        <circle cx={CX} cy={CY} r="4" fill="#111" />
      </svg>

      <input
        type="range"
        min="0"
        max="1"
        step="0.25"
        value={value}
        disabled={readOnly}
        onChange={(event) => onChange?.(parseFloat(event.target.value))}
        className="h-2 w-full max-w-[220px] cursor-pointer appearance-none rounded-full accent-[#E30613] disabled:cursor-not-allowed"
        style={{
          background: `linear-gradient(to right, #E30613 ${percentual}%, #fbd0d3 ${percentual}%)`,
        }}
      />

      <p className="text-xs text-muted-foreground">{percentual}% do tanque</p>
    </div>
  );
}

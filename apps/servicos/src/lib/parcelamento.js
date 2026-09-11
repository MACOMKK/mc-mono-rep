import { proximaDataUtil } from '@/lib/diasUteis';

function parseDataLocal(dataISO) {
  const [ano, mes, dia] = dataISO.slice(0, 10).split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

function formatarISO(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function addMeses(dataISO, meses) {
  const data = parseDataLocal(dataISO);
  data.setMonth(data.getMonth() + meses);
  return formatarISO(data);
}

// Divide valorTotal em `quantidade` parcelas iguais (2 casas decimais), jogando o resto de
// centavos na ultima parcela pra soma bater exatamente com o valor total.
export function gerarParcelasAutomaticas({ valorTotal, dataBase, quantidade }) {
  const total = Math.round(Number(valorTotal || 0) * 100);
  const qtd = Math.max(1, Number(quantidade) || 1);
  const valorBase = Math.floor(total / qtd);
  const resto = total - valorBase * qtd;

  return Array.from({ length: qtd }, (_, index) => {
    const centavos = valorBase + (index === qtd - 1 ? resto : 0);
    const vencimento = dataBase ? proximaDataUtil(addMeses(dataBase, index)) : '';
    return {
      valor: (centavos / 100).toFixed(2),
      data_vencimento: vencimento,
    };
  });
}

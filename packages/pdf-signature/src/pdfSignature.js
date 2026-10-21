import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// A4 em pontos -- teto pra pagina gerada a partir de uma imagem.
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

// Identifica o conteudo real pelos primeiros bytes, sem confiar em nome/mime do upload (ja houve
// anexo ".pdf" que era foto ou pagina HTML, e o pdf-lib falhava com "No PDF header found").
// O cabecalho %PDF pode vir depois de alguns bytes de lixo, por isso a busca nos primeiros 1024.
function detectFileKind(bytes) {
  const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 1024));
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg';
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'png';
  for (let i = 0; i + 3 < head.length; i += 1) {
    if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46) return 'pdf';
  }
  return 'unknown';
}

async function addImagePage(pdfFinal, bytes, kind) {
  const image = kind === 'jpg' ? await pdfFinal.embedJpg(bytes) : await pdfFinal.embedPng(bytes);
  const scale = Math.min(1, A4_WIDTH / image.width, A4_HEIGHT / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const page = pdfFinal.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });
}

// Baixa cada arquivo (em ordem) e concatena todas as paginas num unico PDFDocument. Aceita URLs
// ou itens { url, nome } -- o nome so serve pra mensagem de erro dizer qual anexo falhou.
// Imagem JPG/PNG (mesmo salva como .pdf) entra como uma pagina.
export async function mergePdfs(arquivos) {
  const pdfFinal = await PDFDocument.create();
  for (const arquivo of arquivos) {
    const { url, nome } = typeof arquivo === 'string' ? { url: arquivo, nome: arquivo } : arquivo;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Falha ao baixar "${nome}".`);
    const bytes = await response.arrayBuffer();
    const kind = detectFileKind(bytes);

    if (kind === 'jpg' || kind === 'png') {
      await addImagePage(pdfFinal, bytes, kind);
      continue;
    }
    if (kind !== 'pdf') {
      throw new Error(
        `O anexo "${nome}" não é um PDF nem uma imagem JPG/PNG válida (o arquivo pode estar corrompido ou ter sido salvo com a extensão errada). Desmarque-o para juntar os demais.`,
      );
    }

    let pdfOrigem;
    try {
      pdfOrigem = await PDFDocument.load(bytes, { ignoreEncryption: true });
    } catch (error) {
      throw new Error(`Não foi possível ler o anexo "${nome}": ${error.message}`);
    }
    const paginas = await pdfFinal.copyPages(pdfOrigem, pdfOrigem.getPageIndices());
    paginas.forEach((pagina) => pdfFinal.addPage(pagina));
  }
  return pdfFinal;
}

// Baixa a imagem PNG da assinatura e a embute no PDF (ainda sem desenhar em nenhuma pagina).
export async function embedSignatureImage(pdfDoc, signatureUrl) {
  const response = await fetch(signatureUrl);
  if (!response.ok) throw new Error('Falha ao carregar assinatura.');
  const bytes = await response.arrayBuffer();
  return pdfDoc.embedPng(bytes);
}

// Desenha a imagem de assinatura ja embutida (embedSignatureImage) numa pagina do PDF, na posicao
// e tamanho informados como fracao da pagina (0..1). pdf-lib usa origem no canto inferior
// esquerdo, por isso a inversao do eixo Y.
// Se signerName for informado, tambem grava um carimbo de texto logo abaixo da imagem
// ("Assinado eletronicamente por Fulano em dd/mm/aaaa hh:mm") -- a assinatura sozinha (so a
// imagem do traco) nao prova nada se o PDF circular fora da plataforma; o carimbo de texto e o
// unico dado de autoria/data que fica embutido no proprio arquivo (o resto do rastro vive so no
// banco, em assinaturas_anexo).
export async function stampSignature(
  pdfDoc,
  { pageIndex, xFrac, yFrac, widthFrac, heightFrac, signatureImage, signerName, signedAt, empresaNome },
) {
  const pagina = pdfDoc.getPages()[pageIndex];
  const pageWidthPt = pagina.getWidth();
  const pageHeightPt = pagina.getHeight();
  const x = xFrac * pageWidthPt;
  const width = widthFrac * pageWidthPt;
  const height = heightFrac * pageHeightPt;
  const y = pageHeightPt - (yFrac + heightFrac) * pageHeightPt;

  pagina.drawImage(signatureImage, { x, y, width, height });

  if (signerName) {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    // Piso de 7pt (nao 5pt) e cinza escuro (nao cinza claro): com a caixa de assinatura pequena
    // o calculo anterior (width / 26) caia perto do minimo e ficava praticamente ilegivel --
    // motivo do usuario relatar que "o carimbo nao aparece" mesmo estando de fato gravado no PDF.
    const fontSize = Math.max(7, Math.min(8, width / 20));
    const dataHora = new Date(signedAt || Date.now()).toLocaleString('pt-BR');
    const linhas = [`Assinado eletronicamente por ${signerName}`, `em ${dataHora} - ${empresaNome || 'MACOM'}`];
    linhas.forEach((linha, indice) => {
      pagina.drawText(linha, {
        x,
        // Math.max 0: se a assinatura for posicionada perto do rodape da pagina, o texto abaixo
        // dela nao pode ir pra fora da area visivel (coordenada negativa nao desenha nada).
        y: Math.max(0, y - fontSize * (indice + 1) - 2 * (indice + 1)),
        size: fontSize,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });
    });
  }
}

// Salva o PDF final e dispara o download no navegador.
export async function downloadPdf(pdfDoc, filename) {
  const pdfBytes = await pdfDoc.save();
  const blobUrl = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import { embedSignatureImage, stampSignature } from '@macom/pdf-signature';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CheckCircle2,
  Circle,
  Clock3,
  FileText,
  Mail,
  Monitor,
  Paperclip,
  PenLine,
  RotateCcw,
  Search,
  UserRound,
} from 'lucide-react';
import { Spinner } from '@macom/ui';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import FeedbackToast from '@/components/ui/feedback-toast';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PaginationControls from '@/components/PaginationControls';
import { useAuth } from '@/lib/AuthContext';
import { catalogApi } from '@/lib/catalogApi';
import { supabase } from '@/lib/supabaseClient';
import { normalizeText, sanitizeFileName } from '@/lib/text';

const SIGNED_FILE_BUCKET = 'central-anexos';
const SIGNED_FILE_FOLDER = 'termos-posse';
const SIGNED_FILE_MAX_SIZE = 10 * 1024 * 1024;
const SIGNED_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png';
const IMAGE_MAX_WIDTH = 2000;
const IMAGE_JPEG_QUALITY = 0.8;

function formatFileSize(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function replaceFileExtension(fileName, newExt) {
  const withoutExt = fileName.replace(/\.[^./\\]+$/, '');
  return `${withoutExt || 'comprovante'}.${newExt}`;
}

async function compressImageFile(file) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Nao foi possivel ler a imagem.'));
      img.src = objectUrl;
    });

    const scale = Math.min(1, IMAGE_MAX_WIDTH / image.naturalWidth);
    const targetWidth = Math.round(image.naturalWidth * scale);
    const targetHeight = Math.round(image.naturalHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponivel.');
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Falha ao gerar imagem comprimida.'))),
        'image/jpeg',
        IMAGE_JPEG_QUALITY
      );
    });

    if (blob.size >= file.size) {
      return file;
    }

    return new File([blob], replaceFileExtension(file.name, 'jpg'), { type: 'image/jpeg' });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function prepareSignedTermFile(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return file;
  }
  return compressImageFile(file);
}

async function uploadSignedTermFile(file, termId) {
  if (!file) return null;

  const preparedFile = await prepareSignedTermFile(file);

  if (preparedFile.size > SIGNED_FILE_MAX_SIZE) {
    throw new Error('O arquivo deve ter no maximo 10 MB.');
  }

  const safeName = sanitizeFileName(preparedFile.name, 'comprovante');
  const storagePath = `${SIGNED_FILE_FOLDER}/${termId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(SIGNED_FILE_BUCKET).upload(storagePath, preparedFile, { upsert: true });

  if (error) {
    throw new Error(error.message || 'Nao foi possivel enviar o comprovante.');
  }

  return {
    arquivo_path: storagePath,
    arquivo_nome: preparedFile.name,
    arquivo_tipo: preparedFile.type || null,
    arquivo_tamanho: preparedFile.size || null,
  };
}

async function uploadDevolucaoReceipt(blob, filename, termId) {
  const file = new File([blob], filename, { type: 'application/pdf' });
  const storagePath = `${SIGNED_FILE_FOLDER}/${termId}/devolucao-${Date.now()}-${sanitizeFileName(filename, 'comprovante-devolucao')}`;
  const { error } = await supabase.storage.from(SIGNED_FILE_BUCKET).upload(storagePath, file, { upsert: true });

  if (error) {
    throw new Error(error.message || 'Nao foi possivel salvar o comprovante de devolucao.');
  }

  return {
    arquivo_devolucao_path: storagePath,
    arquivo_devolucao_nome: filename,
    arquivo_devolucao_tipo: file.type || null,
    arquivo_devolucao_tamanho: file.size || null,
  };
}

async function openSignedTermFile(path) {
  const { data, error } = await supabase.storage.from(SIGNED_FILE_BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Nao foi possivel abrir o comprovante.');
  }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

const statusMeta = {
  sem_termo: {
    label: 'Sem termo',
    className: 'border-border bg-background text-muted-foreground',
    icon: Clock3,
    cardClassName: 'border-border bg-card',
    asideClassName: 'border-border bg-muted/40',
    avatarClassName: 'bg-[#bf1220]/10',
    avatarIconClassName: 'text-[#bf1220]',
  },
  pendente: {
    label: 'Pendente',
    className: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300',
    icon: Clock3,
    cardClassName: 'border-border bg-card',
    asideClassName: 'border-border bg-muted/40',
    avatarClassName: 'bg-[#bf1220]/10',
    avatarIconClassName: 'text-[#bf1220]',
  },
  assinado_empresa: {
    label: 'Assinado pela empresa',
    className: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300',
    icon: PenLine,
    cardClassName: 'border-sky-300 bg-card dark:border-sky-900',
    asideClassName: 'border-border bg-sky-50 dark:bg-sky-950/20',
    avatarClassName: 'bg-sky-100 dark:bg-sky-950/40',
    avatarIconClassName: 'text-sky-600',
  },
  assinado: {
    label: 'Termo Assinado',
    className: 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300',
    icon: CheckCircle2,
    cardClassName: 'border-emerald-300 bg-card dark:border-emerald-900',
    asideClassName: 'border-border bg-emerald-50 dark:bg-emerald-950/20',
    avatarClassName: 'bg-emerald-100 dark:bg-emerald-950/40',
    avatarIconClassName: 'text-emerald-600',
  },
};

const categoryLabels = {
  notebook: 'Notebook',
  monitor: 'Monitor',
  tv: 'TV',
  desktop: 'Desktop',
  impressora: 'Impressora',
  telefone: 'Telefone',
  headset: 'Headset',
  teclado: 'Teclado',
  mouse: 'Mouse',
  nobreak: 'Nobreak',
  switch: 'Switch',
  roteador: 'Roteador',
  servidor: 'Servidor',
  tablet: 'Tablet',
  outros: 'Outros',
  celular: 'Celular',
  periferico: 'Periferico',
  rede: 'Rede',
  outro: 'Outros',
};

const conditionLabels = {
  novo: 'Novo',
  bom: 'Bom',
  regular: 'Regular',
  ruim: 'Ruim',
  inservivel: 'Inservivel',
};

const LOGO_URL = 'https://res.cloudinary.com/drevbr5eq/image/upload/q_auto/f_auto/v1777603989/logo_vermelha_e2aob2.png';
const DEFAULT_PAGE_SIZE = 10;

function formatCpf(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 11) return value || '-';
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR');
}

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

function buildLatestTermIndex(terms) {
  return terms.reduce((acc, term) => {
    const key = `${term.colaborador_id}:${term.ativo_id}`;
    if (!acc[key]) {
      acc[key] = term;
    }
    return acc;
  }, {});
}

function upsertTerms(terms, nextTerms) {
  const items = Array.isArray(nextTerms) ? nextTerms.filter(Boolean) : [nextTerms].filter(Boolean);
  if (!items.length) return terms;

  const nextById = new Map(items.map((term) => [term.id, term]));
  const updatedTerms = terms.map((term) => (
    nextById.has(term.id) ? { ...term, ...nextById.get(term.id) } : term
  ));
  const existingIds = new Set(updatedTerms.map((term) => term.id));
  const newTerms = items.filter((term) => !existingIds.has(term.id));

  return [...newTerms, ...updatedTerms];
}

function getCardStatus(assets, latestTermsByAsset) {
  if (!assets.length) return 'sem_termo';

  const activeTerms = assets
    .map((asset) => latestTermsByAsset[asset.id] || null)
    .filter(Boolean);

  if (!activeTerms.length || activeTerms.length !== assets.length) {
    return activeTerms.length ? 'pendente' : 'sem_termo';
  }

  if (activeTerms.every((term) => term.status === 'assinado')) return 'assinado';
  if (activeTerms.every((term) => term.status === 'assinado_empresa' || term.status === 'assinado')) {
    return 'assinado_empresa';
  }
  return 'pendente';
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const [, base64 = ''] = result.split(',');
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Nao foi possivel converter o PDF para base64.'));
    reader.readAsDataURL(blob);
  });
}

async function generateTermoPDF(employee, assets, options = {}) {
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
  });
  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginX * 2;
  let y = 18;

  doc.setFillColor(230, 0, 18);
  doc.rect(0, 0, pageWidth, 12, 'F');

  try {
    const logo = await loadImage(LOGO_URL);
    doc.addImage(logo, 'PNG', marginX, 15, 14, 14);
  } catch {}

  y = 23;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(230, 0, 18);
  doc.text('MACOM', marginX + 18, y);

  doc.setFontSize(9.5);
  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'normal');
  doc.text('MITSUBISHI MOTORS | Gestao de Ativos TI', marginX + 18, y + 6);
  const today = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(`Belem/PA, ${today}`, pageWidth - marginX, 8, { align: 'right' });

  y = 42;
  doc.setFillColor(245, 245, 245);
  doc.rect(marginX, y - 6, contentWidth, 14, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(30, 30, 30);
  doc.text('TERMO DE RESPONSABILIDADE E POSSE DE EQUIPAMENTO', pageWidth / 2, y + 2, { align: 'center' });

  y = 56;
  doc.setFillColor(230, 0, 18);
  doc.rect(marginX, y, 3, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text('DADOS DO COLABORADOR', marginX + 7, y + 7);

  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);

  const employeeData = [
    ['Nome:', employee.full_name || '-'],
    ['CPF:', employee.cpf || '-'],
    ['Email:', employee.email || '-'],
    ['Departamento:', employee.department || '-'],
    ['Cargo:', employee.role || '-'],
  ];

  employeeData.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, marginX + 5, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value || '-'), marginX + 40, y);
    y += 5.6;
  });

  y += 5;
  doc.setFillColor(230, 0, 18);
  doc.rect(marginX, y, 3, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text('EQUIPAMENTOS SOB RESPONSABILIDADE', marginX + 7, y + 7);
  y += 13;

  const colWidths = [25, 50, 40, 30, 25];
  const headers = ['Codigo', 'Equipamento', 'N Serie', 'Marca/Modelo', 'Estado'];

  doc.setFillColor(30, 30, 30);
  doc.rect(marginX, y - 4.5, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);

  let x = marginX + 2;
  headers.forEach((header, index) => {
    doc.text(header, x, y);
    x += colWidths[index];
  });

  y += 5.2;
  doc.setTextColor(50, 50, 50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.3);

  const maxRows = 9;
  const shownAssets = assets.slice(0, maxRows);
  shownAssets.forEach((asset, index) => {
    const bgColor = index % 2 === 0 ? [250, 250, 250] : [255, 255, 255];
    doc.setFillColor(...bgColor);
    doc.rect(marginX, y - 3.4, contentWidth, 6.6, 'F');

    x = marginX + 2;
    const row = [
      asset.tag || '-',
      `${categoryLabels[asset.category] || ''} ${asset.name || ''}`.trim(),
      asset.serial_number || '-',
      `${asset.brand || ''} ${asset.model || ''}`.trim() || '-',
      conditionLabels[asset.condition] || '-',
    ];

    row.forEach((cell, cellIndex) => {
      const text = String(cell || '-');
      const truncated = text.length > 26 ? `${text.substring(0, 24)}...` : text;
      doc.text(truncated, x, y);
      x += colWidths[cellIndex];
    });
    y += 6.6;
  });

  if (assets.length > maxRows) {
    doc.setFontSize(6.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`+ ${assets.length - maxRows} item(ns) adicional(is) resumido(s).`, marginX, y + 2);
    y += 5.2;
  }

  y += 6;
  doc.setFillColor(230, 0, 18);
  doc.rect(marginX, y, 3, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text('TERMOS E CONDICOES', marginX + 7, y + 7);
  y += 13;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(60, 60, 60);

  const terms = [
    '1. O colaborador declara ter recebido o(s) equipamento(s) listado(s) acima em perfeito estado de funcionamento e conservacao.',
    '2. O colaborador compromete-se a zelar pela conservacao e bom uso do(s) equipamento(s), utilizando-o(s) exclusivamente para fins profissionais.',
    '3. E vedada a cessao, emprestimo ou transferencia do(s) equipamento(s) a terceiros sem previa autorizacao da MACOM.',
    '4. Em caso de dano, perda ou furto, o colaborador devera comunicar imediatamente ao departamento de TI.',
    '5. O colaborador compromete-se a devolver o(s) equipamento(s) em bom estado ao termino do vinculo empregaticio ou quando solicitado.',
    '6. O descumprimento deste termo podera acarretar em medidas administrativas e/ou ressarcimento dos valores correspondentes.',
  ];

  terms.forEach((term) => {
    const lines = doc.splitTextToSize(term, contentWidth - 10);
    doc.text(lines, marginX + 5, y);
    y += lines.length * 3.7 + 2.2;
  });

  y += 22;
  const sigY = Math.min(y, pageHeight - 24);
  doc.setDrawColor(180, 180, 180);
  const sigWidth = (contentWidth - 20) / 2;
  doc.line(marginX, sigY, marginX + sigWidth, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 30, 30);
  doc.text(employee.full_name || 'Colaborador', marginX + sigWidth / 2, sigY + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(120, 120, 120);
  doc.text('Colaborador', marginX + sigWidth / 2, sigY + 9, { align: 'center' });

  const rightX = marginX + sigWidth + 20;
  doc.line(rightX, sigY, rightX + sigWidth, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 30, 30);
  doc.text('Departamento de TI', rightX + sigWidth / 2, sigY + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(120, 120, 120);
  doc.text('MACOM Mitsubishi', rightX + sigWidth / 2, sigY + 9, { align: 'center' });

  // Retangulo (fracao da pagina, 0..1) logo acima da linha "Departamento de TI", usado por
  // stampSignature (@macom/pdf-signature) para carimbar a assinatura digital da empresa.
  const empresaStampWidthMm = sigWidth * 0.8;
  const empresaStampHeightMm = 12;
  const empresaStampX = rightX + (sigWidth - empresaStampWidthMm) / 2;
  const empresaStampTopY = sigY - empresaStampHeightMm - 9;
  const empresaSignatureAnchor = {
    pageIndex: 0,
    xFrac: empresaStampX / pageWidth,
    yFrac: empresaStampTopY / pageHeight,
    widthFrac: empresaStampWidthMm / pageWidth,
    heightFrac: empresaStampHeightMm / pageHeight,
  };

  // Espelho do anchor da empresa, do lado esquerdo (linha "Colaborador") -- usado depois pela
  // intranet pra carimbar a assinatura do colaborador sobre o mesmo PDF ja assinado pela empresa.
  const colaboradorStampWidthMm = sigWidth * 0.8;
  const colaboradorStampHeightMm = 12;
  const colaboradorStampX = marginX + (sigWidth - colaboradorStampWidthMm) / 2;
  const colaboradorStampTopY = sigY - colaboradorStampHeightMm - 9;
  const colaboradorSignatureAnchor = {
    pageIndex: 0,
    xFrac: colaboradorStampX / pageWidth,
    yFrac: colaboradorStampTopY / pageHeight,
    widthFrac: colaboradorStampWidthMm / pageWidth,
    heightFrac: colaboradorStampHeightMm / pageHeight,
  };

  const footerY = doc.internal.pageSize.getHeight();
  doc.setFillColor(230, 0, 18);
  doc.rect(0, footerY - 8, pageWidth, 8, 'F');
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255);
  doc.text('MACOM Mitsubishi Motors - Gestao de Ativos TI', pageWidth / 2, footerY - 3, { align: 'center' });

  const filename = `Termo_${sanitizeFileName(employee.full_name || 'colaborador', 'termo-posse')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;

  if (options.returnArrayBuffer) {
    const arrayBuffer = doc.output('arraybuffer');
    return { arrayBuffer, filename, empresaSignatureAnchor, colaboradorSignatureAnchor };
  }

  if (options.returnBlob) {
    const blob = doc.output('blob');
    return { blob, filename, empresaSignatureAnchor, colaboradorSignatureAnchor };
  }

  doc.save(filename);
  return { filename, empresaSignatureAnchor, colaboradorSignatureAnchor };
}

async function generateDevolucaoPDF(employee, asset, registeredBy) {
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
  });
  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginX * 2;
  let y = 18;

  doc.setFillColor(230, 0, 18);
  doc.rect(0, 0, pageWidth, 12, 'F');

  try {
    const logo = await loadImage(LOGO_URL);
    doc.addImage(logo, 'PNG', marginX, 15, 14, 14);
  } catch {}

  y = 23;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(230, 0, 18);
  doc.text('MACOM', marginX + 18, y);

  doc.setFontSize(9.5);
  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'normal');
  doc.text('MITSUBISHI MOTORS | Gestao de Ativos TI', marginX + 18, y + 6);
  const today = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(`Belem/PA, ${today}`, pageWidth - marginX, 8, { align: 'right' });

  y = 42;
  doc.setFillColor(245, 245, 245);
  doc.rect(marginX, y - 6, contentWidth, 14, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(30, 30, 30);
  doc.text('COMPROVANTE DE DEVOLUCAO DE EQUIPAMENTO', pageWidth / 2, y + 2, { align: 'center' });

  y = 56;
  doc.setFillColor(230, 0, 18);
  doc.rect(marginX, y, 3, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text('DADOS DO COLABORADOR', marginX + 7, y + 7);

  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);

  const employeeData = [
    ['Nome:', employee.full_name || '-'],
    ['CPF:', employee.cpf || '-'],
    ['Email:', employee.email || '-'],
    ['Departamento:', employee.department || '-'],
    ['Cargo:', employee.role || '-'],
  ];

  employeeData.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, marginX + 5, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value || '-'), marginX + 40, y);
    y += 5.6;
  });

  y += 5;
  doc.setFillColor(230, 0, 18);
  doc.rect(marginX, y, 3, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text('EQUIPAMENTO DEVOLVIDO', marginX + 7, y + 7);
  y += 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);

  const assetData = [
    ['Codigo:', asset.tag || '-'],
    ['Equipamento:', `${categoryLabels[asset.category] || ''} ${asset.name || ''}`.trim() || '-'],
    ['N Serie:', asset.serial_number || '-'],
    ['Marca/Modelo:', `${asset.brand || ''} ${asset.model || ''}`.trim() || '-'],
    ['Estado na devolucao:', conditionLabels[asset.condition] || '-'],
  ];

  assetData.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, marginX + 5, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value || '-'), marginX + 45, y);
    y += 5.6;
  });

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(60, 60, 60);
  const declaration = doc.splitTextToSize(
    `Fica registrado que o equipamento acima descrito foi devolvido pelo colaborador ${employee.full_name || '-'} ` +
      `ao Departamento de TI da MACOM em ${format(new Date(), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}, ` +
      'encerrando o vinculo de responsabilidade do colaborador sobre este ativo.',
    contentWidth - 10,
  );
  doc.text(declaration, marginX + 5, y);
  y += declaration.length * 3.7 + 10;

  const sigY = Math.min(y + 10, pageHeight - 24);
  doc.setDrawColor(180, 180, 180);
  doc.line(marginX, sigY, marginX + contentWidth, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 30, 30);
  doc.text(`Registrado por: ${registeredBy || 'Departamento de TI'}`, marginX, sigY + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(120, 120, 120);
  doc.text('MACOM Mitsubishi - Gestao de Ativos TI', marginX, sigY + 10);

  const footerY = doc.internal.pageSize.getHeight();
  doc.setFillColor(230, 0, 18);
  doc.rect(0, footerY - 8, pageWidth, 8, 'F');
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255);
  doc.text('MACOM Mitsubishi Motors - Gestao de Ativos TI', pageWidth / 2, footerY - 3, { align: 'center' });

  const filename = `Devolucao_${sanitizeFileName(employee.full_name || 'colaborador', 'devolucao')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  const blob = doc.output('blob');
  return { blob, filename };
}

export default function TermsPossession() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [feedback, setFeedback] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [pendingActions, setPendingActions] = useState(/** @type {Record<string, Record<string, boolean>>} */ ({}));

  /**
   * @param {string} collaboratorId
   * @param {string} action
   * @param {boolean} value
   */
  const setActionPending = (collaboratorId, action, value) => {
    setPendingActions((prev) => {
      const current = prev[collaboratorId] || {};
      if (Boolean(current[action]) === value) return prev;
      return {
        ...prev,
        [collaboratorId]: { ...current, [action]: value },
      };
    });
  };

  const collaboratorsQuery = useQuery({ queryKey: ['colaboradores'], queryFn: catalogApi.colaboradores.list });
  const assetsQuery = useQuery({ queryKey: ['ativos'], queryFn: catalogApi.ativos.list });
  const termsQuery = useQuery({ queryKey: ['termos_posse'], queryFn: catalogApi.termos_posse.list });
  const departmentsQuery = useQuery({ queryKey: ['departamentos'], queryFn: catalogApi.departamentos.list });

  const collaborators = collaboratorsQuery.data || [];
  const assets = assetsQuery.data || [];
  const terms = termsQuery.data || [];
  const departments = departmentsQuery.data || [];
  const normalizedSearch = useMemo(() => normalizeText(search), [search]);

  const departmentById = useMemo(
    () => new Map(departments.map((department) => [department.id, department.nome])),
    [departments]
  );

  const assetsByCollaboratorId = useMemo(() => {
    const map = new Map();

    assets.forEach((asset) => {
      if (!asset.usuario_id) return;
      const current = map.get(asset.usuario_id) || [];
      current.push(asset);
      map.set(asset.usuario_id, current);
    });

    map.forEach((linkedAssets) => {
      linkedAssets.sort((left, right) => (left.nome || '').localeCompare(right.nome || ''));
    });

    return map;
  }, [assets]);

  const collaboratorCards = useMemo(() => {
    const latestTermIndex = buildLatestTermIndex(terms);

    return collaborators
      .map((collaborator) => {
        const linkedAssets = assetsByCollaboratorId.get(collaborator.id) || [];
        const latestTermsByAsset = linkedAssets.reduce((acc, asset) => {
          acc[asset.id] = latestTermIndex[`${collaborator.id}:${asset.id}`] || null;
          return acc;
        }, {});
        const status = getCardStatus(linkedAssets, latestTermsByAsset);
        const termRows = Object.values(latestTermsByAsset).filter(Boolean);

        return {
          collaborator,
          assets: linkedAssets,
          status,
          latestTermsByAsset,
          termRows,
        };
      })
      .filter((item) => item.assets.length > 0)
      .filter((item) => {
        const haystack = [
          item.collaborator.nome,
          item.collaborator.email,
          item.collaborator.cpf,
          departmentById.get(item.collaborator.departamento_id),
        ]
          .map(normalizeText)
          .join(' ');

        const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);
        const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((left, right) => (left.collaborator.nome || '').localeCompare(right.collaborator.nome || ''));
  }, [assetsByCollaboratorId, collaborators, departmentById, normalizedSearch, statusFilter, terms]);

  useEffect(() => {
    setPage(1);
  }, [normalizedSearch, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(collaboratorCards.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedCollaboratorCards = useMemo(
    () => collaboratorCards.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [collaboratorCards, currentPage, pageSize]
  );

  const ensureTermRows = async (collaborator, linkedAssets, latestTermsByAsset) => {
    const rows = [];

    for (const asset of linkedAssets) {
      const existingTerm = latestTermsByAsset[asset.id];
      if (existingTerm && !['cancelado', 'devolvido'].includes(existingTerm.status)) {
        rows.push(existingTerm);
        continue;
      }

      const createdRow = await catalogApi.termos_posse.create({
        ativo_id: asset.id,
        colaborador_id: collaborator.id,
      });
      rows.push(createdRow);
    }

    return rows;
  };

  const buildPdfPayload = (collaborator, linkedAssets) => {
    const departmentName = departmentById.get(collaborator.departamento_id) || '-';
    const employee = {
      full_name: collaborator.nome || '-',
      cpf: formatCpf(collaborator.cpf),
      email: collaborator.email || '-',
      department: departmentName,
      role: collaborator.cargo || '-',
    };
    const normalizedAssets = linkedAssets.map((asset) => ({
      tag: asset.patrimonio || asset.id?.slice(0, 8) || '-',
      category: asset.categoria || 'outros',
      name: asset.nome || '-',
      serial_number: asset.numero_serie || '-',
      brand: asset.marca || '',
      model: asset.modelo || '',
      condition: asset.estado || 'bom',
    }));

    return { employee, normalizedAssets, departmentName };
  };

  const generatePdfMutation = useMutation({
    mutationFn: async ({ collaborator, assets: linkedAssets, latestTermsByAsset }) => {
      const ensuredTerms = await ensureTermRows(collaborator, linkedAssets, latestTermsByAsset);
      return { collaborator, ensuredTerms };
    },
    onSuccess: ({ collaborator, ensuredTerms }) => {
      queryClient.setQueryData(['termos_posse'], (old = []) => (
        Array.isArray(old) ? upsertTerms(old, ensuredTerms) : old
      ));
      queryClient.invalidateQueries({ queryKey: ['termos_posse'] });
      setFeedback({
        type: 'success',
        message: `Termo gerado com sucesso para ${collaborator.nome || collaborator.email}.`,
      });
    },
    onError: (error) => {
      setFeedback({
        type: 'error',
        message: error.message || 'Nao foi possivel gerar o termo.',
      });
    },
  });

  const signAsCompanyMutation = useMutation({
    mutationFn: async ({ collaborator, assets: linkedAssets, latestTermsByAsset }) => {
      if (!profile?.assinatura_url) {
        throw new Error('Cadastre sua assinatura no Perfil da intranet antes de assinar como empresa.');
      }

      const ensuredTerms = await ensureTermRows(collaborator, linkedAssets, latestTermsByAsset);
      const pendingTerms = ensuredTerms.filter((term) => term && term.status === 'gerado');

      if (!pendingTerms.length) {
        throw new Error('Nenhum termo pendente de assinatura da empresa para este colaborador.');
      }

      const { employee, normalizedAssets } = buildPdfPayload(collaborator, linkedAssets);
      const signedTerms = [];

      for (const term of pendingTerms) {
        const { arrayBuffer, empresaSignatureAnchor, colaboradorSignatureAnchor } = await generateTermoPDF(
          employee,
          normalizedAssets,
          { returnArrayBuffer: true },
        );

        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const signatureImage = await embedSignatureImage(pdfDoc, profile.assinatura_url);
        await stampSignature(pdfDoc, {
          ...empresaSignatureAnchor,
          signatureImage,
          signerName: profile.nome,
          signedAt: new Date().toISOString(),
          empresaNome: 'MACOM',
        });

        const signedBytes = await pdfDoc.save();
        const signedFile = new File([signedBytes], `termo-assinado-empresa-${term.id}.pdf`, {
          type: 'application/pdf',
        });
        const filePayload = await uploadSignedTermFile(signedFile, term.id);

        await catalogApi.assinaturas_termo_posse.create({
          termo_id: term.id,
          colaborador_id: profile.id,
          papel: 'empresa',
          posicao: empresaSignatureAnchor,
        });

        const updatedTerm = await catalogApi.termos_posse.update(term.id, {
          ...filePayload,
          colaborador_anchor: colaboradorSignatureAnchor,
        });

        if (term.arquivo_path && term.arquivo_path !== filePayload.arquivo_path) {
          await supabase.storage.from(SIGNED_FILE_BUCKET).remove([term.arquivo_path]);
        }

        signedTerms.push(updatedTerm);
      }

      return { collaborator, signedTerms };
    },
    onSuccess: ({ collaborator, signedTerms }) => {
      queryClient.setQueryData(['termos_posse'], (old = []) => (
        Array.isArray(old) ? upsertTerms(old, signedTerms) : old
      ));
      queryClient.invalidateQueries({ queryKey: ['termos_posse'] });
      setFeedback({
        type: 'success',
        message: `Termo assinado pela empresa para ${collaborator.nome || collaborator.email}.`,
      });
    },
    onError: (error) => {
      setFeedback({
        type: 'error',
        message: error.message || 'Nao foi possivel assinar o termo como empresa.',
      });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async ({ collaborator, assets: linkedAssets, latestTermsByAsset }) => {
      if (!collaborator.email) {
        throw new Error('Colaborador sem email cadastrado.');
      }

      const ensuredTerms = await ensureTermRows(collaborator, linkedAssets, latestTermsByAsset);
      const { employee, normalizedAssets } = buildPdfPayload(collaborator, linkedAssets);
      const { blob, filename } = await generateTermoPDF(employee, normalizedAssets, { returnBlob: true });
      const pdf_base64 = await blobToBase64(blob);
      const dataAtual = format(new Date(), 'dd/MM/yyyy');

      const subject = `Termo de Responsabilidade e Posse de Equipamento - ${employee.full_name}`;
      const body_text = [
        `Ola, ${employee.full_name}.`,
        '',
        'Segue em anexo o seu termo de responsabilidade referente aos equipamentos de TI vinculados ao seu nome.',
        '',
        'Em caso de duvidas, entre em contato com o time de TI.',
        '',
        'Atenciosamente,',
        'Equipe de TI',
      ].join('\n');
      const body_html = `
        <div style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#111827;">
          <div style="max-width:620px;margin:24px auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <div style="background:#c1121f;padding:16px 20px;">
              <p style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:0.18em;line-height:1;font-family:Arial,Helvetica,sans-serif;">
                MACOM
              </p>
            </div>

            <div style="padding:24px 20px;">
              <h2 style="margin:0 0 14px;font-size:21px;font-weight:700;line-height:1.25;color:#111827;font-family:Arial,Helvetica,sans-serif;">
                Termo de Responsabilidade de Ativos de TI
              </h2>

              <p style="margin:0 0 14px;font-size:14px;font-weight:400;line-height:1.65;color:#374151;font-family:Arial,Helvetica,sans-serif;">
                Ola <strong style="font-weight:700;color:#1f2937;">${employee.full_name}</strong>,
              </p>

              <p style="margin:0 0 14px;font-size:14px;font-weight:400;line-height:1.7;color:#374151;font-family:Arial,Helvetica,sans-serif;">
                Segue em anexo o seu termo de responsabilidade referente aos equipamentos de TI vinculados ao seu nome.
              </p>

              <div style="margin:18px 0;padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa;">
                <p style="margin:0;font-size:13px;font-weight:400;line-height:1.5;color:#4b5563;font-family:Arial,Helvetica,sans-serif;">
                  <strong style="font-weight:700;color:#374151;">Colaborador:</strong> ${employee.full_name}
                </p>
                <p style="margin:6px 0 0;font-size:13px;font-weight:400;line-height:1.5;color:#4b5563;font-family:Arial,Helvetica,sans-serif;">
                  <strong style="font-weight:700;color:#374151;">Data do envio:</strong> ${dataAtual}
                </p>
              </div>

              <p style="margin:0;font-size:14px;font-weight:400;line-height:1.7;color:#374151;font-family:Arial,Helvetica,sans-serif;">
                Em caso de duvidas, entre em contato com o time de TI.
              </p>
            </div>

            <div style="padding:14px 20px;background:#111827;">
              <p style="margin:0;font-size:12px;font-weight:400;line-height:1.4;color:#e5e7eb;font-family:Arial,Helvetica,sans-serif;">
                MACOM Mitsubishi Motors • Gestao de Ativos de TI
              </p>
            </div>
          </div>
        </div>
      `;

      await catalogApi.email.sendTermoGmail({
        to: collaborator.email,
        subject,
        body_text,
        body_html,
        filename,
        pdf_base64,
      });

      return { collaborator, ensuredTerms };
    },
    onSuccess: ({ collaborator, ensuredTerms }) => {
      queryClient.setQueryData(['termos_posse'], (old = []) => (
        Array.isArray(old) ? upsertTerms(old, ensuredTerms) : old
      ));
      queryClient.invalidateQueries({ queryKey: ['termos_posse'] });
      setFeedback({
        type: 'success',
        message: `Email enviado com sucesso para ${collaborator.nome || collaborator.email}.`,
      });
    },
    onError: (error) => {
      setFeedback({
        type: 'error',
        message: error.message || 'Nao foi possivel enviar o termo por email.',
      });
    },
  });

  const markSignedMutation = useMutation({
    mutationFn: async ({ collaborator, assets: linkedAssets, latestTermsByAsset }) => {
      const ensuredTerms = await ensureTermRows(collaborator, linkedAssets, latestTermsByAsset);
      const pendingTerms = ensuredTerms
        .filter((term) => term && term.status !== 'assinado');

      if (!pendingTerms.length) {
        throw new Error('Nenhum termo pendente encontrado para este colaborador.');
      }

      const now = new Date().toISOString();
      const signedTerms = await Promise.all(
        pendingTerms.map((term) =>
          catalogApi.termos_posse.update(term.id, {
            status: 'assinado',
            assinado_em: now,
          })
        )
      );

      return { collaborator, signedTerms };
    },
    onMutate: async ({ latestTermsByAsset }) => {
      const queryKey = ['termos_posse'];
      await queryClient.cancelQueries({ queryKey });
      const previousTerms = queryClient.getQueryData(queryKey);
      const now = new Date().toISOString();
      const optimisticTerms = Object.values(latestTermsByAsset)
        .filter((term) => term && term.status !== 'assinado')
        .map((term) => ({
          ...term,
          status: 'assinado',
          assinado_em: now,
          atualizado_em: now,
        }));

      queryClient.setQueryData(queryKey, (old = []) => (
        Array.isArray(old) ? upsertTerms(old, optimisticTerms) : old
      ));

      return { previousTerms, queryKey };
    },
    onSuccess: ({ collaborator, signedTerms }, _variables, context) => {
      queryClient.setQueryData(context.queryKey, (old = []) => (
        Array.isArray(old) ? upsertTerms(old, signedTerms) : old
      ));
      queryClient.invalidateQueries({ queryKey: ['termos_posse'] });
      setFeedback({
        type: 'success',
        message: `Termos marcados como assinados para ${collaborator.nome || collaborator.email}.`,
      });
    },
    onError: (error, _variables, context) => {
      if (context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousTerms);
      }
      setFeedback({
        type: 'error',
        message: error.message || 'Nao foi possivel marcar os termos como assinados.',
      });
    },
  });

  const attachSignedFileMutation = useMutation({
    mutationFn: async ({ term, file }) => {
      const filePayload = await uploadSignedTermFile(file, term.id);
      const updated = await catalogApi.termos_posse.update(term.id, filePayload);

      if (term.arquivo_path && term.arquivo_path !== filePayload.arquivo_path) {
        await supabase.storage.from(SIGNED_FILE_BUCKET).remove([term.arquivo_path]);
      }

      return updated;
    },
    onSuccess: (updatedTerm) => {
      queryClient.setQueryData(['termos_posse'], (old = []) => (
        Array.isArray(old) ? upsertTerms(old, updatedTerm) : old
      ));
      queryClient.invalidateQueries({ queryKey: ['termos_posse'] });
      setFeedback({ type: 'success', message: 'Comprovante assinado anexado com sucesso.' });
    },
    onError: (error) => {
      setFeedback({
        type: 'error',
        message: error.message || 'Nao foi possivel anexar o comprovante assinado.',
      });
    },
  });

  const registerReturnMutation = useMutation({
    mutationFn: async ({ term, asset, collaborator }) => {
      const now = new Date().toISOString();
      const { employee, normalizedAssets } = buildPdfPayload(collaborator, [asset]);
      const { blob, filename } = await generateDevolucaoPDF(employee, normalizedAssets[0], profile?.nome);
      const filePayload = await uploadDevolucaoReceipt(blob, filename, term.id);

      const updatedTerm = await catalogApi.termos_posse.update(term.id, {
        status: 'devolvido',
        devolvido_em: now,
        ...filePayload,
      });
      await catalogApi.ativos.update(asset.id, { usuario_id: null });
      return updatedTerm;
    },
    onSuccess: (updatedTerm) => {
      queryClient.setQueryData(['termos_posse'], (old = []) => (
        Array.isArray(old) ? upsertTerms(old, updatedTerm) : old
      ));
      queryClient.invalidateQueries({ queryKey: ['termos_posse'] });
      queryClient.invalidateQueries({ queryKey: ['ativos'] });
      queryClient.invalidateQueries({ queryKey: ['ativos_historico_posse'] });
      setFeedback({ type: 'success', message: 'Devolucao registrada e equipamento desvinculado do colaborador.' });
    },
    onError: (error) => {
      setFeedback({
        type: 'error',
        message: error.message || 'Nao foi possivel registrar a devolucao.',
      });
    },
  });

  const isLoading =
    collaboratorsQuery.isLoading ||
    assetsQuery.isLoading ||
    termsQuery.isLoading ||
    departmentsQuery.isLoading;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Termos de Posse</h1>
        <p className="mt-1 text-muted-foreground">Gere o PDF do termo de responsabilidade por colaborador.</p>
      </div>

      <Card className="rounded-2xl border border-border/80 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar colaborador..."
              className="h-10 rounded-xl border-border pl-10 text-xs"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-full rounded-xl border-border px-3 text-xs lg:w-[280px]">
              <SelectValue placeholder="Todos os colaboradores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os colaboradores</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="assinado_empresa">Assinado pela empresa</SelectItem>
              <SelectItem value="assinado">Assinados</SelectItem>
              <SelectItem value="sem_termo">Sem termo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex min-h-[45vh] items-center justify-center">
          <Spinner size="lg" className="text-primary" />
        </div>
      ) : collaboratorCards.length === 0 ? (
        <Card className="rounded-2xl p-10 text-center text-sm text-muted-foreground">
          Nenhum colaborador com equipamento vinculado foi encontrado.
        </Card>
      ) : (
        <div className="space-y-4">
          {paginatedCollaboratorCards.map(({ collaborator, assets: linkedAssets, status, latestTermsByAsset, termRows }) => {
            const departmentName = departmentById.get(collaborator.departamento_id) || 'Sem departamento';
            const statusInfo = statusMeta[status];
            const StatusIcon = statusInfo.icon;
            const collaboratorPending = pendingActions[collaborator.id] || {};
            const isGenerating = Boolean(collaboratorPending.generating);
            const isSigning = Boolean(collaboratorPending.signing);
            const isSending = Boolean(collaboratorPending.sending);
            const isCompanySigning = Boolean(collaboratorPending.companySigning);
            const hasPendingCompanySignature = termRows.some((term) => term.status === 'gerado');
            const hasAssetsAwaitingTerm = linkedAssets.some((asset) => {
              const term = latestTermsByAsset[asset.id];
              return !term || ['cancelado', 'devolvido'].includes(term.status);
            });
            const companySigned = status === 'assinado_empresa' || status === 'assinado';
            const collaboratorSigned = status === 'assinado';

            return (
              <Card
                key={collaborator.id}
                className={`overflow-hidden rounded-xl border text-card-foreground shadow transition-shadow duration-300 hover:shadow-lg ${statusInfo.cardClassName}`}
              >
                <div className="flex flex-col md:flex-row">
                  <aside className={`p-4 md:w-72 md:border-r ${statusInfo.asideClassName}`}>
                    <div className="mb-3 flex items-center gap-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-full ${statusInfo.avatarClassName}`}>
                        {status === 'assinado' ? (
                          <CheckCircle2 className={`h-4 w-4 ${statusInfo.avatarIconClassName}`} />
                        ) : (
                          <UserRound className={`h-4 w-4 ${statusInfo.avatarIconClassName}`} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-foreground">{collaborator.nome || 'Sem nome'}</p>
                        <p className="truncate text-xs text-muted-foreground">{departmentName}</p>
                      </div>
                    </div>

                    <div className={`mb-3 inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs ${statusInfo.className}`}>
                      <StatusIcon className="h-3 w-3" />
                      {statusInfo.label}
                    </div>

                    {hasAssetsAwaitingTerm && (
                      <div className="mb-3 inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                        <FileText className="h-3 w-3" />
                        Equipamento sem termo gerado
                      </div>
                    )}

                    {status !== 'sem_termo' && (
                      <div className="mb-3 space-y-1 rounded-md border border-border bg-background/60 px-2.5 py-1.5">
                        <div
                          className={`flex items-center gap-1.5 text-[11px] font-medium ${
                            companySigned ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                          }`}
                        >
                          {companySigned ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                          Empresa {companySigned ? 'assinou' : 'ainda nao assinou'}
                        </div>
                        <div
                          className={`flex items-center gap-1.5 text-[11px] font-medium ${
                            collaboratorSigned ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                          }`}
                        >
                          {collaboratorSigned ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                          Colaborador {collaboratorSigned ? 'assinou' : 'ainda nao assinou'}
                        </div>
                      </div>
                    )}

                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>CPF: {formatCpf(collaborator.cpf)}</p>
                      <p className="break-all">{collaborator.email || '-'}</p>
                      {termRows.length ? (
                        <p>Ultima geracao: {formatDateTime(termRows[0]?.gerado_em)}</p>
                      ) : null}
                    </div>

                    <div className="mt-5 space-y-2">
                      <Button
                        className="h-8 w-full rounded-lg bg-[#d1131f] px-2.5 text-[11px] font-semibold hover:bg-[#b50f1a]"
                        onClick={async () => {
                          setActionPending(collaborator.id, 'generating', true);
                          try {
                            await generatePdfMutation.mutateAsync({ collaborator, assets: linkedAssets, latestTermsByAsset });
                          } catch {
                            /* feedback already handled by mutation onError */
                          } finally {
                            setActionPending(collaborator.id, 'generating', false);
                          }
                        }}
                        disabled={isGenerating || isSigning || isSending || isCompanySigning}
                      >
                        <FileText className="mr-1.5 h-3 w-3" />
                        {isGenerating ? 'Gerando...' : 'Gerar Termo'}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 w-full rounded-lg border-sky-200 bg-sky-50 px-2.5 text-[11px] text-sky-700 hover:bg-sky-100 hover:text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300 dark:hover:bg-sky-950/50"
                        onClick={async () => {
                          setActionPending(collaborator.id, 'companySigning', true);
                          try {
                            await signAsCompanyMutation.mutateAsync({ collaborator, assets: linkedAssets, latestTermsByAsset });
                          } catch {
                            /* feedback already handled by mutation onError */
                          } finally {
                            setActionPending(collaborator.id, 'companySigning', false);
                          }
                        }}
                        disabled={
                          isGenerating || isSigning || isSending || isCompanySigning ||
                          !hasPendingCompanySignature || !profile?.assinatura_url
                        }
                        title={!profile?.assinatura_url ? 'Cadastre sua assinatura no Perfil da intranet para assinar termos.' : undefined}
                      >
                        <PenLine className="mr-1.5 h-3 w-3" />
                        {isCompanySigning ? 'Assinando...' : 'Assinar como Empresa'}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 w-full rounded-lg px-2.5 text-[11px]"
                        onClick={async () => {
                          setActionPending(collaborator.id, 'sending', true);
                          try {
                            await sendEmailMutation.mutateAsync({ collaborator, assets: linkedAssets, latestTermsByAsset });
                          } catch {
                            /* feedback already handled by mutation onError */
                          } finally {
                            setActionPending(collaborator.id, 'sending', false);
                          }
                        }}
                        disabled={!collaborator.email || isGenerating || isSigning || isSending || isCompanySigning}
                      >
                        <Mail className="mr-1.5 h-3 w-3" />
                        {isSending ? 'Enviando...' : 'Enviar por Email'}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 w-full rounded-lg border-emerald-200 bg-emerald-50 px-2.5 text-[11px] text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
                        onClick={async () => {
                          setActionPending(collaborator.id, 'signing', true);
                          try {
                            await markSignedMutation.mutateAsync({ collaborator, assets: linkedAssets, latestTermsByAsset });
                          } catch {
                            /* feedback already handled by mutation onError */
                          } finally {
                            setActionPending(collaborator.id, 'signing', false);
                          }
                        }}
                        disabled={isGenerating || isSigning || isSending || isCompanySigning || !termRows.length || status === 'assinado'}
                      >
                        <CheckCircle2 className="mr-1.5 h-3 w-3" />
                        {isSigning ? 'Atualizando...' : 'Marcar como Assinado'}
                      </Button>
                    </div>
                  </aside>

                  <section className="flex-1 p-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {linkedAssets.length} {linkedAssets.length === 1 ? 'equipamento vinculado' : 'equipamentos vinculados'}
                    </p>

                    <div className="space-y-2">
                      {linkedAssets.map((asset) => {
                        const term = latestTermsByAsset[asset.id];
                        const inputId = `signed-file-${asset.id}`;
                        const isAttaching = attachSignedFileMutation.isPending && attachSignedFileMutation.variables?.term?.id === term?.id;
                        const isReturning = registerReturnMutation.isPending && registerReturnMutation.variables?.asset?.id === asset.id;
                        const canAttachFile = term && term.status !== 'assinado' && term.status !== 'devolvido';

                        return (
                          <div
                            key={asset.id}
                            className="flex flex-col gap-2 rounded-lg bg-muted/40 p-2"
                          >
                            <div className="flex items-center gap-2.5">
                              <Monitor className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-foreground">{asset.nome || '-'}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {asset.patrimonio || '-'} · {asset.numero_serie || '-'}
                                </p>
                              </div>

                              <span className="shrink-0 rounded-md border border-border bg-background/60 px-2 py-0.5 text-xs text-foreground">
                                {asset.categoria || 'Equipamento'}
                              </span>
                            </div>

                            {term ? (
                              <div className="flex items-center gap-2 pl-6">
                                {term.arquivo_path ? (
                                  <>
                                    <button
                                      type="button"
                                      className="truncate text-xs text-primary underline-offset-2 hover:underline"
                                      onClick={() => openSignedTermFile(term.arquivo_path).catch((error) => (
                                        setFeedback({ type: 'error', message: error.message })
                                      ))}
                                    >
                                      {term.arquivo_nome || 'Comprovante assinado'}
                                    </button>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                      {formatFileSize(term.arquivo_tamanho)}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Sem comprovante assinado anexado.</span>
                                )}

                                {canAttachFile ? (
                                  <>
                                    <input
                                      id={inputId}
                                      type="file"
                                      accept={SIGNED_FILE_ACCEPT}
                                      className="hidden"
                                      onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        event.target.value = '';
                                        if (file) {
                                          attachSignedFileMutation.mutate({ term, file });
                                        }
                                      }}
                                    />
                                    <label
                                      htmlFor={inputId}
                                      className="ml-auto inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-muted"
                                    >
                                      <Paperclip className="h-3 w-3" />
                                      {isAttaching ? 'Enviando...' : term.arquivo_path ? 'Substituir' : 'Anexar comprovante'}
                                    </label>
                                  </>
                                ) : null}
                              </div>
                            ) : (
                              <p className="pl-6 text-xs text-muted-foreground">
                                Gere o termo para poder anexar o comprovante assinado.
                              </p>
                            )}

                            {term?.status === 'assinado' ? (
                              <div className="pl-6">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 rounded-md border-amber-200 bg-amber-50 px-2 text-xs text-amber-700 hover:bg-amber-100 hover:text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50"
                                  onClick={() => registerReturnMutation.mutate({ term, asset, collaborator })}
                                  disabled={isReturning}
                                >
                                  <RotateCcw className="mr-1.5 h-3 w-3" />
                                  {isReturning ? 'Registrando...' : 'Registrar devolucao'}
                                </Button>
                              </div>
                            ) : term?.status === 'devolvido' ? (
                              <div className="flex items-center gap-2 pl-6">
                                <p className="text-xs text-muted-foreground">
                                  Devolvido em {formatDateTime(term.devolvido_em)}
                                </p>
                                {term.arquivo_devolucao_path ? (
                                  <button
                                    type="button"
                                    className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                                    onClick={() => openSignedTermFile(term.arquivo_devolucao_path)}
                                  >
                                    Baixar comprovante
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </Card>
            );
          })}

          <Card className="rounded-2xl border border-border/80 p-0 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <PaginationControls
              page={currentPage}
              pageSize={pageSize}
              totalItems={collaboratorCards.length}
              onPageChange={setPage}
              onPageSizeChange={(value) => {
                setPageSize(value);
                setPage(1);
              }}
            />
          </Card>
        </div>
      )}

      <FeedbackToast feedback={feedback} onClose={() => setFeedback(null)} />
    </div>
  );
}

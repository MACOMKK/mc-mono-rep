import { useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';

import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@macom/ui';
import { isAllowedChecklistFotoMimeType, uploadChecklistFoto } from '@/lib/checklistFotoUpload';
import { oficinaApi } from '@macom/api-client/oficinaApi';
import { FOTO_CATEGORIAS, MAX_FOTOS } from '@/lib/checklistItens';

async function comprimirFoto(file, maxDimensao = 1600, qualidade = 0.8) {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, maxDimensao / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0, largura, altura);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', qualidade));
  return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
}

export default function FotoUploadGrid({ avaliacaoId, fotos = [], onFotoAdicionada, onFotoAtualizada, onFotoRemovida, readOnly = false }) {
  const inputRef = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);

  const handleSelecionarArquivos = async (event) => {
    const arquivos = Array.from(event.target.files || []);
    event.target.value = '';
    if (arquivos.length === 0) return;

    if (fotos.length + arquivos.length > MAX_FOTOS) {
      setErro(`Máximo de ${MAX_FOTOS} fotos por checklist.`);
      return;
    }

    setEnviando(true);
    setErro(null);
    try {
      for (const arquivo of arquivos) {
        if (!isAllowedChecklistFotoMimeType(arquivo)) continue;
        const comprimido = await comprimirFoto(arquivo);
        const foto = await uploadChecklistFoto({ file: comprimido, avaliacaoId, categoria: FOTO_CATEGORIAS[0], legenda: '' });
        onFotoAdicionada?.(foto);
      }
    } catch (error) {
      setErro(error.message || 'Não foi possível enviar a foto.');
    } finally {
      setEnviando(false);
    }
  };

  const handleAtualizarCampo = async (foto, campo, valor) => {
    const atualizada = { ...foto, [campo]: valor };
    onFotoAtualizada?.(atualizada);
    await oficinaApi.fotos.atualizar(avaliacaoId, {
      storagePath: foto.storage_path,
      categoria: atualizada.categoria,
      legenda: atualizada.legenda,
    });
  };

  const handleRemover = async (foto) => {
    await oficinaApi.fotos.remover(avaliacaoId, foto.storage_path);
    onFotoRemovida?.(foto.storage_path);
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold">Fotos do veículo</h2>
        <p className="text-xs text-muted-foreground">
          Adicione até {MAX_FOTOS} fotos. Escolha o tipo e escreva a legenda de cada uma — elas serão impressas na
          segunda página do documento.
        </p>
      </div>

      {!readOnly && (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleSelecionarArquivos}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={enviando || fotos.length >= MAX_FOTOS}
          >
            <Upload className="mr-2 h-4 w-4" />
            {enviando ? 'Enviando...' : `Adicionar fotos (${fotos.length}/${MAX_FOTOS})`}
          </Button>
        </div>
      )}
      {erro && <p className="text-xs text-destructive">{erro}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fotos.map((foto, index) => (
          <div key={`${foto.storage_path}-${index}`} className="flex flex-col gap-3 rounded-xl border p-3">
            <img src={foto.url} alt={foto.categoria || 'Foto do veículo'} className="aspect-video w-full rounded-lg object-cover" />

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Tipo da foto</label>
              <Select
                value={foto.categoria || FOTO_CATEGORIAS[0]}
                onValueChange={(valor) => handleAtualizarCampo(foto, 'categoria', valor)}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOTO_CATEGORIAS.map((opcao) => (
                    <SelectItem key={opcao} value={opcao}>
                      {opcao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Legenda da foto</label>
              <Input
                defaultValue={foto.legenda || ''}
                placeholder="Descreva o que mostra a foto"
                disabled={readOnly}
                onBlur={(event) => handleAtualizarCampo(foto, 'legenda', event.target.value)}
              />
            </div>

            {!readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-center text-destructive hover:text-destructive"
                onClick={() => handleRemover(foto)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remover
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

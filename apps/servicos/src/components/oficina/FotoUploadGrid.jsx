import { useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';

import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Spinner } from '@macom/ui';
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
  const [pendentes, setPendentes] = useState([]);
  const [erro, setErro] = useState(null);

  const removerPendente = (id) => {
    setPendentes((atual) => {
      const alvo = atual.find((item) => item._id === id);
      if (alvo?.url) URL.revokeObjectURL(alvo.url);
      return atual.filter((item) => item._id !== id);
    });
  };

  const processarArquivo = async (arquivo, id) => {
    try {
      const comprimido = await comprimirFoto(arquivo);
      const foto = await uploadChecklistFoto({ file: comprimido, avaliacaoId, categoria: FOTO_CATEGORIAS[0], legenda: '' });
      onFotoAdicionada?.(foto);
      removerPendente(id);
    } catch (error) {
      setErro(error.message || 'Não foi possível enviar a foto.');
      setPendentes((atual) => atual.map((item) => (item._id === id ? { ...item, _status: 'erro' } : item)));
    }
  };

  const handleSelecionarArquivos = (event) => {
    const arquivos = Array.from(event.target.files || []);
    event.target.value = '';
    if (arquivos.length === 0) return;

    if (fotos.length + pendentes.length + arquivos.length > MAX_FOTOS) {
      setErro(`Máximo de ${MAX_FOTOS} fotos por checklist.`);
      return;
    }

    setErro(null);
    arquivos.forEach((arquivo) => {
      if (!isAllowedChecklistFotoMimeType(arquivo)) return;
      const id = crypto.randomUUID();
      const otimista = {
        _id: id,
        _status: 'enviando',
        storage_path: `temp-${id}`,
        categoria: FOTO_CATEGORIAS[0],
        legenda: '',
        url: URL.createObjectURL(arquivo),
      };
      setPendentes((atual) => [...atual, otimista]);
      processarArquivo(arquivo, id);
    });
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
            disabled={fotos.length + pendentes.length >= MAX_FOTOS}
          >
            <Upload className="mr-2 h-4 w-4" />
            {`Adicionar fotos (${fotos.length + pendentes.length}/${MAX_FOTOS})`}
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

        {!readOnly &&
          pendentes.map((foto) => (
            <div key={foto._id} className="flex flex-col gap-3 rounded-xl border p-3">
              <div className="relative">
                <img src={foto.url} alt="Enviando foto" className="aspect-video w-full rounded-lg object-cover" />
                {foto._status === 'enviando' && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
                    <Spinner className="text-white" />
                  </div>
                )}
              </div>

              {foto._status === 'erro' ? (
                <>
                  <p className="text-xs text-destructive">Falha ao enviar esta foto.</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="self-center text-destructive hover:text-destructive"
                    onClick={() => removerPendente(foto._id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remover
                  </Button>
                </>
              ) : (
                <p className="text-center text-xs text-muted-foreground">Enviando...</p>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

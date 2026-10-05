import { useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';

import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Spinner } from '@macom/ui';
import { comprimirChecklistFoto, isAllowedChecklistFotoMimeType, uploadChecklistFoto } from '@/lib/checklistFotoUpload';
import { oficinaApi } from '@macom/api-client/oficinaApi';
import { FOTO_CATEGORIAS, MAX_FOTOS } from '@/lib/checklistItens';
import { toUpperText } from '@/lib/oficinaFormat';

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

  // Processa um arquivo por vez -- upar varias fotos em paralelo sobrecarrega
  // conexoes ruins (tablet em rede fraca), entao o handler abaixo aguarda cada
  // uma terminar antes de disparar a proxima.
  const processarArquivo = async (arquivoOriginal, id, arquivoJaComprimido) => {
    setPendentes((atual) => atual.map((item) => (item._id === id ? { ...item, _status: 'enviando' } : item)));
    try {
      const comprimido = arquivoJaComprimido || (await comprimirChecklistFoto(arquivoOriginal));
      setPendentes((atual) => atual.map((item) => (item._id === id ? { ...item, _arquivoComprimido: comprimido } : item)));
      const foto = await uploadChecklistFoto({ file: comprimido, avaliacaoId, categoria: FOTO_CATEGORIAS[0], legenda: '' });
      onFotoAdicionada?.(foto);
      removerPendente(id);
    } catch (error) {
      setErro(error.message || 'Não foi possível enviar a foto.');
      setPendentes((atual) => atual.map((item) => (item._id === id ? { ...item, _status: 'erro' } : item)));
    }
  };

  const handleTentarNovamente = (item) => {
    setErro(null);
    processarArquivo(item._arquivoOriginal, item._id, item._arquivoComprimido);
  };

  const handleSelecionarArquivos = async (event) => {
    const arquivos = Array.from(event.target.files || []);
    event.target.value = '';
    if (arquivos.length === 0) return;

    if (fotos.length + pendentes.length + arquivos.length > MAX_FOTOS) {
      setErro(`Máximo de ${MAX_FOTOS} fotos por checklist.`);
      return;
    }

    setErro(null);
    for (const arquivo of arquivos) {
      if (!isAllowedChecklistFotoMimeType(arquivo)) continue;
      const id = crypto.randomUUID();
      const otimista = {
        _id: id,
        _status: 'enviando',
        _arquivoOriginal: arquivo,
        storage_path: `temp-${id}`,
        categoria: FOTO_CATEGORIAS[0],
        legenda: '',
        url: URL.createObjectURL(arquivo),
      };
      setPendentes((atual) => [...atual, otimista]);
      // eslint-disable-next-line no-await-in-loop -- upload sequencial e intencional (evitar sobrecarregar rede fraca)
      await processarArquivo(arquivo, id);
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

            {foto.avaria_id && (
              <span className="w-fit rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                Vinculada a um amassado
              </span>
            )}

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
                className="uppercase"
                defaultValue={foto.legenda || ''}
                placeholder="Descreva o que mostra a foto"
                disabled={readOnly}
                onBlur={(event) => handleAtualizarCampo(foto, 'legenda', toUpperText(event.target.value))}
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
                  <div className="flex justify-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => handleTentarNovamente(foto)}>
                      Tentar novamente
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removerPendente(foto._id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remover
                    </Button>
                  </div>
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

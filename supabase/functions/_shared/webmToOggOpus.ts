// Remuxa um WebM Opus (saida do MediaRecorder do navegador, usado na gravacao de audio do
// composer de Atendimento) para Ogg Opus, sem reencodar o audio -- so troca o container.
//
// Por que isso existe: a Cloud API da Meta (e o WhatsApp em geral) so aceita audio em
// audio/aac, audio/mp4, audio/mpeg, audio/amr ou audio/ogg (exclusivamente com codec Opus).
// audio/webm nao esta na lista -- a Meta aceita o POST (por isso a mensagem chega a mostrar
// "enviado", 1 check) mas rejeita ao buscar a url pra processar a midia, e a mensagem nunca
// chega ao cliente. Chrome/Edge (desktop e Android) so gravam em webm via MediaRecorder, nao
// suportam gravar direto em ogg -- por isso o remux acontece aqui, no backend, apos o upload
// receber o blob gravado.
//
// Formato CodecPrivate do Opus dentro do WebM = exatamente os bytes do pacote OpusHead (ver
// https://wiki.xiph.org/MatroskaOpus) -- por isso ele e' reaproveitado direto como primeiro
// pacote do Ogg, sem precisar remontar.

const ID_SEGMENT = 0x18538067;
const ID_TRACKS = 0x1654ae6b;
const ID_TRACK_ENTRY = 0xae;
const ID_TRACK_NUMBER = 0xd7;
const ID_CODEC_ID = 0x86;
const ID_CODEC_PRIVATE = 0x63a2;
const ID_CLUSTER = 0x1f43b675;
const ID_SIMPLE_BLOCK = 0xa3;
const ID_BLOCK_GROUP = 0xa0;
const ID_BLOCK = 0xa1;

const CLUSTER_CHILD_IDS = new Set([0xe7 /* Timecode */, ID_SIMPLE_BLOCK, ID_BLOCK_GROUP, 0xa7 /* Position */, 0xab /* PrevSize */]);

type Vint = { value: number; length: number; unknown: boolean };

function readVint(buf: Uint8Array<ArrayBufferLike>, pos: number, maskFirst: boolean): Vint {
  const first = buf[pos];
  if (first === undefined) throw new Error('EBML: fim inesperado do buffer ao ler vint.');

  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }
  if (length > 8) throw new Error('EBML: vint invalido.');

  let value: number;
  let unknown = false;
  if (maskFirst) {
    const firstBits = first & (mask - 1);
    let allOnes = firstBits === mask - 1;
    value = firstBits;
    for (let i = 1; i < length; i += 1) {
      const b = buf[pos + i];
      if (b !== 0xff) allOnes = false;
      value = value * 256 + b;
    }
    unknown = allOnes;
  } else {
    value = first;
    for (let i = 1; i < length; i += 1) value = value * 256 + buf[pos + i];
  }
  return { value, length, unknown };
}

function readUintBE(buf: Uint8Array<ArrayBufferLike>, pos: number, len: number): number {
  let v = 0;
  for (let i = 0; i < len; i += 1) v = v * 256 + buf[pos + i];
  return v;
}

type AudioPacket = { trackNumber: number; data: Uint8Array };

function parseBlockContent(buf: Uint8Array<ArrayBufferLike>, start: number, end: number): AudioPacket | null {
  const trackVint = readVint(buf, start, true);
  let pos = start + trackVint.length;
  pos += 2; // timecode relativo (int16), nao usado -- duracao vem do TOC do pacote Opus
  const flags = buf[pos];
  pos += 1;
  const lacing = (flags >> 1) & 0x03;
  if (lacing !== 0) return null; // lacing nao esperado em gravacao simples de audio; ignora defensivamente
  return { trackNumber: trackVint.value, data: buf.slice(pos, end) };
}

function parseCluster(buf: Uint8Array<ArrayBufferLike>, start: number, end: number): { packets: AudioPacket[]; nextPos: number } {
  let pos = start;
  const packets: AudioPacket[] = [];
  while (pos < end) {
    const idStart = pos;
    const id = readVint(buf, pos, false);
    let p = pos + id.length;
    const size = readVint(buf, p, true);
    p += size.length;

    if (!CLUSTER_CHILD_IDS.has(id.value) || size.unknown) {
      return { packets, nextPos: idStart };
    }

    const elemEnd = p + size.value;
    if (id.value === ID_SIMPLE_BLOCK) {
      const blk = parseBlockContent(buf, p, elemEnd);
      if (blk) packets.push(blk);
    } else if (id.value === ID_BLOCK_GROUP) {
      let bp = p;
      while (bp < elemEnd) {
        const bid = readVint(buf, bp, false);
        let bp2 = bp + bid.length;
        const bsize = readVint(buf, bp2, true);
        bp2 += bsize.length;
        if (bsize.unknown) break;
        const bEnd = bp2 + bsize.value;
        if (bid.value === ID_BLOCK) {
          const blk = parseBlockContent(buf, bp2, bEnd);
          if (blk) packets.push(blk);
        }
        bp = bEnd;
      }
    }
    pos = elemEnd;
  }
  return { packets, nextPos: pos };
}

function parseTrackEntry(buf: Uint8Array<ArrayBufferLike>, start: number, end: number) {
  let pos = start;
  let trackNumber = -1;
  let codecId = '';
  let codecPrivate: Uint8Array | null = null;
  while (pos < end) {
    const id = readVint(buf, pos, false);
    let p = pos + id.length;
    const size = readVint(buf, p, true);
    p += size.length;
    if (size.unknown) break;
    const elemEnd = p + size.value;
    if (id.value === ID_TRACK_NUMBER) {
      trackNumber = readUintBE(buf, p, size.value);
    } else if (id.value === ID_CODEC_ID) {
      codecId = new TextDecoder('ascii').decode(buf.slice(p, elemEnd)).replace(/\0+$/, '');
    } else if (id.value === ID_CODEC_PRIVATE) {
      codecPrivate = buf.slice(p, elemEnd);
    }
    pos = elemEnd;
  }
  return { trackNumber, codecId, codecPrivate };
}

function parseTracks(buf: Uint8Array<ArrayBufferLike>, start: number, end: number) {
  let pos = start;
  let trackNumber = -1;
  let opusHead: Uint8Array | null = null;
  while (pos < end) {
    const id = readVint(buf, pos, false);
    let p = pos + id.length;
    const size = readVint(buf, p, true);
    p += size.length;
    if (size.unknown) break;
    const elemEnd = p + size.value;
    if (id.value === ID_TRACK_ENTRY) {
      const te = parseTrackEntry(buf, p, elemEnd);
      if (te.codecId === 'A_OPUS' && te.codecPrivate) {
        trackNumber = te.trackNumber;
        opusHead = te.codecPrivate;
      }
    }
    pos = elemEnd;
  }
  return { trackNumber, opusHead };
}

function parseSegment(buf: Uint8Array<ArrayBufferLike>, start: number, end: number) {
  let pos = start;
  let trackNumber = -1;
  let opusHead: Uint8Array | null = null;
  const packets: AudioPacket[] = [];
  while (pos < end && pos < buf.length) {
    const id = readVint(buf, pos, false);
    let p = pos + id.length;
    const size = readVint(buf, p, true);
    p += size.length;

    if (id.value === ID_TRACKS) {
      const tEnd = size.unknown ? end : Math.min(end, p + size.value);
      const t = parseTracks(buf, p, tEnd);
      if (t.opusHead) {
        trackNumber = t.trackNumber;
        opusHead = t.opusHead;
      }
      pos = tEnd;
    } else if (id.value === ID_CLUSTER) {
      const cEnd = size.unknown ? end : Math.min(end, p + size.value);
      const r = parseCluster(buf, p, cEnd);
      packets.push(...r.packets);
      pos = r.nextPos;
    } else if (size.unknown) {
      pos = end;
    } else {
      pos = p + size.value;
    }
  }
  return { trackNumber, opusHead, packets };
}

function parseWebm(buf: Uint8Array<ArrayBufferLike>) {
  let pos = 0;
  while (pos < buf.length) {
    const id = readVint(buf, pos, false);
    let p = pos + id.length;
    const size = readVint(buf, p, true);
    p += size.length;

    if (id.value === ID_SEGMENT) {
      const segEnd = size.unknown ? buf.length : Math.min(buf.length, p + size.value);
      return parseSegment(buf, p, segEnd);
    }
    if (size.unknown) throw new Error('EBML: elemento top-level com tamanho desconhecido inesperado.');
    pos = p + size.value;
  }
  throw new Error('EBML: elemento Segment nao encontrado no WebM.');
}

// --- Duracao do pacote Opus a partir do TOC (RFC 6716 secao 3.1) --------------------------
const SILK_DURATIONS_MS = [10, 20, 40, 60];
const HYBRID_DURATIONS_MS = [10, 20];
const CELT_DURATIONS_MS = [2.5, 5, 10, 20];

function opusPacketDurationSamples(packet: Uint8Array): number {
  if (packet.length === 0) return 0;
  const toc = packet[0];
  const config = (toc >> 3) & 0x1f;
  const frameCountCode = toc & 0x03;

  let frameDurationMs: number;
  if (config < 12) frameDurationMs = SILK_DURATIONS_MS[config % 4];
  else if (config < 16) frameDurationMs = HYBRID_DURATIONS_MS[(config - 12) % 2];
  else frameDurationMs = CELT_DURATIONS_MS[(config - 16) % 4];

  let frameCount = 1;
  if (frameCountCode === 1 || frameCountCode === 2) frameCount = 2;
  else if (frameCountCode === 3) {
    frameCount = packet.length >= 2 ? packet[1] & 0x3f : 1;
    if (frameCount === 0) frameCount = 1;
  }

  return Math.round(frameDurationMs * frameCount * 48); // amostras a 48kHz
}

// --- Escrita do container Ogg -----------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let r = i << 24;
    for (let j = 0; j < 8; j += 1) {
      r = (r & 0x80000000) !== 0 ? (r << 1) ^ 0x04c11db7 : r << 1;
      r >>>= 0;
    }
    table[i] = r >>> 0;
  }
  return table;
})();

function oggCrc32(data: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < data.length; i += 1) {
    crc = (((crc << 8) >>> 0) ^ CRC_TABLE[((crc >>> 24) ^ data[i]) & 0xff]) >>> 0;
  }
  return crc >>> 0;
}

function writeUInt32LE(arr: Uint8Array, offset: number, value: number) {
  arr[offset] = value & 0xff;
  arr[offset + 1] = (value >>> 8) & 0xff;
  arr[offset + 2] = (value >>> 16) & 0xff;
  arr[offset + 3] = (value >>> 24) & 0xff;
}

function writeUInt64LE(arr: Uint8Array, offset: number, value: number) {
  const lo = value % 4294967296;
  const hi = Math.floor(value / 4294967296);
  writeUInt32LE(arr, offset, lo);
  writeUInt32LE(arr, offset + 4, hi);
}

function packetSegments(len: number): number[] {
  const segs: number[] = [];
  let remaining = len;
  while (remaining >= 255) {
    segs.push(255);
    remaining -= 255;
  }
  segs.push(remaining);
  return segs;
}

function buildOggPage(
  serial: number,
  seq: number,
  granule: number,
  headerType: number,
  segments: number[],
  payload: Uint8Array,
): Uint8Array {
  const headerLen = 27 + segments.length;
  const page = new Uint8Array(headerLen + payload.length);
  page.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  page[4] = 0;
  page[5] = headerType;
  writeUInt64LE(page, 6, granule);
  writeUInt32LE(page, 14, serial);
  writeUInt32LE(page, 18, seq);
  writeUInt32LE(page, 22, 0);
  page[26] = segments.length;
  page.set(segments, 27);
  page.set(payload, headerLen);
  writeUInt32LE(page, 22, oggCrc32(page));
  return page;
}

function concatBytes(parts: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function remuxWebmOpusParaOggOpus(webm: Uint8Array<ArrayBufferLike>): Uint8Array {
  const { trackNumber, opusHead, packets } = parseWebm(webm);
  if (trackNumber < 0 || !opusHead) {
    throw new Error('Trilha de audio Opus nao encontrada no WebM.');
  }

  const audioPackets = packets.filter((p) => p.trackNumber === trackNumber).map((p) => p.data);
  if (audioPackets.length === 0) {
    throw new Error('Nenhum pacote de audio encontrado no WebM.');
  }

  const serial = Math.floor(Math.random() * 0xffffffff) >>> 0;
  const pages: Uint8Array[] = [];
  let seq = 0;

  pages.push(buildOggPage(serial, seq, 0, 0x02, packetSegments(opusHead.length), opusHead));
  seq += 1;

  const vendor = new TextEncoder().encode('macom-crm');
  const tagsHeader = new TextEncoder().encode('OpusTags');
  const tagsBuf = new Uint8Array(8 + 4 + vendor.length + 4);
  let o = 0;
  tagsBuf.set(tagsHeader, o);
  o += 8;
  writeUInt32LE(tagsBuf, o, vendor.length);
  o += 4;
  tagsBuf.set(vendor, o);
  o += vendor.length;
  writeUInt32LE(tagsBuf, o, 0); // 0 comentarios
  pages.push(buildOggPage(serial, seq, 0, 0x00, packetSegments(tagsBuf.length), tagsBuf));
  seq += 1;

  let granule = 0;
  let segments: number[] = [];
  let payloadParts: Uint8Array[] = [];
  let payloadLen = 0;

  const flush = (isLast: boolean) => {
    if (segments.length === 0) return;
    const payload = concatBytes(payloadParts, payloadLen);
    pages.push(buildOggPage(serial, seq, granule, isLast ? 0x04 : 0x00, segments, payload));
    seq += 1;
    segments = [];
    payloadParts = [];
    payloadLen = 0;
  };

  for (let i = 0; i < audioPackets.length; i += 1) {
    const packet = audioPackets[i];
    const segs = packetSegments(packet.length);
    if (segments.length + segs.length > 255) flush(false);
    segments.push(...segs);
    payloadParts.push(packet);
    payloadLen += packet.length;
    granule += opusPacketDurationSamples(packet);
    if (i === audioPackets.length - 1) flush(true);
  }

  return concatBytes(pages, pages.reduce((sum, p) => sum + p.length, 0));
}

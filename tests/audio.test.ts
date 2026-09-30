import { describe, expect, test } from 'bun:test';
import {
  audioChunksToBlob,
  base64ToBytes,
  isRawPcmMime,
  parsePcmRate,
  pcmChunksToWavBlob,
} from '../src/client/lib/audio';

const toBase64 = (bytes: Uint8Array): string =>
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');

describe('client audio utils', () => {
  test('base64ToBytes handles raw, data-URL and empty input', () => {
    const raw = new Uint8Array([0, 1, 2, 255]);
    expect(base64ToBytes(toBase64(raw))).toEqual(raw);
    expect(base64ToBytes(`data:audio/wav;base64,${toBase64(raw)}`)).toEqual(raw);
    expect(base64ToBytes('').length).toBe(0);
  });

  test('base64ToBytes rejects invalid input explicitly', () => {
    expect(() => base64ToBytes('!!!not-base64!!!')).toThrow();
  });

  test('parsePcmRate extracts rate and falls back to 24000', () => {
    expect(parsePcmRate('audio/L16;codec=pcm;rate=24000')).toBe(24000);
    expect(parsePcmRate('audio/L16;rate=16000')).toBe(16000);
    expect(parsePcmRate('audio/wav')).toBe(24000);
    expect(parsePcmRate(null)).toBe(24000);
    expect(parsePcmRate('audio/L16;rate=999999')).toBe(24000);
  });

  test('isRawPcmMime distinguishes streaming PCM from complete files', () => {
    expect(isRawPcmMime('audio/L16;codec=pcm;rate=24000')).toBe(true);
    expect(isRawPcmMime('audio/pcm')).toBe(true);
    expect(isRawPcmMime('audio/wav')).toBe(false);
    expect(isRawPcmMime('audio/mpeg')).toBe(false);
    expect(isRawPcmMime('audio/ogg')).toBe(false);
  });

  test('pcmChunksToWavBlob writes a valid WAV header', async () => {
    const chunk = new Uint8Array([1, 2, 3, 4]);
    const blob = pcmChunksToWavBlob([chunk], 16000);
    expect(blob.type).toBe('audio/wav');
    const buf = new Uint8Array(await blob.arrayBuffer());
    expect(buf.length).toBe(44 + 4);
    const ascii = (off: number, len: number) =>
      String.fromCharCode(...buf.slice(off, off + len));
    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 4)).toBe('WAVE');
    expect(new DataView(buf.buffer).getUint32(24, true)).toBe(16000);
    expect(buf.slice(44)).toEqual(chunk);
  });

  test('audioChunksToBlob passes complete files through untouched', async () => {
    const wavBytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3]);
    const wav = audioChunksToBlob([wavBytes.slice(0, 4), wavBytes.slice(4)], 'audio/wav', 24000);
    expect(wav.type).toBe('audio/wav');
    expect(new Uint8Array(await wav.arrayBuffer())).toEqual(wavBytes);

    const mp3Bytes = new Uint8Array([255, 251, 0, 1]);
    const mp3 = audioChunksToBlob([mp3Bytes], 'audio/mpeg', 24000);
    expect(mp3.type).toBe('audio/mpeg');
    expect(new Uint8Array(await mp3.arrayBuffer())).toEqual(mp3Bytes);
  });

  test('audioChunksToBlob wraps PCM as WAV and rejects empty input', async () => {
    const blob = audioChunksToBlob(
      [new Uint8Array([0, 0])],
      'audio/L16;codec=pcm;rate=24000',
      24000
    );
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44 + 2);
    expect(() => audioChunksToBlob([], 'audio/wav', 24000)).toThrow();
  });
});

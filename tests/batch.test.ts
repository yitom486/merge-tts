import { describe, expect, test } from 'bun:test';
import { createTTSApp } from '../src/server/app';
import { normalizeBatchJob, validateBatchCreateInput } from '../src/server/batch';

const base = { model: 'gemini-3.8-flash-tts', voiceName: 'Kore' };

describe('official async batch (B)', () => {
  test('rejects missing model / voice / text with 400-shaped errors', () => {
    expect(() => validateBatchCreateInput({ items: [{ text: 'あ' }] })).toThrow();
    expect(() => validateBatchCreateInput({ ...base, items: [] })).toThrow();
    expect(() => validateBatchCreateInput({ ...base, items: [{ text: '  ' }] })).toThrow();
    expect(() => validateBatchCreateInput({ model: 'm', items: [{ text: 'あ' }] })).toThrow();
    const ok = validateBatchCreateInput({ ...base, items: [{ text: 'あ' }, { text: 'い', voiceName: 'Puck', key: 'i' }] });
    expect(ok.items.map((i) => i.key)).toEqual(['0', 'i']);
    expect(ok.items[1].voiceName).toBe('Puck');
  });

  test('rejects oversized batches without silent truncation', () => {
    const items = Array.from({ length: 101 }, (_, i) => ({ text: `かな${i}` }));
    expect(() => validateBatchCreateInput({ ...base, items })).toThrow();
  });

  test('normalizes mixed batch results without swallowing failures', () => {
    const job = {
      name: 'batches/abc',
      state: 'JOB_STATE_SUCCEEDED',
      dest: {
        inlinedResponses: [
          { metadata: { key: 'あ' }, response: { candidates: [{ content: { parts: [{ inlineData: { data: 'AAA', mimeType: 'audio/wav' } }] } }] } },
          { metadata: { key: 'い' }, error: { message: 'boom' } },
          { metadata: { key: 'う' }, response: { candidates: [] } },
        ],
      },
    };
    const out = normalizeBatchJob(job);
    expect(out.name).toBe('batches/abc');
    expect(out.results?.map((r) => [r.key, r.ok])).toEqual([['あ', true], ['い', false], ['う', false]]);
    expect(out.results?.[0].audioBase64).toBe('AAA');
    expect(out.results?.[1].error).toContain('boom');
  });

  test('routes reject unknown provider and missing key explicitly', async () => {
    const app = createTTSApp({ prefix: '/api', corsOrigins: false, enableLogger: false });
    const badProvider = await app.request('/api/tts/batch-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-gemini-api-key': 'k' },
      body: JSON.stringify({ provider: 'nope', model: 'm', voiceName: 'v', items: [{ text: 'あ' }] }),
    });
    expect(badProvider.status).toBe(400);
    const noKey = await app.request('/api/tts/batch-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'azure', model: 'm', voiceName: 'v', items: [{ text: 'あ' }] }),
    });
    // azure 未实现批量 → 400（显式不支持，不降级）
    expect(noKey.status).toBe(400);
    const noName = await app.request('/api/tts/batch-jobs?provider=gemini', {
      headers: { 'x-gemini-api-key': 'k' },
    });
    expect(noName.status).toBe(400);
  });
});

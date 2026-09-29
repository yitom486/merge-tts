import { describe, expect, test } from 'bun:test';
import { createTTSApp, createLocalTTSProvider, parseGenerateRequest } from '../src/server/app';
import { resolveLocalSpeechURL } from '../src/server/providers/local';
import { buildAzureSSML, listAzureVoices, synthesizeAzure } from '../src/server/providers/azure';

describe('local TTS provider', () => {
  test('accepts loopback endpoints and rejects remote or credential-bearing request URLs', () => {
    expect(resolveLocalSpeechURL('http://127.0.0.1:8880/v1', true).pathname).toBe('/v1/audio/speech');
    expect(resolveLocalSpeechURL('http://[::1]:8880/v1/audio/speech', true).hostname).toBe('[::1]');
    expect(() => resolveLocalSpeechURL('http://example.com/v1', true)).toThrow();
    expect(() => resolveLocalSpeechURL('http://user:secret@localhost/v1', true)).toThrow();
    expect(() => resolveLocalSpeechURL('file:///etc/passwd', true)).toThrow();
  });

  test('validates untrusted synthesis input', () => {
    expect(() => parseGenerateRequest(null)).toThrow();
    expect(() => parseGenerateRequest({ text: 'hi', voiceName: 'v', speed: 'fast' })).toThrow();
    expect(parseGenerateRequest({ text: 'hi', voiceName: 'v', speed: 1.2 }).speed).toBe(1.2);
  });

  test('synthesizes without a key and preserves audio MIME through a mounted prefix', async () => {
    let sent: { url: string; init: RequestInit } | undefined;
    const provider = createLocalTTSProvider({
      fetcher: async (input, init) => {
        sent = { url: String(input), init: init ?? {} };
        return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/mpeg' } });
      },
    });
    const app = createTTSApp({ prefix: '/engine', corsOrigins: false, enableLogger: false, extraProviders: [provider] });
    const response = await app.request('/engine/tts/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'local', endpoint: 'http://127.0.0.1:8880/v1/audio/speech', text: 'こんにちは', voiceName: 'ja', model: 'kokoro', speed: 1.25 }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(response.headers.get('content-disposition')).toContain('.mp3');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(sent?.url).toBe('http://127.0.0.1:8880/v1/audio/speech');
    expect(sent?.init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(sent?.init.body))).toEqual({ model: 'kokoro', voice: 'ja', input: 'こんにちは', speed: 1.25, response_format: 'mp3' });
  });

  test('accepts a request credential but does not expose it in an upstream error', async () => {
    const secret = 'test-secret-do-not-print';
    const provider = createLocalTTSProvider({ fetcher: async (_input, init) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${secret}`);
      return new Response(`failure ${secret}`, { status: 500 });
    } });
    const app = createTTSApp({ prefix: '/engine', corsOrigins: false, enableLogger: false, extraProviders: [provider] });
    const response = await app.request('/engine/tts/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'local', endpoint: 'http://localhost:8880/v1', apiKey: secret, text: 'hi', voiceName: 'v', model: 'm' }),
    });
    expect(response.status).toBe(502);
    const body = await response.json() as { error: string; code: string; retryable: boolean };
    expect(body.code).toBe('E_LOCAL_UPSTREAM');
    expect(body.retryable).toBe(true);
    expect(JSON.stringify(body)).not.toContain(secret);
  });

  test('discovers models and voices via optional local endpoints', async () => {
    const provider = createLocalTTSProvider({ endpoint: 'http://127.0.0.1:8880/v1', fetcher: async input => {
      const path = new URL(String(input)).pathname;
      return Response.json(path.endsWith('/models') ? { data: [{ id: 'kokoro' }] } : { voices: [{ id: 'ja-female' }] });
    } });
    const app = createTTSApp({ prefix: '/engine', corsOrigins: false, enableLogger: false, extraProviders: [provider] });
    const models = await app.request('/engine/models?provider=local');
    expect(models.status).toBe(200);
    expect((await models.json() as { models: Array<{ id: string }> }).models[0]?.id).toBe('kokoro');
    const voices = await app.request('/engine/voices?provider=local');
    expect(voices.status).toBe(200);
    expect((await voices.json() as { voices: Array<{ id: string }> }).voices[0]?.id).toBe('ja-female');
  });
});

test('Azure SSML keeps supported style in the correct namespace', () => {
  const ssml = buildAzureSSML('Hello & goodbye', 'en-US-JennyNeural', { style: 'cheerful', speed: 1.2 });
  expect(ssml).toContain('xmlns:mstts=');
  expect(ssml).toContain('<mstts:express-as style="cheerful">');
  expect(ssml).toContain('Hello &amp; goodbye');
});

test('Azure voice catalog carries locale and actual StyleList into style-checked synthesis', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if (String(input).endsWith('/voices/list')) {
      return Response.json([{ ShortName: 'en-US-JennyNeural', DisplayName: 'Jenny', Gender: 'Female', Locale: 'en-US', StyleList: ['cheerful'] }]);
    }
    return new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'audio/wav' } });
  }) as typeof fetch;
  try {
    const voices = await listAzureVoices('test-key', 'eastus');
    expect(voices[0]?.locale).toBe('en-US');
    expect(voices[0]?.styles).toEqual(['cheerful']);
    await synthesizeAzure({ text: 'hello', voiceName: 'en-US-JennyNeural', style: 'cheerful' }, 'test-key', 'eastus');
    expect(String(calls.at(-1)?.init?.body)).toContain('<mstts:express-as style="cheerful">');
    await expect(synthesizeAzure({ text: 'hello', voiceName: 'en-US-JennyNeural', style: 'angry' }, 'test-key', 'eastus')).rejects.toMatchObject({ code: 'E_AZURE_STYLE', status: 400 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

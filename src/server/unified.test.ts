import { describe, test, expect, afterAll } from 'bun:test';
import { createTTSApp, registerProvider } from './app';
import { localProvider } from './providers/local';
import { synthesizeUnified, UnifiedSynthesisError } from './unified';
import type { TTSProvider } from './providers/types';

const ttsModel = (id: string, provider: string) => ({
  id, name: id, displayName: id, description: 'd',
  isTtsRecommended: true as const, category: 'tts' as const, provider,
});

const cloudOk: TTSProvider = {
  id: 'fakecloud',
  displayName: 'Fake Cloud',
  requiresApiKey: false,
  listModels: async () => ({ models: [ttsModel('fc-tts-1', 'fakecloud')], source: 'remote' as const }),
  listVoices: async () => ([
    { id: 'fc-female', name: 'FC Female', description: 'd', gender: 'female' as const, provider: 'fakecloud' },
    { id: 'fc-male', name: 'FC Male', description: 'd', gender: 'male' as const, provider: 'fakecloud' },
  ]),
  synthesize: async () => ({ audioBuffer: Buffer.from([9, 9, 9]), mimeType: 'audio/wav' }),
};

const cloudDown: TTSProvider = {
  ...cloudOk,
  id: 'fakedown',
  displayName: 'Fake Down',
  synthesize: async () => { throw new Error('cloud exploded'); },
};

const localStub: TTSProvider = {
  id: 'local',
  displayName: 'Fake Local',
  requiresApiKey: false,
  listModels: async () => ({ models: [ttsModel('local-1', 'local')], source: 'remote' as const }),
  listVoices: async () => ([
    { id: 'local-voice', name: 'Local Voice', description: 'd', provider: 'local' },
  ]),
  synthesize: async () => ({ audioBuffer: Buffer.from([7, 7]), mimeType: 'audio/mpeg' }),
};

const localDown: TTSProvider = {
  ...localStub,
  synthesize: async () => { throw new Error('local box offline'); },
};

const deps = (providers: TTSProvider[]) => ({ deps: { providers } });

describe('synthesizeUnified', () => {
  test('首选成功：自动解析模型与音色，不兜底', async () => {
    const r = await synthesizeUnified(
      { text: 'hello', preferredService: 'fakecloud' },
      deps([cloudOk, localStub])
    );
    expect(r.ok).toBe(true);
    expect(r.usedFallback).toBe(false);
    expect(r.provider).toBe('fakecloud');
    expect(r.model).toBe('fc-tts-1');
    expect(r.voice).toBe('fc-female');
    expect(Buffer.from(r.audioBase64, 'base64')).toEqual(Buffer.from([9, 9, 9]));
  });

  test('性别偏好命中男性音色', async () => {
    const r = await synthesizeUnified(
      { text: 'hi', preferredService: 'fakecloud', voicePreference: { gender: 'male' } },
      deps([cloudOk, localStub])
    );
    expect(r.voice).toBe('fc-male');
    expect(r.warnings ?? []).toEqual([]);
  });

  test('性别无匹配：警告并选用现有音色', async () => {
    const maleOnly: TTSProvider = {
      ...cloudOk,
      listVoices: async () => ([
        { id: 'm1', name: 'M1', description: 'd', gender: 'male' as const, provider: 'fakecloud' },
      ]),
    };
    const r = await synthesizeUnified(
      { text: 'hi', preferredService: 'fakecloud', voicePreference: { gender: 'female' } },
      deps([maleOnly, localStub])
    );
    expect(r.voice).toBe('m1');
    expect(r.warnings?.length).toBeGreaterThan(0);
  });

  test('直接指定 voiceId：跳过音色发现', async () => {
    const noList: TTSProvider = {
      ...cloudOk,
      listVoices: async () => { throw new Error('must not list'); },
    };
    const r = await synthesizeUnified(
      { text: 'hi', preferredService: 'fakecloud', voicePreference: { voiceId: 'exact-9' } },
      deps([noList, localStub])
    );
    expect(r.voice).toBe('exact-9');
  });

  test('首选失败只兜底本地：usedFallback + 首选安全错误', async () => {
    const r = await synthesizeUnified(
      { text: 'hi', preferredService: 'fakedown' },
      deps([cloudDown, localStub])
    );
    expect(r.usedFallback).toBe(true);
    expect(r.provider).toBe('local');
    expect(r.preferredError).toMatchObject({ provider: 'fakedown' });
    expect(r.preferredError?.message).toContain('cloud exploded');
    expect(Buffer.from(r.audioBase64, 'base64')).toEqual(Buffer.from([7, 7]));
  });

  test('本地也失败：结构化双错误，无静默', async () => {
    try {
      await synthesizeUnified(
        { text: 'hi', preferredService: 'fakedown' },
        deps([cloudDown, localDown])
      );
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnifiedSynthesisError);
      expect(e.failure.ok).toBe(false);
      expect(e.failure.preferredError.message).toContain('cloud exploded');
      expect(e.failure.fallbackError.message).toContain('local box offline');
      expect(e.status).toBe(500);
    }
  });

  test('空文本：400 且不触及任何厂商', async () => {
    let listed = false;
    const spy: TTSProvider = {
      ...cloudOk,
      listModels: async () => { listed = true; throw new Error('must not list'); },
    };
    try {
      await synthesizeUnified({ text: '  ' }, deps([spy, localStub]));
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.status).toBe(400);
      expect(listed).toBe(false);
    }
  });

  test('预取消信号：直接拒绝', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    try {
      await synthesizeUnified(
        { text: 'hi', preferredService: 'fakecloud' },
        { ...deps([cloudOk, localStub]), signal: ctrl.signal }
      );
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(String(e.message)).toContain('取消');
    }
  });
});

describe('POST /tts/unified 路由', () => {
  test('首选失败走本地兜底并返回 usedFallback', async () => {
    const app = createTTSApp({ prefix: '/api', enableLogger: false, extraProviders: [cloudDown, localStub] });
    try {
      const res = await app.request('/api/tts/unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'hi', preferredService: 'fakedown' }),
      });
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.ok).toBe(true);
      expect(body.usedFallback).toBe(true);
      expect(body.provider).toBe('local');
      expect(body.preferredError.provider).toBe('fakedown');
    } finally {
      registerProvider(localProvider);
    }
  });

  test('未知厂商返回 400 结构化错误', async () => {
    const app = createTTSApp({ prefix: '/api', enableLogger: false });
    const res = await app.request('/api/tts/unified', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hi', preferredService: 'nope' }),
    });
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.ok).toBe(false);
    expect(body.fallbackError).toBeNull();
  });

  afterAll(() => {
    registerProvider(localProvider);
  });
});

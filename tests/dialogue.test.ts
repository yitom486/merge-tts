import { describe, expect, it } from 'bun:test';
import { parseDialogueParts, isDialogueRequest } from '../src/server/providers/gemini';
import type { TTSGenerateRequest } from '../src/server/types';

describe('multi-speaker dialogue parsing & detection', () => {
  it('parses standard Speaker 1 and Speaker 2 lines', () => {
    const text = 'Speaker 1: Hello world!\nSpeaker 2: How are you doing?\nSpeaker 1: Fantastic!';
    const parts = parseDialogueParts(text);
    expect(parts).toHaveLength(3);
    expect(parts[0]).toEqual({ speaker: 'Speaker 1', text: 'Hello world!' });
    expect(parts[1]).toEqual({ speaker: 'Speaker 2', text: 'How are you doing?' });
    expect(parts[2]).toEqual({ speaker: 'Speaker 1', text: 'Fantastic!' });
  });

  it('parses arbitrary character names with half-width and full-width colons', () => {
    const text = '田中: こんにちは\n李：初めまして、よろしくお願いします。\n田中: こちらこそ！';
    const parts = parseDialogueParts(text);
    expect(parts).toHaveLength(3);
    expect(parts[0]).toEqual({ speaker: '田中', text: 'こんにちは' });
    expect(parts[1]).toEqual({ speaker: '李', text: '初めまして、よろしくお願いします。' });
    expect(parts[2]).toEqual({ speaker: '田中', text: 'こちらこそ！' });
  });

  it('parses bracketed speaker tags', () => {
    const text = '[Alice] Nice weather today.\n[Bob] Yes, it is warm.\n【老师】请大家翻到第一课。\n【小明】收到了！';
    const parts = parseDialogueParts(text);
    expect(parts).toHaveLength(4);
    expect(parts[0]).toEqual({ speaker: 'Alice', text: 'Nice weather today.' });
    expect(parts[1]).toEqual({ speaker: 'Bob', text: 'Yes, it is warm.' });
    expect(parts[2]).toEqual({ speaker: '老师', text: '请大家翻到第一课。' });
    expect(parts[3]).toEqual({ speaker: '小明', text: '收到了！' });
  });

  it('merges multiline speech without speaker prefix into the preceding speaker', () => {
    const text = 'Speaker 1: First line\nSecond line continuing\nSpeaker 2: Answer';
    const parts = parseDialogueParts(text);
    expect(parts).toHaveLength(2);
    expect(parts[0].speaker).toBe('Speaker 1');
    expect(parts[0].text).toBe('First line\nSecond line continuing');
    expect(parts[1].speaker).toBe('Speaker 2');
    expect(parts[1].text).toBe('Answer');
  });

  it('dynamically maps discovered dialogue speakers to declared speakers in order', () => {
    const text = '田中: 今日はいい天気ですね。\n李: そうですね、散歩に行きましょう。';
    const declaredSpeakers = [
      { speaker: 'Speaker 1', voiceName: 'Puck' },
      { speaker: 'Speaker 2', voiceName: 'Charon' },
    ];
    const parts = parseDialogueParts(text, declaredSpeakers);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ speaker: 'Speaker 1', text: '今日はいい天気ですね。' });
    expect(parts[1]).toEqual({ speaker: 'Speaker 2', text: 'そうですね、散歩に行きましょう。' });
  });

  it('correctly determines isDialogueRequest for multi-speaker dialogues', () => {
    const reqMulti: TTSGenerateRequest = {
      text: '田中: こんにちは\n李: 初めまして',
      speakers: [
        { speaker: 'Speaker 1', voiceName: 'Puck' },
        { speaker: 'Speaker 2', voiceName: 'Charon' },
      ],
    };
    expect(isDialogueRequest(reqMulti)).toBe(true);

    const reqSingle: TTSGenerateRequest = {
      text: '田中: こんにちは\n李: 初めまして',
      voiceName: 'Puck',
      speakers: [{ speaker: 'Speaker 1', voiceName: 'Puck' }], // only 1 speaker
    };
    expect(isDialogueRequest(reqSingle)).toBe(false);

    const reqMonologue: TTSGenerateRequest = {
      text: '田中: こんにちは、田中です。一人で話しています。',
      speakers: [
        { speaker: 'Speaker 1', voiceName: 'Puck' },
        { speaker: 'Speaker 2', voiceName: 'Charon' },
      ],
    };
    expect(isDialogueRequest(reqMonologue)).toBe(false);
  });
});

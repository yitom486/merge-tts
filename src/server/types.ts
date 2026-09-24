export interface TTSGenerateRequest {
  text: string;
  voiceName?: string;
  model?: string;
  speechMetadata?: string;
  languageCode?: string;
}

export type ModelCategory = 'tts' | 'live' | 'other';

export interface ModelInfo {
  id: string;
  name: string;
  displayName: string;
  description: string;
  isTtsRecommended: boolean;
  category: ModelCategory;
}

export interface VoiceInfo {
  id: string;
  name: string;
  description: string;
  gender?: 'female' | 'male' | 'neutral';
  tone?: string;
}

export interface TTSGenerateRequest {
  text: string;
  voiceName?: string;
  model?: string;
  speechMetadata?: string;
  languageCode?: string;
}

export type ModelCategory = 'tts' | 'live' | 'other';
export type ModelTier = 'flagship' | 'pro' | 'lite' | 'preview' | 'standard';

export interface ModelInfo {
  id: string;
  name: string;
  displayName: string;
  description: string;
  isTtsRecommended: boolean;
  category: ModelCategory;
  version?: number;
  tier?: ModelTier;
}

export interface VoiceInfo {
  id: string;
  name: string;
  description: string;
  gender?: 'female' | 'male' | 'neutral';
  tone?: string;
}

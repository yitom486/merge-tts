import type { TTSProvider } from './types';
export interface LocalTTSOptions {
    /** Trusted server-side endpoint. A request body may override it with a loopback URL. */
    endpoint?: string;
    apiKey?: string;
    model?: string;
    voices?: string[];
    timeoutMs?: number;
    fetcher?: typeof fetch;
}
export declare class LocalTTSError extends Error {
    readonly code: string;
    readonly status: number;
    readonly retryable: boolean;
    constructor(code: string, message: string, status?: number, retryable?: boolean);
}
/** Request-controlled URLs must stay on this machine. Hostname aliases and URL credentials are rejected. */
export declare function resolveLocalSpeechURL(raw: string, fromRequest?: boolean): URL;
export declare function createLocalTTSProvider(options?: LocalTTSOptions): TTSProvider;
export declare const localProvider: TTSProvider;

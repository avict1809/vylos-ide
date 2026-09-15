import { FunctionsHttpError } from '@supabase/supabase-js';
import { getSupabase } from '../supabase';
import { deviceHeaders } from '../device';
import { TEXT_ASSISTANT_RULES } from './guidelines';

// Failures come back as one of these strings rather than a throw, so every
// caller can show them as-is; use isAiError() before caching a result.
const AI_ERRORS = {
    notConfigured: 'Vylos AI is not configured for this build.',
    signedOut: 'Sign in to use Vylos AI.',
    dailyLimit: "You've reached today's Vylos AI limit. It resets at midnight UTC.",
    device: "Vylos AI can't be used with this account on this computer. Sign out and back in, or use an account registered here.",
    failed: 'Error generating content. Please try again.',
} as const;

export function isAiError(text: string): boolean {
    return (Object.values(AI_ERRORS) as string[]).includes(text);
}

/** Maps a failed Edge Function call to one of the AI_ERRORS messages. */
export function aiErrorMessage(error: unknown): string {
    if (error instanceof FunctionsHttpError) {
        const status = (error.context as Response).status;
        if (status === 401) return AI_ERRORS.signedOut;
        if (status === 429) return AI_ERRORS.dailyLimit;
        if (status === 403) return AI_ERRORS.device;
    }
    return AI_ERRORS.failed;
}

/**
 * Gemini is reached through the `ai-generate` Supabase Edge Function, which
 * holds the API key — the app never ships it (supabase/functions/ai-generate).
 *
 * `feature` names the caller (e.g. 'hover', 'hints', or later an extension id)
 * so usage can be attributed.
 */
/** One part of a Gemini conversation turn: text, a function call, or its result. */
export interface GeminiPart {
    text?: string;
    thought?: boolean;
    functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
    functionResponse?: { name: string; response: object; id?: string };
    // Gemini 3 attaches thoughtSignature to parts; they must go back unchanged
    [key: string]: unknown;
}

export interface GeminiContent {
    role: 'user' | 'model';
    parts: GeminiPart[];
}

/** A function the model may call, in the Gemini API's schema format. */
export interface GeminiFunctionDeclaration {
    name: string;
    description: string;
    parameters?: object;
}

/**
 * One step of a conversation: sends the history (and the tools the model may
 * call) and returns the model's next turn, which may contain function calls
 * for the caller to run. `error` is one of the AI_ERRORS messages.
 */
export async function generateTurn(
    contents: GeminiContent[],
    opts: { system: string; tools?: GeminiFunctionDeclaration[]; feature: string }
): Promise<{ content: GeminiContent; text: string } | { error: string }> {
    const supabase = getSupabase();
    if (!supabase) return { error: AI_ERRORS.notConfigured };

    const { data, error } = await supabase.functions.invoke<{ text: string; content?: GeminiContent }>('ai-generate', {
        body: { contents, system: opts.system, tools: opts.tools, feature: opts.feature },
        headers: await deviceHeaders(),
    });
    if (error || !data?.content) {
        console.error(`Gemini conversation error (${opts.feature}):`, error);
        // A 400 here means the server's ai-generate predates conversations (it asks for a "prompt")
        if (error instanceof FunctionsHttpError && (error.context as Response).status === 400) {
            return { error: 'Chatting with the tutor needs an update to the Vylos AI server. Try again later, or use the voice tutor for now.' };
        }
        return { error: aiErrorMessage(error) };
    }
    return { content: data.content, text: data.text ?? '' };
}

export async function generateContent(prompt: string, feature: string): Promise<string> {
    const supabase = getSupabase();
    if (!supabase) return AI_ERRORS.notConfigured;

    const { data, error } = await supabase.functions.invoke<{ text: string }>('ai-generate', {
        body: { prompt, system: TEXT_ASSISTANT_RULES, feature },
        headers: await deviceHeaders(),
    });
    if (error || !data?.text) {
        console.error(`Gemini Generation Error (${feature}):`, error);
        return aiErrorMessage(error);
    }
    return data.text;
}

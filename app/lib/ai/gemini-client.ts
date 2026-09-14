import { FunctionsHttpError } from '@supabase/supabase-js';
import { getSupabase } from '../supabase';
import { TEXT_ASSISTANT_RULES } from './guidelines';

// Failures come back as one of these strings rather than a throw, so every
// caller can show them as-is; use isAiError() before caching a result.
const AI_ERRORS = {
    notConfigured: 'Vylos AI is not configured for this build.',
    signedOut: 'Sign in to use Vylos AI.',
    dailyLimit: "You've reached today's Vylos AI limit. It resets at midnight UTC.",
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
export async function generateContent(prompt: string, feature: string): Promise<string> {
    const supabase = getSupabase();
    if (!supabase) return AI_ERRORS.notConfigured;

    const { data, error } = await supabase.functions.invoke<{ text: string }>('ai-generate', {
        body: { prompt, system: TEXT_ASSISTANT_RULES, feature },
    });
    if (error || !data?.text) {
        console.error(`Gemini Generation Error (${feature}):`, error);
        return aiErrorMessage(error);
    }
    return data.text;
}

import { GoogleGenerativeAI } from '@google/generative-ai';
import { TEXT_ASSISTANT_RULES } from './guidelines';

const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

export const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: TEXT_ASSISTANT_RULES,
});

export async function generateContent(prompt: string) {
    if (!apiKey) {
        console.warn("Gemini API Key not set");
        return "Please set your Gemini API Key.";
    }
    try {
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        console.error("Gemini Generation Error:", error);
        return "Error generating content.";
    }
}

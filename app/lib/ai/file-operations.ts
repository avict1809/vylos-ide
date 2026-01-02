import { generateContent } from './gemini-client';

export type FileOperation =
    | { type: 'create', path: string, content: string }
    | { type: 'modify', path: string, content: string }
    | { type: 'delete', path: string };

export async function parseFileOperations(userPrompt: string): Promise<FileOperation[]> {
    const prompt = `
      You are an AI coding assistant. The user asks: "${userPrompt}".
      If the user wants to create or modify files, output a JSON array of operations.
      Example: [{"type": "create", "path": "app/new.ts", "content": "..."}]
      Only output the JSON.
    `;

    const response = await generateContent(prompt);
    try {
        const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("Failed to parse file operations", e);
        return [];
    }
}

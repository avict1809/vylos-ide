import { generateContent } from './gemini-client';
import { Roadmap } from '../stores/roadmap-store';

export async function generateRoadmap(goal: string): Promise<Roadmap | null> {
    const prompt = `
    Create a learning roadmap for: "${goal}".
    Return a JSON object with:
    {
      "id": "uuid",
      "goal": "${goal}",
      "milestones": [
        {
          "id": "1",
          "title": "Topic Title",
          "description": "Short description",
          "completed": false,
          "tasks": ["Task 1", "Task 2"]
        }
      ]
    }
    Only output JSON.
  `;

    const response = await generateContent(prompt, 'roadmap');
    try {
        const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("Failed to parse roadmap", e);
        return null;
    }
}

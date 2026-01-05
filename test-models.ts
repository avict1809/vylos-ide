import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

async function testV1() {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-native-audio-preview-12-2025" }, { apiVersion: 'v1' });
        const result = await model.generateContent("hi");
        console.log("Status: OK (v1)");
        console.log(result.response.text());
    } catch (e: any) {
        console.log("Status: Error (v1)", e.message);
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
        const result = await model.generateContent("hi");
        console.log("Status: OK (2.0)");
    } catch (e: any) {
        console.log("Status: Error (2.0)", e.message);
    }
}

testV1();

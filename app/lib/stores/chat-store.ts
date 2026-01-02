import { create } from 'zustand';

export interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

interface ChatState {
    messages: Message[];
    addMessage: (role: 'user' | 'assistant', content: string) => void;
    clearChat: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
    messages: [],
    addMessage: (role, content) =>
        set((state) => ({
            messages: [...state.messages, { role, content, timestamp: Date.now() }],
        })),
    clearChat: () => set({ messages: [] }),
}));

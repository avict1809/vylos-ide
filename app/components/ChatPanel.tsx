'use client';

import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { useChatStore } from '@/app/lib/stores/chat-store';
import { generateContent } from '@/app/lib/ai/gemini-client';
import { cn } from '@/app/lib/utils'; // Assuming utils exists

export default function ChatPanel() {
    const { messages, addMessage } = useChatStore();
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg = input;
        setInput('');
        addMessage('user', userMsg);
        setIsLoading(true);

        try {
            const aiResponse = await generateContent(userMsg, 'chat');
            addMessage('assistant', aiResponse);
        } catch (error) {
            addMessage('assistant', "Sorry, I encountered an error.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[var(--vylos-grey-dark)] border-l border-[var(--vylos-grey-border)]">
            <div className="p-3 border-b border-[var(--vylos-grey-border)] font-bold text-[var(--vylos-text-primary)]">
                Vylos Chat
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, idx) => (
                    <div key={idx} className={cn(
                        "flex flex-col max-w-[85%] rounded p-3 text-sm",
                        msg.role === 'user'
                            ? "self-end bg-[var(--vylos-green-dark)] text-white ml-auto"
                            : "self-start bg-[var(--vylos-grey-light)] text-[var(--vylos-text-primary)]"
                    )}>
                        <span>{msg.content}</span>
                    </div>
                ))}
                {isLoading && (
                    <div className="self-start text-xs text-[var(--vylos-text-secondary)] italic">
                        AI is thinking...
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-3 border-t border-[var(--vylos-grey-border)] flex gap-2">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Ask guidance..."
                    className="flex-1 bg-[var(--vylos-black)] border border-[var(--vylos-grey-border)] rounded px-3 py-2 text-sm text-white focus:border-[var(--vylos-green)] outline-none"
                />
                <button
                    onClick={handleSend}
                    disabled={isLoading}
                    className="p-2 bg-[var(--vylos-green)] text-black rounded hover:bg-[var(--vylos-green-accent)] disabled:opacity-50"
                >
                    <Send size={16} />
                </button>
            </div>
        </div>
    );
}

import { Send, Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useChatStore } from "../lib/stores/chat-store";
import { generateContent } from "../lib/ai/gemini-client";

export default function AIChatView() {
    const { messages, addMessage } = useChatStore();
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = input.trim();
        setInput("");
        addMessage('user', userMessage);
        setIsLoading(true);

        try {
            const response = await generateContent(userMessage);
            addMessage('assistant', response);
        } catch (error) {
            console.error("AI Error:", error);
            addMessage('assistant', "Sorry, I encountered an error processing your request.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[var(--vylos-black)] text-[var(--vylos-text-primary)]">
            <div className="p-3 border-b border-[var(--vylos-grey-border)]">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--vylos-text-secondary)]">Vylos AI</h2>
            </div>

            <div ref={scrollRef} className="flex-1 p-3 overflow-y-auto space-y-4 scrollbar-hide">
                {messages.length === 0 ? (
                    <div className="text-sm text-[var(--vylos-text-secondary)] text-center mt-10">
                        How can I help you today?
                    </div>
                ) : (
                    messages.map((msg, i) => (
                        <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`
                                max-w-[90%] p-3 rounded-lg text-sm
                                ${msg.role === 'user'
                                    ? 'bg-[var(--vylos-green)] text-black font-medium'
                                    : 'bg-[var(--vylos-grey-medium)] text-[var(--vylos-text-primary)] border border-[var(--vylos-grey-border)]'}
                            `}>
                                {msg.content}
                            </div>
                        </div>
                    ))
                )}
                {isLoading && (
                    <div className="flex items-center gap-2 text-xs text-[var(--vylos-green)] animate-pulse">
                        <Loader2 size={12} className="animate-spin" />
                        Vylos is thinking...
                    </div>
                )}
            </div>

            <div className="p-3 border-t border-[var(--vylos-grey-border)]">
                <form
                    onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                    className="flex items-center gap-2 bg-[var(--vylos-black)] p-2 rounded-md border border-[var(--vylos-grey-border)] focus-within:border-[var(--vylos-green)] transition-all shadow-inner"
                >
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask Vylos anything..."
                        className="bg-transparent border-none outline-none text-sm w-full placeholder-[var(--vylos-text-secondary)]"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="text-[var(--vylos-text-secondary)] hover:text-[var(--vylos-green)] disabled:opacity-30 transition-colors px-1"
                    >
                        <Send size={16} />
                    </button>
                </form>
            </div>
        </div>
    );
}

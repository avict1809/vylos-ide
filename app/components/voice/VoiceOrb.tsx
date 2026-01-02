'use client';

import { useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { cn } from '@/app/lib/utils';
// import { startVoiceSession, stopVoiceSession } from '@/app/lib/ai/gemini-live'; // Will implement later

export default function VoiceOrb() {
    const [isActive, setIsActive] = useState(false);
    const [isListening, setIsListening] = useState(false);

    const toggleVoice = async () => {
        if (isActive) {
            // stopVoiceSession();
            setIsActive(false);
            setIsListening(false);
        } else {
            setIsActive(true);
            setIsListening(true);
            // await startVoiceSession();
            // Mock listening state
        }
    };

    return (
        <div className="fixed bottom-8 right-8 z-50 flex flex-col items-center">
            {/* Orb Container */}
            <div
                className={cn(
                    "relative w-16 h-16 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300",
                    isActive ? "bg-[var(--vylos-green-dark)] shadow-[0_0_20px_var(--vylos-green)]" : "bg-[var(--vylos-grey-light)] hover:bg-[var(--vylos-grey-medium)]"
                )}
                onClick={toggleVoice}
            >
                {/* Pulsing Rings when Active */}
                {isActive && (
                    <>
                        <div className="absolute w-full h-full rounded-full border-2 border-[var(--vylos-green)] animate-ping opacity-50"></div>
                        <div className="absolute w-[120%] h-[120%] rounded-full border border-[var(--vylos-green)] animate-pulse opacity-30"></div>
                    </>
                )}

                {isActive ? <Mic className="text-white z-10" /> : <MicOff className="text-[var(--vylos-text-secondary)] z-10" />}
            </div>
            <span className="mt-2 text-xs font-bold text-[var(--vylos-text-secondary)] bg-[var(--vylos-black)] px-2 py-1 rounded border border-[var(--vylos-grey-border)]">
                {isActive ? (isListening ? "Listening..." : "Thinking...") : "Start Voice Tutor"}
            </span>
        </div>
    );
}

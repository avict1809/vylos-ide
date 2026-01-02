'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '@/app/lib/utils';
import { Sparkles, Save, Search, Code, Copy, Scissors, Clipboard } from 'lucide-react';

interface ContextMenuProps {
    x: number;
    y: number;
    onClose: () => void;
    actions: {
        label: string;
        icon?: any;
        onClick: () => void;
        shortcut?: string;
        danger?: boolean;
    }[];
}

export default function ContextMenu({ x, y, onClose, actions }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    // Ensure menu stays within viewport
    const adjustedX = Math.min(x, typeof window !== 'undefined' ? window.innerWidth - 200 : x);
    const adjustedY = Math.min(y, typeof window !== 'undefined' ? window.innerHeight - 300 : y);

    return (
        <div
            ref={menuRef}
            className="fixed z-[9999] w-52 bg-[var(--vylos-grey-dark)] border border-[var(--vylos-grey-border)] rounded shadow-2xl overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-100"
            style={{
                left: adjustedX,
                top: adjustedY
            }}
        >
            {actions.map((action, index) => (
                <button
                    key={index}
                    className={cn(
                        "w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-300 hover:bg-[var(--vylos-green-dark)]/20 hover:text-[var(--vylos-green)] transition-colors",
                        action.danger && "hover:bg-red-500/10 hover:text-red-500"
                    )}
                    onClick={() => {
                        action.onClick();
                        onClose();
                    }}
                >
                    <div className="flex items-center gap-2">
                        {action.icon && <action.icon size={14} />}
                        <span>{action.label}</span>
                    </div>
                    {action.shortcut && (
                        <span className="text-[10px] opacity-40 font-mono italic">{action.shortcut}</span>
                    )}
                </button>
            ))}
        </div>
    );
}

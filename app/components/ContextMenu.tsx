'use client';

import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { cn } from '@/app/lib/utils';

export type ContextMenuAction = {
    label: string;
    icon?: any;
    onClick: () => void;
    shortcut?: string;
    danger?: boolean;
    disabled?: boolean;
};

export type ContextMenuItem = ContextMenuAction | { separator: true };

interface ContextMenuProps {
    x: number;
    y: number;
    onClose: () => void;
    actions: ContextMenuItem[];
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
        window.addEventListener('blur', onClose);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('blur', onClose);
        };
    }, [onClose]);

    // Keep the menu inside the window, measured after it renders (before paint)
    useLayoutEffect(() => {
        const menu = menuRef.current;
        if (!menu) return;
        const rect = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - rect.width - 4))}px`;
        menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - rect.height - 4))}px`;
    }, [x, y, actions.length]);

    return (
        <div
            ref={menuRef}
            className="fixed z-[9999] min-w-52 bg-[var(--vylos-grey-dark)] border border-[var(--vylos-grey-border)] rounded shadow-2xl overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-100"
            style={{ left: x, top: y }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {actions.map((action, index) =>
                'separator' in action ? (
                    <div key={index} className="h-px bg-[var(--vylos-grey-border)] my-1 mx-2" />
                ) : (
                    <button
                        key={index}
                        disabled={action.disabled}
                        className={cn(
                            "w-full flex items-center justify-between gap-6 px-3 py-1.5 text-xs text-gray-300 hover:bg-[var(--vylos-green-dark)]/20 hover:text-[var(--vylos-green)] transition-colors",
                            action.danger && "hover:bg-red-500/10 hover:text-red-500",
                            action.disabled && "opacity-40 pointer-events-none"
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
                )
            )}
        </div>
    );
}

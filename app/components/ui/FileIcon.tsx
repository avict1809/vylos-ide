'use client';

import { File } from 'lucide-react';
import { fileIconUrl } from '@/app/lib/file-icons';
import { cn } from '@/app/lib/utils';

/**
 * A file's Material icon, as the explorer draws it, falling back to a plain
 * file glyph for extensions the theme has no icon for.
 */
export default function FileIcon({ name, size = 14, className }: { name: string; size?: number; className?: string }) {
    const url = fileIconUrl(name);
    return url ? (
        <img
            src={url}
            alt=""
            width={size}
            height={size}
            draggable={false}
            style={{ width: size, height: size }}
            className={cn('shrink-0', className)}
        />
    ) : (
        <File size={size - 1} className={cn('shrink-0 text-[var(--vylos-text-secondary)]', className)} />
    );
}

'use client';

export default function Terminal() {
    return (
        <div className="h-full w-full bg-[#09090b] p-2 overflow-hidden">
            <div className="h-full w-full flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="text-zinc-500 text-sm">
                        <svg 
                            className="w-16 h-16 mx-auto mb-4 text-zinc-700" 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                        >
                            <path 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                strokeWidth={1.5} 
                                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" 
                            />
                        </svg>
                        <p className="text-base font-medium text-zinc-400 mb-2">
                            Terminal Unavailable
                        </p>
                        <p className="text-xs text-zinc-600">
                            Terminal functionality has been disabled in this version.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

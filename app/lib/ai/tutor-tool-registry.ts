import type { Disposable } from '../disposable';

/**
 * The voice tutor's abilities. Built-in tools (tutor-tools.ts) register here,
 * and extensions will too. A Live session gets the tools that exist when it
 * starts; tools registered later join the next session.
 */

/** Arguments exactly as the model sent them: untyped JSON. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolArgs = Record<string, any>;

/** A Gemini Live function declaration. */
export interface TutorToolDeclaration {
    name: string;
    description: string;
    parameters: {
        type: 'OBJECT';
        properties: Record<string, { type: string; description?: string }>;
        required?: string[];
    };
}

export interface TutorTool {
    declaration: TutorToolDeclaration;
    /** Its result is sent back to the model. Return `{ error }` for failures the tutor should explain. */
    execute: (args: ToolArgs) => Promise<object> | object;
    /** Status shown while the tool runs, e.g. "Writing code…". Return '' to show nothing. */
    describe?: (args: ToolArgs) => string;
}

const tools = new Map<string, TutorTool>();

/** A tool with the same name replaces the existing one (this also keeps hot reload working). */
export function registerTutorTool(tool: TutorTool): Disposable {
    const { name } = tool.declaration;
    if (tools.has(name) && process.env.NODE_ENV !== 'development') {
        console.warn(`Tutor tool "${name}" was registered twice; the later one wins`);
    }
    tools.set(name, tool);
    return {
        dispose: () => {
            if (tools.get(name) === tool) tools.delete(name);
        },
    };
}

export const getTutorToolDeclarations = (): TutorToolDeclaration[] =>
    [...tools.values()].map((tool) => tool.declaration);

export async function executeTutorTool(name: string, args: ToolArgs): Promise<object> {
    const tool = tools.get(name);
    return tool ? tool.execute(args) : { error: `Unknown tool: ${name}` };
}

export function describeTutorTool(name: string, args: ToolArgs): string {
    return tools.get(name)?.describe?.(args) ?? 'Working…';
}

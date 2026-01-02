import { fileSystem } from '../file-system';

export type ToolCall = {
    tool: 'createFile' | 'editFile' | 'readFile';
    args: any;
};

export async function executeTool(call: ToolCall) {
    switch (call.tool) {
        case 'createFile':
        case 'editFile':
            return await fileSystem.writeFile(call.args.path, call.args.content);
        case 'readFile':
            return await fileSystem.readFile(call.args.path);
        default:
            throw new Error(`Unknown tool: ${call.tool}`);
    }
}

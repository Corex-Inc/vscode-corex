import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node';
import { db } from '../database';

export class CommandRegistry {
    getCommandCompletions(): CompletionItem[] {
        return db.commands.map(cmd => ({
            label: cmd.name.toLowerCase(),
            kind: CompletionItemKind.Keyword,
            detail: cmd.shortDescription || 'Corex Command',
            documentation: cmd.description
        }));
    }

    getArgumentCompletions(commandName: string): CompletionItem[] {
        const cmd = db.commands.find(c => c.name.toLowerCase() === commandName.toLowerCase());
        if (!cmd || !cmd.parsedArgs) return[];
        
        return cmd.parsedArgs.map(arg => ({
            label: arg.name,
            kind: arg.isFlag ? CompletionItemKind.Constant : CompletionItemKind.Property,
            detail: arg.isFlag ? 'Command Flag' : 'Command Argument',
            insertText: arg.name
        }));
    }
}

export const commandRegistry = new CommandRegistry();

export function splitCommandArgs(text: string): {text: string, start: number, end: number}[] {
    const args: {text: string, start: number, end: number}[] =[];
    let current = "";
    let inQuotes = false;
    let quoteChar = '';
    
    let tagDepth = 0;
    let parenDepth = 0;
    let bracketDepth = 0;

    let start = text.indexOf('-');
    if (start === -1) return[];
    start++;
    while (text[start] === ' ' || text[start] === '~') start++;
    
    let argStart = start;

    for (let i = start; i < text.length; i++) {
        const char = text[i];
        if (inQuotes) {
            current += char;
            if (char === quoteChar) inQuotes = false;
        } else {
            if (char === '"' || char === "'") {
                inQuotes = true;
                quoteChar = char;
                current += char;
            } else if (char === '<') {
                tagDepth++;
                current += char;
            } else if (char === '>') {
                if (tagDepth > 0) tagDepth--;
                current += char;
            } else if (char === '(') {
                parenDepth++;
                current += char;
            } else if (char === ')') {
                if (parenDepth > 0) parenDepth--;
                current += char;
            } else if (char === '[') {
                bracketDepth++;
                current += char;
            } else if (char === ']') {
                if (bracketDepth > 0) bracketDepth--;
                current += char;
            } else if (char === ' ') {
                if (tagDepth === 0 && parenDepth === 0 && bracketDepth === 0) {
                    if (current.length > 0) {
                        args.push({text: current, start: argStart, end: i});
                        current = "";
                    }
                    argStart = i + 1;
                } else {
                    if (current.length === 0) argStart = i;
                    current += char;
                }
            } else {
                if (current.length === 0) argStart = i;
                current += char;
            }
        }
    }
    if (current.length > 0) args.push({text: current, start: argStart, end: text.length});
    
    return args;
}
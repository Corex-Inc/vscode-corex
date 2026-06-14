import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node';
import { completionRegistry } from '../CompletionRegistry';

completionRegistry.register(
    (ctx) => /<\[([a-zA-Z0-9_]*)$/.test(ctx.linePrefix),
    (ctx) => {
        const completions: CompletionItem[] = [];
        const seenVars = new Set<string>();

        ctx.ast.forEach((node: any) => {
            if (node.container === ctx.currentContainer && node.line < ctx.position.line) {
                node.definitionsProvided.forEach((v: string) => {
                    if (!seenVars.has(v)) {
                        seenVars.add(v);
                        completions.push({
                            label: v,
                            kind: CompletionItemKind.Variable,
                            insertText: v,
                            detail: 'Local variable'
                        });
                    }
                });
            }
        });
        return completions;
    }
);
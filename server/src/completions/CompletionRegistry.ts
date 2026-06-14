import { CompletionItem } from 'vscode-languageserver/node';
import { CompletionContext } from './CompletionContext';

export interface CompletionProvider {
    match: (ctx: CompletionContext) => boolean;
    provide: (ctx: CompletionContext) => CompletionItem[] | Promise<CompletionItem[]>;
}

class Registry {
    private providers: CompletionProvider[] = [];

    public register(match: (ctx: CompletionContext) => boolean, provide: (ctx: CompletionContext) => CompletionItem[]) {
        this.providers.push({ match, provide });
    }

    public async handle(ctx: CompletionContext): Promise<CompletionItem[]> {
        for (const provider of this.providers) {
            if (provider.match(ctx)) {
                return await provider.provide(ctx);
            }
        }
        return [];
    }
}

export const completionRegistry = new Registry();
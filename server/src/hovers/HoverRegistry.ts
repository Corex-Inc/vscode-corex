import { Hover } from 'vscode-languageserver/node';
import { HoverContext } from './HoverContext';

export interface HoverProvider {
    provide: (ctx: HoverContext) => Hover | null;
}

class Registry {
    private providers: HoverProvider[] = [];

    public register(provider: HoverProvider) {
        this.providers.push(provider);
    }

    public handle(ctx: HoverContext): Hover | null {
        for (const provider of this.providers) {
            const result = provider.provide(ctx);
            if (result) return result;
        }
        return null;
    }
}

export const hoverRegistry = new Registry();
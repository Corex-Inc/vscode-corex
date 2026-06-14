import { Definition, Location } from 'vscode-languageserver/node';
import { DefinitionContext } from './DefinitionContext';

export interface DefinitionProvider {
    provide: (ctx: DefinitionContext) => Location | null;
}

class Registry {
    private providers: DefinitionProvider[] = [];

    public register(provider: DefinitionProvider) {
        this.providers.push(provider);
    }

    public handle(ctx: DefinitionContext): Definition | null {
        for (const provider of this.providers) {
            const result = provider.provide(ctx);
            if (result) return result;
        }
        return null;
    }
}

export const definitionRegistry = new Registry();
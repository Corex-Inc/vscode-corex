import { TextEdit } from 'vscode-languageserver/node';
import { RenameContext } from './RenameContext';

export interface RenameProvider {
    match: (ctx: RenameContext) => boolean;
    provide: (ctx: RenameContext) => TextEdit[];
}

class Registry {
    private providers: RenameProvider[] = [];

    public register(provider: RenameProvider) {
        this.providers.push(provider);
    }

    public run(ctx: RenameContext): TextEdit[] {
        for (const provider of this.providers) {
            if (provider.match(ctx)) {
                return provider.provide(ctx);
            }
        }
        return [];
    }
}

export const renameRegistry = new Registry();
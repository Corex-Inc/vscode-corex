import { CodeAction } from 'vscode-languageserver/node';
import { CodeActionContext } from './CodeActionContext';

export interface CodeActionProvider {
    provide: (ctx: CodeActionContext) => CodeAction[] | Promise<CodeAction[]>;
}

class Registry {
    private providers: CodeActionProvider[] = [];

    public register(provider: CodeActionProvider) {
        this.providers.push(provider);
    }

    public async run(ctx: CodeActionContext): Promise<CodeAction[]> {
        const allActions: CodeAction[] = [];
        for (const provider of this.providers) {
            const actions = await provider.provide(ctx);
            allActions.push(...actions);
        }
        return allActions;
    }
}

export const codeActionRegistry = new Registry();
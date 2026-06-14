import { TextEdit } from 'vscode-languageserver/node';
import { renameRegistry } from '../RenameRegistry';
import { renameVariableOccurrences } from '../utils';

renameRegistry.register({
    match: (ctx) => ctx.varNameToRename !== null && ctx.loopNode === null,
    provide: (ctx) => {
        const edits: TextEdit[] = [];
        
        renameVariableOccurrences(ctx, edits);

        return edits;
    }
});
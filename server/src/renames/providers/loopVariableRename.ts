import { TextEdit } from 'vscode-languageserver/node';
import { renameRegistry } from '../RenameRegistry';
import { renameVariableOccurrences } from '../utils';

renameRegistry.register({
    match: (ctx) => ctx.varNameToRename !== null && ctx.loopNode !== null,
    provide: (ctx) => {
        const edits: TextEdit[] = [];
        const newName = ctx.params.newName;
        const loopNode = ctx.loopNode!;

        const currentAsMatch = loopNode.text.match(/\bas:([a-zA-Z0-9_]+)\b/i);
        if (!currentAsMatch) {
            const textBeforeComment = loopNode.text.split('//')[0].split('#')[0];
            const lastColonIdx = textBeforeComment.lastIndexOf(':');
            
            if (lastColonIdx !== -1) {
                edits.push(TextEdit.insert(
                    { line: loopNode.line, character: lastColonIdx },
                    ` as:${newName}`
                ));
            }
        }

        renameVariableOccurrences(ctx, edits);

        return edits;
    }
});
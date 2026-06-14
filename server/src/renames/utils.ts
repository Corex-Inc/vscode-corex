import { TextEdit } from 'vscode-languageserver/node';
import { RenameContext } from './RenameContext';

export function renameVariableOccurrences(ctx: RenameContext, edits: TextEdit[]): void {
    const varNameToRename = ctx.varNameToRename;
    const newName = ctx.params.newName;
    if (!varNameToRename) return;

    for (const n of ctx.scopeNodes) {
        const defRegex = new RegExp(`^(\\s*-\\s*(?:def|define)\\s+)(${varNameToRename})(\\s|$)`, 'i');
        const matchDef = n.text.match(defRegex);
        if (matchDef) {
            const startIdx = matchDef[1].length;
            edits.push(TextEdit.replace({
                start: { line: n.line, character: startIdx },
                end: { line: n.line, character: startIdx + varNameToRename.length }
            }, newName));
        }

        const asSearchStr = `as:${varNameToRename}`;
        let asIdx = n.text.indexOf(asSearchStr);
        while (asIdx !== -1) {
            const charBefore = n.text[asIdx - 1];
            if (!charBefore || /\s/.test(charBefore)) {
                edits.push(TextEdit.replace({
                    start: { line: n.line, character: asIdx + 3 },
                    end: { line: n.line, character: asIdx + 3 + varNameToRename.length }
                }, newName));
            }
            asIdx = n.text.indexOf(asSearchStr, asIdx + 1);
        }

        for (const tag of n.tagsUsed) {
            const tagVarMatch = tag.text.match(/^\[([a-zA-Z0-9_]+)\]/);
            if (tagVarMatch && tagVarMatch[1] === varNameToRename) {
                const startPos = ctx.doc.positionAt(tag.start + 1);
                const endPos = ctx.doc.positionAt(tag.start + 1 + varNameToRename.length);
                edits.push(TextEdit.replace({ start: startPos, end: endPos }, newName));
            }
        }
    }
}
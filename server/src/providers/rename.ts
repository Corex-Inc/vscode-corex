import { RenameParams, WorkspaceEdit, TextEdit, TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseAST } from '../ast';

export function handleRename(params: RenameParams, documents: TextDocuments<TextDocument>): WorkspaceEdit | null {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;

    const ast = parseAST(doc);
    const offset = doc.offsetAt(params.position);
    const node = ast.find(n => n.line === params.position.line);
    if (!node) return null;

    let varNameToRename: string | null = null;

    for (const tag of node.tagsUsed) {
        if (offset >= tag.start && offset <= tag.end) {
            if (tag.text.startsWith('[') && tag.text.includes(']')) {
                varNameToRename = tag.text.substring(1, tag.text.indexOf(']'));
                break;
            }
        }
    }

    if (!varNameToRename) {
        const defMatch = node.text.match(/(?:def|define)\s+([a-zA-Z0-9_]+)/i);
        if (defMatch) {
            const startIdx = node.text.indexOf(defMatch[1]);
            if (params.position.character >= startIdx && params.position.character <= startIdx + defMatch[1].length) {
                varNameToRename = defMatch[1];
            }
        }
        const asMatch = node.text.match(/\bas:([a-zA-Z0-9_]+)\b/i);
        if (asMatch) {
            const startIdx = node.text.indexOf(asMatch[1]);
            if (params.position.character >= startIdx && params.position.character <= startIdx + asMatch[1].length) {
                varNameToRename = asMatch[1];
            }
        }
    }

    if (!varNameToRename) return null;

    let loopNode = ast.slice(0, ast.indexOf(node) + 1).reverse().find(n => {
        if (!['repeat', 'foreach', 'while'].includes(n.name)) return false;
        if (n.endNodeIndex < ast.indexOf(node)) return false;
        
        const currentAsMatch = n.text.match(/\bas:([a-zA-Z0-9_]+)\b/i);
        const currentAsName = currentAsMatch ? currentAsMatch[1] : null;
        
        return varNameToRename === 'loopIndex' || 
               varNameToRename === 'key' || 
               varNameToRename === 'value' || 
               varNameToRename === currentAsName;
    });

    const edits: TextEdit[] = [];
    const newName = params.newName;

    const scopeNodes = loopNode 
        ? ast.slice(ast.indexOf(loopNode), loopNode.endNodeIndex + 1)
        : ast.filter(n => n.container === node.container);

    if (loopNode) {
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
    }

    for (const n of scopeNodes) {
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
                const startPos = doc.positionAt(tag.start + 1);
                const endPos = doc.positionAt(tag.start + 1 + varNameToRename.length);
                edits.push(TextEdit.replace({ start: startPos, end: endPos }, newName));
            }
        }
    }

    return { changes: { [doc.uri]: edits } };
}
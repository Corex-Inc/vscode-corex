import { RenameParams, WorkspaceEdit, TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { RenameContext } from './RenameContext';
import { renameRegistry } from './RenameRegistry';
import { isPositionInComment } from '../utils';

import './providers/loopVariableRename';
import './providers/standardVariableRename';

export function handleRename(
    params: RenameParams, 
    documents: TextDocuments<TextDocument>
): WorkspaceEdit | null {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;

    if (isPositionInComment(doc, params.position)) return null;

    const ctx = new RenameContext(params, doc);
    
    if (!ctx.varNameToRename) return null;

    const edits = renameRegistry.run(ctx);
    
    if (edits.length === 0) return null;

    return { changes: { [doc.uri]: edits } };
}
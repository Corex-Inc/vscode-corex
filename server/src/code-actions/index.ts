import { CodeAction, CodeActionParams, TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { codeActionRegistry } from './CodeActionRegistry';
import { CodeActionContext } from './CodeActionContext';

import './providers/simpleQuickFixes';
import './providers/booleanQuickFixes';
import './providers/refactorExtract';

export async function handleCodeAction(
    params: CodeActionParams, 
    documents: TextDocuments<TextDocument>
): Promise<CodeAction[]> {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];

    const ctx = new CodeActionContext(params, doc);
    
    return await codeActionRegistry.run(ctx);
}
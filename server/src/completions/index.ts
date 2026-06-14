import { CompletionItem, TextDocumentPositionParams, TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { completionRegistry } from './CompletionRegistry';
import { CompletionContext } from './CompletionContext';
import { isPositionInComment } from '../utils';

import './providers/variables';
import './providers/commands';
import './providers/events';
import './providers/tags';

export async function handleCompletion(
    pos: TextDocumentPositionParams, 
    documents: TextDocuments<TextDocument>
): Promise<CompletionItem[]> {
    const doc = documents.get(pos.textDocument.uri);
    if (!doc) return [];
    if (isPositionInComment(doc, pos.position)) return [];

    const ctx = new CompletionContext(pos, doc);
    
    return await completionRegistry.handle(ctx);
}
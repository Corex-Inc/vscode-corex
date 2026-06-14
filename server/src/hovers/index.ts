import { HandlerResult, Hover, TextDocumentPositionParams, TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { HoverContext } from './HoverContext';
import { hoverRegistry } from './HoverRegistry';
import { isPositionInComment } from '../utils';

import './providers/events';
import './providers/variables';
import './providers/commands';
import './providers/tags';

export function handleHover(
    pos: TextDocumentPositionParams, 
    documents: TextDocuments<TextDocument>
): HandlerResult<Hover | null | undefined, void> {
    const doc = documents.get(pos.textDocument.uri);
    if (!doc) return null;

    if (isPositionInComment(doc, pos.position)) return null;

    const ctx = new HoverContext(pos, doc);
    
    return hoverRegistry.handle(ctx);
}
import { Definition, TextDocumentPositionParams, TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DefinitionContext } from './DefinitionContext';
import { definitionRegistry } from './DefinitionRegistry';
import { isPositionInComment } from '../utils';

import './providers/events';
import './providers/commands';
import './providers/variables';
import './providers/tags';

export function handleDefinition(
    pos: TextDocumentPositionParams, 
    documents: TextDocuments<TextDocument>
): Definition | null {
    const doc = documents.get(pos.textDocument.uri);
    if (!doc) return null;

    if (isPositionInComment(doc, pos.position)) return null;

    const ctx = new DefinitionContext(pos, doc);
    
    return definitionRegistry.handle(ctx);
}
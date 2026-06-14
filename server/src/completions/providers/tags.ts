import { CompletionItem, CompletionItemKind, InsertTextFormat } from 'vscode-languageserver/node';
import { completionRegistry } from '../CompletionRegistry';
import { extractTagBeforeCursor, splitTagChain, resolveTagType } from '../../utils';
import { db } from '../../database';
import { eventRegistry } from '../../services/events';

completionRegistry.register(
    (ctx) => extractTagBeforeCursor(ctx.linePrefix) !== null,
    (ctx) => {
        const tagContent = extractTagBeforeCursor(ctx.linePrefix)!;
        const completions: CompletionItem[] = [];
        const parts = splitTagChain(tagContent);
        const lastPart = parts[parts.length - 1];

        if (lastPart && (lastPart.includes('[') || lastPart.includes(']'))) return [];

        if (parts.length === 1) {
            db.baseObjects.forEach(base => {
                const typeName = base.charAt(0).toUpperCase() + base.slice(1) + 'Tag';
                const objDoc = db.objectDocs.get(typeName.toLowerCase());
                completions.push({ 
                    label: base,
                    kind: CompletionItemKind.Class,
                    documentation: objDoc?.description
                });
            });
            db.formatters.forEach(fmt => {
                completions.push({
                    label: fmt.name,
                    kind: CompletionItemKind.Function,
                    detail: `Returns: ${fmt.returnType || 'ElementTag'}`,
                    documentation: fmt.description,
                    insertText: fmt.insertSnippet || fmt.name,
                    insertTextFormat: fmt.insertSnippet ? InsertTextFormat.Snippet : InsertTextFormat.PlainText
                });
            });
        } else {
            if (parts[0].toLowerCase() === 'context' && parts.length === 2 && ctx.parentEventMeta) {
                return eventRegistry.getContextCompletions(ctx.parentEventMeta);
            }
            
            const targetType = resolveTagType(tagContent, ctx.ast, ctx.currentContainer, db, parts.length - 1); 
            const seen = new Set<string>();

            const pushProps = (typeName: string) => {
                const props = db.getProperties(typeName) || [];
                props.forEach(item => {
                    if (item.isHiddenFromAutocomplete || seen.has(item.name)) return;
                    seen.add(item.name);
                    const insertText = item.insertSnippet || item.name;
                    completions.push({
                        label: insertText.replace(/\$\d+/g, ''),
                        filterText: item.name,
                        kind: item.type === 'mechanism' ? CompletionItemKind.Property : CompletionItemKind.Method,
                        detail: `Returns: ${item.returnType || 'Unknown'}`,
                        documentation: item.description,
                        insertText: insertText,
                        insertTextFormat: item.insertSnippet ? InsertTextFormat.Snippet : InsertTextFormat.PlainText
                    });
                });
            };

            completions.push({
                label: 'as',
                kind: CompletionItemKind.Method,
                detail: 'Casts the object to a specific type',
                insertText: 'as[$1]',
                insertTextFormat: InsertTextFormat.Snippet
            });

            if (targetType === 'ObjectTag') {
                db.baseObjects.forEach(base => pushProps(base.charAt(0).toUpperCase() + base.slice(1) + 'Tag'));
            } else {
                pushProps(targetType);
            }
        }
        return completions;
    }
);
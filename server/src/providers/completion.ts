import { CompletionItem, CompletionItemKind, TextDocumentPositionParams, InsertTextFormat, TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { db } from '../database';
import { extractTagBeforeCursor, splitTagChain, resolveTagType } from '../utils';
import { parseAST } from '../ast';
import { eventRegistry } from './events';

export function handleCompletion(pos: TextDocumentPositionParams, documents: TextDocuments<TextDocument>): CompletionItem[] {
    const doc = documents.get(pos.textDocument.uri);
    if (!doc) return [];

    const ast = parseAST(doc);
    const linePrefix = doc.getText({ start: { line: pos.position.line, character: 0 }, end: pos.position });

    let currentContainer = "global";
    for (let i = pos.position.line; i >= 0; i--) {
        const line = doc.getText({ start: { line: i, character: 0 }, end: { line: i + 1, character: 0 } });
        const containerMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(?:#.*|\/\/.*)?$/);
        if (containerMatch) {
            currentContainer = containerMatch[1];
            break;
        }
    }

    const varMatch = linePrefix.match(/<\[([a-zA-Z0-9_]*)$/);
    if (varMatch) {
        const completions: CompletionItem[] = [];
        const seenVars = new Set<string>();

        ast.forEach(node => {
            if (node.container === currentContainer && node.line < pos.position.line) {
                node.definitionsProvided.forEach(v => {
                    if (!seenVars.has(v)) {
                        seenVars.add(v);
                        completions.push({
                            label: v,
                            kind: CompletionItemKind.Variable,
                            insertText: v,
                            detail: 'Local variable'
                        });
                    }
                });
            }
        });
        return completions;
    }

    let inEvents;
    const currentIndentMatch = linePrefix.match(/^(\s*)/);
    const currentIndent = currentIndentMatch ? currentIndentMatch[1].length : 0;
    
    for (let i = pos.position.line; i >= 0; i--) {
        const l = doc.getText({ start: { line: i, character: 0 }, end: { line: i + 1, character: 0 } });
        const cleanL = l.split('//')[0].trim();
        const ind = l.match(/^(\s*)/)?.[1]?.length || 0;
        
        if (ind < currentIndent && cleanL === 'events:') {
            inEvents = true; 
            break;
        }
        if (ind === 0 && cleanL !== '') {
            break; 
        }
    }

    let isEventLine = /^\s*(on|after)\b/i.test(linePrefix);
    let parentIsEvents = false;

    if (!isEventLine) {
        const currentIndentMatch = linePrefix.match(/^(\s*)/);
        const currentIndent = currentIndentMatch ? currentIndentMatch[1].length : 0;
        
        for (let i = pos.position.line - 1; i >= 0; i--) {
            const l = doc.getText({ start: { line: i, character: 0 }, end: { line: i + 1, character: 0 } });
            const cleanL = l.split('//')[0].split('#')[0].trim();
            const ind = l.match(/^(\s*)/)?.[1]?.length || 0;
            
            if (ind < currentIndent) {
                if (cleanL === 'events:') {
                    parentIsEvents = true;
                    break;
                }
                if (/^(on|after)\b/i.test(cleanL)) {
                    parentIsEvents = false;
                    break;
                }
                if (ind === 0 && cleanL !== '') {
                    break;
                }
            }
        }
    }

    const isCommand = linePrefix.trim().startsWith('-');
    const isTag = linePrefix.includes('<');

    if ((isEventLine || parentIsEvents) && !isCommand && !isTag) {
        const evMatch = linePrefix.match(/^\s*(on|after)\s+(.*)$/i);
        if (evMatch) {
            const typed = evMatch[2];
            const comps: CompletionItem[] =[];
            const resolved = eventRegistry.resolveEvent(typed);

            if (resolved && typed.length > resolved.matchStr.length) {
                comps.push(...eventRegistry.getSwitchCompletions(resolved.meta));
                return comps;
            } else {
                comps.push(...eventRegistry.getCompletions());
                return comps;
            }
        } else {
            const trimmed = linePrefix.trim().toLowerCase();
            if (trimmed === '' || 'on'.startsWith(trimmed) || 'after'.startsWith(trimmed)) {
                return[
                    { label: 'on', kind: CompletionItemKind.Keyword, insertText: 'on ' },
                    { label: 'after', kind: CompletionItemKind.Keyword, insertText: 'after ' }
                ];
            }
        }
    }

    const tagContent = extractTagBeforeCursor(linePrefix);
    const completions: CompletionItem[] = [];

    if (tagContent !== null) {
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
                    documentation: objDoc ? objDoc.description : undefined
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
            if (parts[0].toLowerCase() === 'context') {
                let parentEventMeta = null;
                // Ищем родительский ивент, отступая вверх по строкам
                const currentIndent = doc.getText({ start: { line: pos.position.line, character: 0 }, end: { line: pos.position.line + 1, character: 0 } }).match(/^(\s*)/)?.[1].length || 0;
                for (let i = pos.position.line - 1; i >= 0; i--) {
                    const l = doc.getText({ start: { line: i, character: 0 }, end: { line: i + 1, character: 0 } });
                    const ind = l.match(/^(\s*)/)?.[1]?.length || 0;
                    if (ind < currentIndent && /^\s*(on|after)\s+/.test(l)) {
                        const m = l.match(/^\s*(on|after)\s+(.+?):\s*(?:#.*|\/\/.*)?$/i);
                        if (m) {
                            const res = eventRegistry.resolveEvent(m[2].trim());
                            if (res) parentEventMeta = res.meta;
                        }
                        break;
                    }
                    if (ind === 0 && l.trim() !== '') break;
                }
                // Если мы пишем <context.[СЮДА]>, то выдаем варианты
                if (parts.length === 2 && parentEventMeta) {
                    completions.push(...eventRegistry.getContextCompletions(parentEventMeta));
                    return completions;
                }
            }
            
            const targetType = resolveTagType(tagContent, ast, currentContainer, db, parts.length - 1); 

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
    } else {
        const cmdMatch = linePrefix.match(/^\s*-\s*([a-zA-Z0-9_]*)$/);
        if (cmdMatch) {
            db.commands.forEach(item => {
                completions.push({ label: item.name.toLowerCase(), kind: CompletionItemKind.Keyword, documentation: item.description });
            });
        }
    }
    return completions;
}
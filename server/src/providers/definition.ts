import { Definition, Location, TextDocumentPositionParams, TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { extractAllTagsGlobal, parseAST } from '../ast';
import { db, MetaItem } from '../database';
import { splitTagChain, stripArgs } from '../utils';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { globalStoragePath } from '../server';
import * as fs from 'fs';

export function handleDefinition(pos: TextDocumentPositionParams, documents: TextDocuments<TextDocument>): Definition | null {
    const doc = documents.get(pos.textDocument.uri);
    if (!doc) return null;
    const ast = parseAST(doc);
    const offset = doc.offsetAt(pos.position);
    
    const allTags = extractAllTagsGlobal(doc.getText());
    const tags = allTags.filter(t => offset >= t.start - 1 && offset <= t.end + 1);
    if (tags.length === 0) return null;
    tags.sort((a, b) => (a.end - a.start) - (b.end - b.start));
    const tag = tags[0];

    if (tag.text.startsWith('[') && tag.text.includes(']')) {
        let relativeOffset = offset - tag.start;
        if (relativeOffset <= tag.text.indexOf(']')) {
            const varName = tag.text.substring(1, tag.text.indexOf(']'));
            const currentNode = ast.find(n => n.line === pos.position.line);
            const container = currentNode?.container || "global";

            for (const n of ast) {
                if (n.container === container) {
                    const defRegex = new RegExp(`(?:def|define)\\s+${varName}\\b`, 'i');
                    const match = n.text.match(defRegex);
                    if (match) {
                        return Location.create(doc.uri, {
                            start: { line: n.line, character: match.index! },
                            end: { line: n.line, character: match.index! + match[0].length }
                        });
                    }
                }
            }
            return null;
        }
    }

    const tagContent = tag.text;
    const parts = splitTagChain(tagContent);
    let relativeOffset = offset - tag.start;
    let currentLocalOffset = 0;
    let targetIndex = -1;

    for (let i = 0; i < parts.length; i++) {
        const partEnd = currentLocalOffset + parts[i].length;
        const startBound = i === 0 ? currentLocalOffset - 1 : currentLocalOffset; 
        if (relativeOffset >= startBound && relativeOffset <= partEnd) {
            targetIndex = i;
            break;
        }
        currentLocalOffset += parts[i].length + 1;
    }

    if (targetIndex < 0) return null;

    let targetMeta: MetaItem | undefined = undefined;
    const getCleanName = (part: string) => stripArgs(part).split('||')[0];

    if (targetIndex === 0) {
        const rawPart = parts[0];
        if (!rawPart.startsWith('[')) {
            const baseObjName = getCleanName(rawPart).toLowerCase();
            const fmt = db.formatters.find(f => f.name.toLowerCase() === baseObjName);
            if (fmt) {
                targetMeta = fmt;
            } else {
                const typeName = baseObjName.charAt(0).toUpperCase() + baseObjName.slice(1) + 'Tag';
                targetMeta = db.objectDocs.get(typeName.toLowerCase());
            }
        }
    } else {
        let firstPart = parts[0];
        let currentType = 'ObjectTag';

        if (!firstPart.startsWith('[')) {
            const baseObjName = getCleanName(firstPart).toLowerCase();
            const fmt = db.formatters.find(f => f.name.toLowerCase() === baseObjName);
            if (fmt) currentType = (fmt.returnType || 'ElementTag').replace(/\(.*?\)/g, '').trim();
            else currentType = (baseObjName.charAt(0).toUpperCase() + baseObjName.slice(1) + 'Tag').replace(/\(.*?\)/g, '').trim();
        }
        
        for (let i = 1; i < targetIndex; i++) {
            const propName = getCleanName(parts[i]);
            const asMatch = propName.match(/^as\[(.*?)\]$/i);
            if (asMatch) {
                currentType = asMatch[1].charAt(0).toUpperCase() + asMatch[1].toLowerCase().slice(1) + 'Tag';
                continue;
            }

            if (currentType === 'ObjectTag') {
                let foundType = 'ElementTag';
                for (const base of db.baseObjects) {
                    const tName = base.charAt(0).toUpperCase() + base.slice(1) + 'Tag';
                    const props = db.getProperties(tName) ||[];
                    const found = props.find(m => m.name.toLowerCase() === propName.toLowerCase());
                    if (found) { foundType = found.returnType || 'ElementTag'; break; }
                }
                currentType = foundType.replace(/\(.*?\)/g, '').trim();
            } else {
                const props = db.getProperties(currentType) ||[];
                const found = props.find(m => m.name.toLowerCase() === propName.toLowerCase());
                let nextType = found?.returnType || 'ElementTag';
                currentType = nextType.replace(/\(.*?\)/g, '').trim();
            }
        }

        const targetPropName = getCleanName(parts[targetIndex]);
        let targetProps = db.getProperties(currentType) ||[];
        if (currentType === 'ObjectTag') {
            for (const base of db.baseObjects) {
                const tName = base.charAt(0).toUpperCase() + base.slice(1) + 'Tag';
                targetProps = targetProps.concat(db.getProperties(tName) ||[]);
            }
        }

        targetMeta = targetProps.find(m => m.name.toLowerCase() === targetPropName.toLowerCase());
    }

    if (targetMeta && targetMeta.sourceFile && targetMeta.sourceLine !== undefined) {
        const SRC_DIR = path.join(globalStoragePath, 'corex_src_cache');
        const absolutePath = path.resolve(SRC_DIR, targetMeta.sourceFile);
        
        if (!fs.existsSync(absolutePath)) {
            return null;
        }

        const fileUri = pathToFileURL(absolutePath).toString();
        return Location.create(fileUri, {
            start: { line: targetMeta.sourceLine, character: 0 },
            end: { line: targetMeta.sourceLine, character: 0 }
        });
    }
    return null;
}
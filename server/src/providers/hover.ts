import { HandlerResult, Hover, TextDocumentPositionParams, TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { db } from '../database';
import { resolveTagType, splitTagChain, stripArgs } from '../utils';
import { parseAST } from '../ast';
import { eventRegistry } from './events';

export function handleHover(pos: TextDocumentPositionParams, documents: TextDocuments<TextDocument>): HandlerResult<Hover | null | undefined, void> {
    const doc = documents.get(pos.textDocument.uri);
    if (!doc) return null;

    const ast = parseAST(doc);
    const offset = doc.offsetAt(pos.position);
    
    const node = ast.find(n => n.line === pos.position.line);
    if (!node) return null;

    if (node.name === 'on' || node.name === 'after') {
        const evMatch = node.text.match(/^(\s*)(on|after)\s+(.+?):\s*(?:#.*|\/\/.*)?$/i);
        if (evMatch) {
            const eventLine = evMatch[3].trim();
            const resolved = eventRegistry.resolveEvent(eventLine);
            if (resolved) {
                let md = `### Event: ${resolved.meta.name}\n\n`;
                if (resolved.meta.description) md += `${resolved.meta.description.replace(/\n/g, '<br>')}\n\n`;
                if (resolved.meta.events) md += `**Patterns:**\n\`\`\`corex\n${resolved.meta.events}\n\`\`\`\n\n`;
                if (resolved.meta.context) md += `**Context:**\n${resolved.meta.context.replace(/\n/g, '<br>')}\n\n`;
                if (resolved.meta.switches) md += `**Switches:**\n${resolved.meta.switches.replace(/\n/g, '<br>')}\n\n`;
                if (resolved.meta.usage) md += `**Examples:**\n\`\`\`corex\n${resolved.meta.usage}\n\`\`\`\n\n`;
                return { contents: { kind: 'markdown', value: md } };
            }
        }
    }

    const defMatch = node.text.match(/(?:def|define)\s+([a-zA-Z0-9_]+)\s+(.*)/i);
    if (defMatch) {
        const varName = defMatch[1];
        const varValue = defMatch[2].trim();
        const varStart = node.text.indexOf(varName);
        
        if (pos.position.character >= varStart && pos.position.character <= varStart + varName.length) {
            return {
                contents: { kind: 'markdown', value: `\`\`\`corex\n- define ${varName} ${varValue}\n\`\`\`` }
            };
        }
    }

    const tags = node.tagsUsed.filter(t => offset >= t.start - 1 && offset <= t.end + 1);
    if (tags.length === 0) return null;
    tags.sort((a, b) => (a.end - a.start) - (b.end - b.start));
    const tag = tags[0];

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

    const getCleanName = (part: string) => stripArgs(part).split('||')[0];

    if (targetIndex === 0) {
        const rawPart = parts[0];
        
        if (rawPart.startsWith('[') && rawPart.includes(']')) {
            const varName = rawPart.substring(1, rawPart.indexOf(']'));
            let currentContainer = node.container;
            let value = "ObjectTag";
            
            for (const n of ast) {
                if (n.container === currentContainer) {
                    const match = n.text.match(new RegExp(`(?:def|define)\\s+${varName}\\s+(.+)`, 'i'));
                    if (match) value = match[1].trim();
                }
            }

            return { contents: { kind: 'markdown', value: `\`\`\`corex\n- define ${varName} ${value}\n\`\`\`` } };
        }

        const baseObjName = getCleanName(rawPart).toLowerCase();
        
        const fmt = db.formatters.find(f => f.name.toLowerCase() === baseObjName);
        if (fmt) {
            let md = `### ${fmt.originalName || fmt.name}\n\n`;
            if (fmt.description) md += `${fmt.description.replace(/\n/g, '<br>')}\n\n`;
            if (fmt.syntax) md += `**Syntax:** \`${fmt.syntax}\`\n\n`;
            if (fmt.returnType) md += `**Returns:** \`${fmt.returnType}\`\n\n`;
            return { contents: { kind: 'markdown', value: md } };
        }

        const typeName = baseObjName.charAt(0).toUpperCase() + baseObjName.slice(1) + 'Tag';
        
        let md = `### ${typeName}\n\n`;
        const objDoc = db.objectDocs.get(typeName.toLowerCase());
        
        if (objDoc) {
            if (objDoc.description) md += `${objDoc.description}\n\n`;
            if (objDoc.format) md += `**Format:** ${objDoc.format}\n\n`;
        }
        return { contents: { kind: 'markdown', value: md } };
    }

    const currentType = resolveTagType(tagContent, ast, node.container, db, targetIndex);
    const targetPropName = getCleanName(parts[targetIndex]);
    
    const asMatchT = targetPropName.match(/^as\[(.*?)\]$/i);
    if (asMatchT) {
        return { contents: { kind: 'markdown', value: `### as[<type>]\n\nCasts this object to a specific tag type (e.g. player, list).` } };
    }

    let targetProps = db.getProperties(currentType) ||[];
    if (currentType === 'ObjectTag') {
        for (const base of db.baseObjects) {
            const tName = base.charAt(0).toUpperCase() + base.slice(1) + 'Tag';
            targetProps = targetProps.concat(db.getProperties(tName) ||[]);
        }
    }

    const targetMeta = targetProps.find(m => m.name.toLowerCase() === targetPropName.toLowerCase());

    if (targetMeta) {
        let md = `### ${targetMeta.originalName || targetMeta.name}\n\n`;
        if (targetMeta.description) md += `${targetMeta.description.replace(/\n/g, '<br>')}\n\n`;
        if (targetMeta.syntax) md += `**Syntax:** \`${targetMeta.syntax}\`\n\n`;
        if (targetMeta.returnType) md += `**Returns:** \`${targetMeta.returnType}\`\n\n`;
        return { contents: { kind: 'markdown', value: md } };
    }

    return null;
}
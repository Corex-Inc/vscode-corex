import { TagDatabase } from './database';
import { CommandNode } from './ast';


export function cleanTagName(name: string): string {
    return name.replace(/<|>/g, '').split('[')[0];
}

export function splitTagChain(tagContent: string): string[] {
    const parts: string[] =[];
    let current = "";
    let depth = 0;
    for (let i = 0; i < tagContent.length; i++) {
        const char = tagContent[i];
        if (char === '<' || char === '[') depth++;
        else if (char === '>' || char === ']') depth--;

        if (char === '.' && depth === 0) {
            parts.push(current);
            current = "";
        } else {
            current += char;
        }
    }
    parts.push(current);
    return parts;
}

export function stripArgs(part: string): string {
    return part.split('[')[0].trim(); 
}

export function resolveChainType(parts: string[], db: TagDatabase): string {
    if (parts.length === 0) return 'ElementTag';
    
    const cleanBase = stripArgs(parts[0]);
    let currentType = cleanBase.charAt(0).toUpperCase() + cleanBase.toLowerCase().slice(1) + 'Tag';
    
    for (let i = 1; i < parts.length - 1; i++) {
        const propName = stripArgs(parts[i]);
        const props = db.getProperties(currentType);
        const found = props.find(m => m.name.toLowerCase() === propName.toLowerCase());
        currentType = found?.returnType || 'ElementTag';
    }
    return currentType;
}

export function extractTagBeforeCursor(line: string): string | null {
    let depth = 0;
    for (let i = line.length - 1; i >= 0; i--) {
        if (line[i] === '>') depth++;
        else if (line[i] === ']') depth++;
        else if (line[i] === '[') depth--;
        else if (line[i] === '<') {
            if (depth === 0) return line.substring(i + 1);
            depth--;
        }
    }
    return null;
}

export function resolveTagType(tagContent: string, ast: CommandNode[], container: string, db: TagDatabase, stopIndex?: number, visitedVars = new Set<string>()): string {
    const parts = splitTagChain(tagContent);
    if (parts.length === 0) return 'ObjectTag';

    let currentType = 'ObjectTag';
    const getCleanName = (part: string) => stripArgs(part).split('||')[0].toLowerCase();
    const limit = stopIndex !== undefined ? stopIndex : parts.length;

    if (parts[0].startsWith('[')) {
        const varName = parts[0].substring(1, parts[0].indexOf(']'));
        
        if (visitedVars.has(varName)) return 'ObjectTag'; 
        visitedVars.add(varName);

        if (varName === 'loopIndex' || varName === 'key') {
            currentType = 'ElementTag';
        } else {
            let definedValue = "";
            let isRepeatAlias = false;

            for (const n of ast) {
                if (n.container === container) {
                    if (n.definitionsProvided.includes(varName)) {
                        const match = n.text.split('//')[0].split('#')[0].match(new RegExp(`(?:def|define)\\s+${varName}\\s+(.+)`, 'i'));
                        if (match) definedValue = match[1].trim();
                    }
                    if (n.name === 'repeat' && n.text.match(new RegExp(`\\bas:${varName}\\b`, 'i'))) {
                        isRepeatAlias = true;
                    }
                }
            }
            
            if (isRepeatAlias) {
                currentType = 'ElementTag';
            } else if (definedValue) {
                if (definedValue.startsWith('<') && definedValue.endsWith('>')) {
                    currentType = resolveTagType(definedValue.substring(1, definedValue.length - 1), ast, container, db, undefined, visitedVars);
                } else {
                    currentType = 'ElementTag'; 
                }
            }
        }
    } else {
        const baseObjName = getCleanName(parts[0]);
        const fmt = db.formatters.find(f => f.name.toLowerCase() === baseObjName);
        if (fmt) {
            currentType = (fmt.returnType || 'ElementTag').replace(/\(.*?\)/g, '').trim();
        } else {
            const typeName = baseObjName.charAt(0).toUpperCase() + baseObjName.slice(1) + 'Tag';
            currentType = db.objectDocs.has(typeName.toLowerCase()) ? typeName : 'ObjectTag';
        }
    }

    for (let i = 1; i < limit; i++) {
        const propName = getCleanName(parts[i]);
        if (!propName) continue;

        const asMatch = propName.match(/^as\[(.*?)\]$/i);
        if (asMatch) {
            currentType = asMatch[1].charAt(0).toUpperCase() + asMatch[1].toLowerCase().slice(1) + 'Tag';
            continue;
        }

        const props = db.getProperties(currentType) ||[];
        const found = props.find(m => m.name.toLowerCase() === propName);

        if (found) {
            currentType = (found.returnType || 'ElementTag').replace(/\(.*?\)/g, '').trim();
        } else if (currentType === 'ObjectTag') {
            let foundInGlobal = 'ElementTag';
            for (const base of db.baseObjects) {
                const tName = base.charAt(0).toUpperCase() + base.slice(1) + 'Tag';
                const p = (db.getProperties(tName) ||[]).find(m => m.name.toLowerCase() === propName);
                if (p) { foundInGlobal = p.returnType || 'ElementTag'; break; }
            }
            currentType = foundInGlobal.replace(/\(.*?\)/g, '').trim();
        }
    }

    return currentType;
}
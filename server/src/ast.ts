import { TextDocument } from 'vscode-languageserver-textdocument';

export interface Token {
    text: string;
    start: number;
    end: number;
}

export interface CommandNode {
    name: string;
    line: number;
    endLine: number;
    endNodeIndex: number;
    indent: number;
    container: string;
    path: string; 
    text: string;
    definitionsProvided: string[];
    tagsUsed: Token[];
    isBlock: boolean; 
}

export function parseAST(doc: TextDocument): CommandNode[] {
    const text = doc.getText();
    const lines = text.split('\n');
    const nodes: CommandNode[] =[];
    
    const allTags = extractAllTagsGlobal(text);
    
    let currentContainer = "global";
    let pathStack: {name: string, indent: number}[] = [{name: "global", indent: 0}];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineOffset = doc.offsetAt({ line: i, character: 0 });

        if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*')) continue;

        const keyMatch = line.match(/^(\s*)([a-zA-Z0-9_-]+):\s*(?:#.*|\/\/.*)?$/);
        if (keyMatch && !line.trim().startsWith('-')) {
            const indent = keyMatch[1].length;
            const keyName = keyMatch[2];

            if (indent === 0) {
                currentContainer = keyName;
                pathStack = [{name: keyName, indent: 0}];
            } else {
                while (pathStack.length > 0 && pathStack[pathStack.length - 1].indent >= indent) {
                    pathStack.pop();
                }
                pathStack.push({name: keyName, indent});
            }
            continue;
        }

        const currentPath = pathStack.map(p => p.name).join('.');

        const evMatch = line.match(/^(\s*)(on|after)\s+(.+?):\s*(?:#.*|\/\/.*)?$/i);
        if (evMatch && currentPath.includes('events')) {
            const indent = evMatch[1].length;
            const node: CommandNode = {
                name: evMatch[2].toLowerCase(),
                line: i, endLine: i, endNodeIndex: -1, indent: indent,
                container: currentContainer, path: currentPath, text: line,
                definitionsProvided: [], tagsUsed:[], isBlock: true
            };
            nodes.push(node);
            continue;
        }

        const cmdMatch = line.match(/^(\s*)-\s*(~?[a-zA-Z0-9_]+)/);
        if (cmdMatch) {
            const indent = cmdMatch[1].length;
            const cmdName = cmdMatch[2].replace('~', '').toLowerCase();
            const cleanText = line.split('//')[0].trim();
            
            const lineEndOffset = doc.offsetAt({ line: i, character: line.length });
            const tagsInThisLine = allTags.filter(t => t.start >= lineOffset && t.start <= lineEndOffset);

            const currentPath = pathStack.map(p => p.name).join('.');

            const node: CommandNode = {
                name: cmdName,
                line: i,
                endLine: i,
                endNodeIndex: -1,
                indent: indent,
                container: currentContainer,
                path: currentPath, 
                text: line,
                definitionsProvided:[],
                tagsUsed: tagsInThisLine,
                isBlock: cleanText.endsWith(':')
            };

            if (cmdName === 'def' || cmdName === 'define') {
                const defMatch = line.match(/(?:def|define)\s+([a-zA-Z0-9_]+)/i);
                if (defMatch) node.definitionsProvided.push(defMatch[1]);
            }
            
            const asMatch = line.match(/\bas:([a-zA-Z0-9_]+)\b/i);
            if (asMatch) node.definitionsProvided.push(asMatch[1]);

            if (['repeat', 'while'].includes(cmdName)) node.definitionsProvided.push('loopIndex');
            if (cmdName === 'foreach') node.definitionsProvided.push('loopIndex', 'key', 'value');

            nodes.push(node);
        }
    }

    for (let i = 0; i < nodes.length; i++) {
        const current = nodes[i];
        let endNodeIndex = i;
        for (let j = i + 1; j < nodes.length; j++) {
            if (nodes[j].path !== current.path) break; 
            if (nodes[j].indent > current.indent) endNodeIndex = j;
            else break;
        }
        current.endLine = nodes[endNodeIndex].line;
        current.endNodeIndex = endNodeIndex;
    }

    return nodes;
}

export function extractAllTagsGlobal(text: string): Token[] {
    const tags: Token[] = [];
    const starts: number[] =[];

    for (let i = 0; i < text.length; i++) {
        if (text[i] === '/' && text[i+1] === '/') {
            while (i < text.length && text[i] !== '\n') i++;
            continue;
        }

        if (text[i] === '<') {
            starts.push(i);
        } else if (text[i] === '>') {
            if (starts.length > 0) {
                const start = starts.pop()!;
                tags.push({
                    text: text.substring(start + 1, i),
                    start: start + 1,
                    end: i
                });
            }
        }
    }
    return tags;
}
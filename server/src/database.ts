import { cleanTagName } from './utils';

export interface MetaItem {
    type: string;
    name: string;
    originalName?: string;
    object?: string;
    returnType?: string;
    description: string;
    reqArg?: any;
    noArg?: any;
    syntax?: string;
    implements?: string;
    format?: string;
    prefix?: string;
    sourceFile?: string;
    sourceLine?: number;
    isHiddenFromAutocomplete?: boolean;
    events?: string;
    switches?: string;
    context?: string;
    cancellable?: boolean;
    usage?: string;
    parsedSwitches?: { name: string, desc: string }[];
    parsedContexts?: { name: string, desc: string, returnType: string }[];
    [key: string]: any;
}

export class TagDatabase {
    baseObjects: Set<string> = new Set();
    typeMap: Map<string, MetaItem[]> = new Map();
    commands: MetaItem[] = [];
    objectDocs: Map<string, MetaItem> = new Map();
    formatters: MetaItem[] = [];
    events: MetaItem[] = [];

    build(metaCache: MetaItem[]) {
        this.baseObjects.clear();
        this.typeMap.clear();
        this.commands = [];
        this.objectDocs.clear();
        this.formatters = [];
        this.events = [];

        for (const item of metaCache) {
            if (item.type === 'command') {
                this.commands.push(item);
            } else if (item.type === 'object') {
                this.objectDocs.set(item.name.toLowerCase(), item);
            } else if (item.type === 'formatter') {
                item.name = cleanTagName(item.name);
                let partSnippet = item.name;
                if (item.reqArg) partSnippet += `[$1]`;
                else if (item.originalName?.includes('[') && !item.noArg) partSnippet += `[]`;
                item.insertSnippet = partSnippet;
                
                item.returnType = item.returnType || 'ElementTag';
                this.formatters.push(item);
            } else if (item.type === 'tag') {
                const obj = item.object ? item.object.toLowerCase() : 'ElementTag';
                const baseName = obj.replace('tag', '');
                this.baseObjects.add(baseName);

                if (item.name.includes('.')) {
                    const rawParts = item.name.split('.');
                    let currentContextType = obj;

                    rawParts.forEach((rawPart, index) => {
                        const subName = cleanTagName(rawPart);
                        let snippet = "";
                        let snippetIndex = 1;
                        for (let k = index; k < rawParts.length; k++) {
                            const kp = rawParts[k];
                            const kName = cleanTagName(kp);
                            const isReq = item.reqArg === 'all' || (Array.isArray(item.reqArg) && item.reqArg.includes(k + 1));
                            const isNo = item.noArg === 'all' || (Array.isArray(item.noArg) && item.noArg.includes(k + 1));
                            const hasBrackets = kp.includes('[');

                            let partSnippet = kName;
                            if (isReq) {
                                partSnippet += `[$${snippetIndex}]`;
                                snippetIndex++;
                            } else if (hasBrackets && !isNo) {
                                partSnippet += `[]`; 
                            }
                            snippet += (k === index ? "" : ".") + partSnippet;
                        }

                        const subItem: MetaItem = {
                            ...item,
                            name: subName,
                            originalName: item.name,
                            insertSnippet: snippet,
                            isHiddenFromAutocomplete: index > 0, 
                            reqArg: (item.reqArg === 'all' || (Array.isArray(item.reqArg) && item.reqArg.includes(index + 1))) ? 'all' : undefined,
                            noArg: (item.noArg === 'all' || (Array.isArray(item.noArg) && item.noArg.includes(index + 1))) ? 'all' : undefined,
                            returnType: index === rawParts.length - 1 ? (item.returnType || 'ElementTag') : currentContextType,
                            sourceFile: item.sourceFile,
                            sourceLine: item.sourceLine
                        };

                        if (!this.typeMap.has(currentContextType)) this.typeMap.set(currentContextType,[]);
                        this.typeMap.get(currentContextType)!.push(subItem);

                        currentContextType = (subItem.returnType || "unknown").toLowerCase();
                    });
                } else {
                    item.name = cleanTagName(item.name);
                    let partSnippet = item.name;
                    if (item.reqArg) partSnippet += `[$1]`;
                    else if (item.originalName?.includes('[') && !item.noArg) partSnippet += `[]`;
                    item.insertSnippet = partSnippet;

                    if (!this.typeMap.has(obj)) this.typeMap.set(obj,[]);
                    this.typeMap.get(obj)!.push(item);
                }
            } else if (item.type === 'event') {
                if (item.switches && typeof item.switches === 'string') {
                    item.parsedSwitches = item.switches.split('\n').map(l => {
                        const match = l.match(/^([a-zA-Z0-9_]+):/);
                        return { name: match ? match[1] : l.split(':')[0], desc: l };
                    });
                } else {
                    item.parsedSwitches = [];
                }
                if (item.context && typeof item.context === 'string') {
                    item.parsedContexts = item.context.split('\n').filter(l => l.trim().length > 0).map(l => {
                        const parts = l.split('-');
                        let nameStr = parts[0].trim();
                        const match = nameStr.match(/<context\.([a-zA-Z0-9_]+)>/i);
                        const name = match ? match[1] : nameStr.replace(/[<>]/g, '').replace('context.', '');
                        const desc = parts.slice(1).join('-').trim() || l;
                        
                        const returnTypeMatch = desc.match(/(?:returns?|returns an?)\s+([a-zA-Z0-9_]+Tag)/i);
                        const returnType = returnTypeMatch ? returnTypeMatch[1] : 'ElementTag';
                        return { name, desc, returnType };
                    });
                } else {
                    item.parsedContexts = [];
                }
                this.events.push(item);
            }
        }
    }

    getProperties(type: string): MetaItem[] {
        return this.typeMap.get(type.toLowerCase()) ||[];
    }
}

export const db = new TagDatabase();
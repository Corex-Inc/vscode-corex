import { MetaItem, db } from '../database';
import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node';

export class EventPattern {
    compiledPattern: RegExp;

    constructor(syntax: string) {
        let regex = syntax.trim();

        const words = regex.split(/\s+/);
        const alternationsFixed = words.map(word => {
            if (word.includes('|') && !word.includes('<')) return `(?:${word})`;
            return word;
        });
        regex = alternationsFixed.join(' ').trim();

        const optRegex = /\s*\((?!\?:)([^)]+)\)/g;
        regex = regex.replace(optRegex, (match, p1) => `(?:\\s+${p1})?`);

        const varRegex = /<([a-zA-Z0-9_]+)>/g;
        regex = regex.replace(varRegex, '([a-zA-Z0-9_:\\*\\-]+)');

        regex = regex.replace(/ /g, '\\s+');
        regex = regex.replace(/(?:\\s\+){2,}/g, '\\s+');

        this.compiledPattern = new RegExp(`^${regex}$`, 'i');
    }

    match(rawLine: string) {
        return this.compiledPattern.test(rawLine.trim());
    }
}

export class EventRegistry {
    patterns: { pattern: EventPattern, meta: MetaItem }[] = [];

    build() {
        this.patterns =[];
        for (const ev of db.events) {
            if (ev.events && typeof ev.events === 'string') {
                const lines = ev.events.split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        this.patterns.push({ pattern: new EventPattern(line.trim()), meta: ev });
                    }
                }
            }
        }
    }

    resolveEvent(line: string) {
        const words = line.trim().split(/\s+/);
        
        for (let i = words.length; i >= 1; i--) {
            const attempt = words.slice(0, i).join(' ');
            const potentialSwitches = words.slice(i);
            
            for (const p of this.patterns) {
                if (p.pattern.match(attempt)) {
                    return { meta: p.meta, switches: potentialSwitches, matchStr: attempt };
                }
            }
        }
        return null;
    }

    getCompletions(): CompletionItem[] {
        const comps: CompletionItem[] =[];
        const seen = new Set<string>();
        for (const p of this.patterns) {
            const clean = p.meta.events?.split('\n')[0].replace(/[<>()]/g, '') || '';
            if (!seen.has(clean)) {
                seen.add(clean);
                comps.push({
                    label: clean + ":\n    ",
                    kind: CompletionItemKind.Event,
                    detail: 'Corex Event',
                    documentation: p.meta.description
                });
            }
        }
        return comps;
    }

    getSwitchCompletions(meta: MetaItem): CompletionItem[] {
        if (!meta.parsedSwitches) return[];
        return meta.parsedSwitches.map(sw => ({
            label: sw.name + ':',
            kind: CompletionItemKind.Property,
            detail: 'Event Switch',
            documentation: sw.desc
        }));
    }

	getContextCompletions(meta: MetaItem): CompletionItem[] {
        if (!meta.parsedContexts) return [];
        return meta.parsedContexts.map(ctx => ({
            label: ctx.name,
            kind: CompletionItemKind.Variable,
            detail: `Returns: ${ctx.returnType}`,
            documentation: ctx.desc,
            insertText: ctx.name
        }));
    }
}

export const eventRegistry = new EventRegistry();
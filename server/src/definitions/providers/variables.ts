import { Location } from 'vscode-languageserver/node';
import { definitionRegistry } from '../DefinitionRegistry';

definitionRegistry.register({
    provide: (ctx) => {
        const tag = ctx.currentTag;
        if (!tag) return null;

        if (tag.text.startsWith('[') && tag.text.includes(']')) {
            let relativeOffset = ctx.offset - tag.start;
            
            if (relativeOffset <= tag.text.indexOf(']')) {
                const varName = tag.text.substring(1, tag.text.indexOf(']'));
                const container = ctx.currentNode?.container || "global";

                for (const n of ctx.ast) {
                    if (n.container === container) {
                        const defRegex = new RegExp(`(?:def|define)\\s+${varName}\\b`, 'i');
                        const match = n.text.match(defRegex);
                        if (match) {
                            return Location.create(ctx.doc.uri, {
                                start: { line: n.line, character: match.index! },
                                end: { line: n.line, character: match.index! + match[0].length }
                            });
                        }
                    }
                }
            }
        }
        return null;
    }
});
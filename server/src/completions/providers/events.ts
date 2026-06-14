import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node';
import { completionRegistry } from '../CompletionRegistry';
import { eventRegistry } from '../../services/events';

completionRegistry.register(
    (ctx) => (ctx.isEventLine || ctx.parentIsEvents) && !ctx.isCommand && !ctx.isTag,
    (ctx) => {
        const evMatch = ctx.linePrefix.match(/^\s*(on|after)\s+(.*)$/i);
        if (evMatch) {
            const typed = evMatch[2];
            const resolved = eventRegistry.resolveEvent(typed);

            if (resolved && typed.length > resolved.matchStr.length) {
                return eventRegistry.getSwitchCompletions(resolved.meta);
            } else {
                return eventRegistry.getCompletions();
            }
        } else {
            const trimmed = ctx.linePrefix.trim().toLowerCase();
            if (trimmed === '' || 'on'.startsWith(trimmed) || 'after'.startsWith(trimmed)) {
                return [
                    { label: 'on', kind: CompletionItemKind.Keyword, insertText: 'on ' },
                    { label: 'after', kind: CompletionItemKind.Keyword, insertText: 'after ' }
                ];
            }
        }
        return [];
    }
);
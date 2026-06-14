import { hoverRegistry } from '../HoverRegistry';
import { eventRegistry } from '../../services/events';

hoverRegistry.register({
    provide: (ctx) => {
        const node = ctx.currentNode;
        if (!node || (node.name !== 'on' && node.name !== 'after')) return null;

        const evMatch = node.text.match(/^(\s*)(on|after)\s+(.+?):\s*(?:#.*|\/\/.*)?$/i);
        if (evMatch) {
            const eventLine = evMatch[3].trim();
            const resolved = eventRegistry.resolveEvent(eventLine);
            if (resolved) {
                let md = `### Event: ${resolved.meta.name}\n\n`;
                if (resolved.meta.description) md += `${resolved.meta.description}\n\n`;
                if (resolved.meta.events) md += `**Patterns:**\n\`\`\`corex\n${resolved.meta.events}\n\`\`\`\n\n`;
                if (resolved.meta.context) md += `**Context:**\n${resolved.meta.context}\n\n`;
                if (resolved.meta.switches) md += `**Switches:**\n${resolved.meta.switches}\n\n`;
                if (resolved.meta.usage) md += `**Examples:**\n\`\`\`corex\n${resolved.meta.usage}\n\`\`\`\n\n`;
                return { contents: { kind: 'markdown', value: md } };
            }
        }
        return null;
    }
});
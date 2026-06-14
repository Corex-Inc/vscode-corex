import { hoverRegistry } from '../HoverRegistry';

hoverRegistry.register({
    provide: (ctx) => {
        const node = ctx.currentNode;
        if (!node) return null;

        const defMatch = node.text.match(/(?:def|define)\s+([a-zA-Z0-9_]+)\s+(.*)/i);
        if (defMatch) {
            const varName = defMatch[1];
            const varValue = defMatch[2].trim();
            const varStart = node.text.indexOf(varName);
            
            if (ctx.position.character >= varStart && ctx.position.character <= varStart + varName.length) {
                return {
                    contents: { kind: 'markdown', value: `\`\`\`corex\n- define ${varName} ${varValue}\n\`\`\`` }
                };
            }
        }
        return null;
    }
});
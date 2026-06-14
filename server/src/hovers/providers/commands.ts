import { hoverRegistry } from '../HoverRegistry';
import { db } from '../../database';

hoverRegistry.register({
    provide: (ctx) => {
        const node = ctx.currentNode;
        if (!node) return null;

        const cmdMatch = node.text.match(/^(\s*)-\s*(~?[a-zA-Z0-9_]+)/);
        if (cmdMatch) {
            const cmdNameStart = node.text.indexOf(cmdMatch[2]);
            const cmdNameEnd = cmdNameStart + cmdMatch[2].length;
            
            if (ctx.position.character >= cmdNameStart && ctx.position.character <= cmdNameEnd) {
                const cmdMeta = db.getCommand(node.name);
                if (cmdMeta) {
                    let md = `### Command: ${cmdMeta.name}\n\n`;
                    if (cmdMeta.shortDescription) md += `*${cmdMeta.shortDescription}*\n\n`;
                    if (cmdMeta.syntax) md += `\`\`\`xml\n- ${cmdMeta.syntax}\n\`\`\`\n\n`;
                    if (cmdMeta.description) md += `---\n${cmdMeta.description}\n\n`;
                    if (cmdMeta.usage) md += `**Examples:**\n\`\`\`corex\n${cmdMeta.usage}\n\`\`\`\n\n`;
                    return { contents: { kind: 'markdown', value: md } };
                }
            }
        }
        return null;
    }
});
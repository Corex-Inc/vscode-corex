import { hoverRegistry } from '../HoverRegistry';
import { db } from '../../database';
import { resolveTagType, splitTagChain, stripArgs } from '../../utils';

hoverRegistry.register({
    provide: (ctx) => {
        const node = ctx.currentNode;
        const tag = ctx.currentTag;
        if (!node || !tag) return null;

        const tagContent = tag.text;
        const parts = splitTagChain(tagContent);
        
        let relativeOffset = ctx.offset - tag.start;
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
                
                for (const n of ctx.ast) {
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
                let md = `### Formatter: ${fmt.originalName || fmt.name}\n\n`;
                if (fmt.description) md += `${fmt.description}\n\n`;
                if (fmt.usage) md += `**Examples:**\n\`\`\`corex\n${fmt.usage}\n\`\`\`\n\n`;
                return { contents: { kind: 'markdown', value: md } };
            }

            const typeName = baseObjName.charAt(0).toUpperCase() + baseObjName.slice(1) + 'Tag';
            let md = `### ObjectTag: ${typeName}\n\n`;
            const objDoc = db.objectDocs.get(typeName.toLowerCase());
            
            if (objDoc) {
                if (objDoc.description) md += `${objDoc.description}\n\n`;
                if (objDoc.format) md += `**Prefix:** ${objDoc.prefix}\n\n`;
                if (objDoc.format) md += `**Format:** ${objDoc.format}\n\n`;
            }
            return { contents: { kind: 'markdown', value: md } };
        }

        const currentType = resolveTagType(tagContent, ctx.ast, node.container, db, targetIndex);
        const targetPropName = getCleanName(parts[targetIndex]);
        
        const asMatchT = targetPropName.match(/^as\[(.*?)\]$/i);
        if (asMatchT) {
            return { contents: { kind: 'markdown', value: `### as[<type>]\n\nCasts this object to a specific tag type (e.g. player, list).` } };
        }

        let targetProps = db.getProperties(currentType) || [];
        if (currentType === 'ObjectTag') {
            for (const base of db.baseObjects) {
                const tName = base.charAt(0).toUpperCase() + base.slice(1) + 'Tag';
                targetProps = targetProps.concat(db.getProperties(tName) || []);
            }
        }

        const targetMeta = targetProps.find(m => m.name.toLowerCase() === targetPropName.toLowerCase());

        if (targetMeta) {
            let md = `### Tag: ${targetMeta.originalName || targetMeta.name}\n\n`;
            if (targetMeta.syntax) md += `\`\`\`xml\n- ${targetMeta.syntax}\n\`\`\`\n\n`;
            if (targetMeta.description) md += `---\n${targetMeta.description}\n\n`;
            if (targetMeta.returnType) md += `**Returns:** \`${targetMeta.returnType}\`\n\n`;
            if (targetMeta.usage) md += `**Examples:**\n\`\`\`corex\n${targetMeta.usage}\n\`\`\`\n\n`;
            return { contents: { kind: 'markdown', value: md } };
        }

        return null;
    }
});
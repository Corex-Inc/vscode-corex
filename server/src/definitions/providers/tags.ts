import { Location } from 'vscode-languageserver/node';
import { definitionRegistry } from '../DefinitionRegistry';
import { db, MetaItem } from '../../database';
import { splitTagChain, stripArgs } from '../../utils';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { globalStoragePath } from '../../server';

definitionRegistry.register({
    provide: (ctx) => {
        const tag = ctx.currentTag;
        if (!tag) return null;
        
        if (tag.text.startsWith('[') && tag.text.includes(']')) {
            let relativeOffset = ctx.offset - tag.start;
            if (relativeOffset <= tag.text.indexOf(']')) return null;
        }

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

        let targetMeta: MetaItem | undefined = undefined;
        const getCleanName = (part: string) => stripArgs(part).split('||')[0];

        if (targetIndex === 0) {
            const rawPart = parts[0];
            if (!rawPart.startsWith('[')) {
                const baseObjName = getCleanName(rawPart).toLowerCase();
                const fmt = db.formatters.find(f => f.name.toLowerCase() === baseObjName);
                if (fmt) {
                    targetMeta = fmt;
                } else {
                    const typeName = baseObjName.charAt(0).toUpperCase() + baseObjName.slice(1) + 'Tag';
                    targetMeta = db.objectDocs.get(typeName.toLowerCase());
                }
            }
        } else {
            let firstPart = parts[0];
            let currentType = 'ObjectTag';

            if (!firstPart.startsWith('[')) {
                const baseObjName = getCleanName(firstPart).toLowerCase();
                const fmt = db.formatters.find(f => f.name.toLowerCase() === baseObjName);
                if (fmt) currentType = (fmt.returnType || 'ElementTag').replace(/\(.*?\)/g, '').trim();
                else currentType = (baseObjName.charAt(0).toUpperCase() + baseObjName.slice(1) + 'Tag').replace(/\(.*?\)/g, '').trim();
            }
            
            for (let i = 1; i < targetIndex; i++) {
                const propName = getCleanName(parts[i]);
                const asMatch = propName.match(/^as\[(.*?)\]$/i);
                if (asMatch) {
                    currentType = asMatch[1].charAt(0).toUpperCase() + asMatch[1].toLowerCase().slice(1) + 'Tag';
                    continue;
                }

                if (currentType === 'ObjectTag') {
                    let foundType = 'ElementTag';
                    for (const base of db.baseObjects) {
                        const tName = base.charAt(0).toUpperCase() + base.slice(1) + 'Tag';
                        const props = db.getProperties(tName) || [];
                        const found = props.find(m => m.name.toLowerCase() === propName.toLowerCase());
                        if (found) { foundType = found.returnType || 'ElementTag'; break; }
                    }
                    currentType = foundType.replace(/\(.*?\)/g, '').trim();
                } else {
                    const props = db.getProperties(currentType) || [];
                    const found = props.find(m => m.name.toLowerCase() === propName.toLowerCase());
                    let nextType = found?.returnType || 'ElementTag';
                    currentType = nextType.replace(/\(.*?\)/g, '').trim();
                }
            }

            const targetPropName = getCleanName(parts[targetIndex]);
            let targetProps = db.getProperties(currentType) || [];
            if (currentType === 'ObjectTag') {
                for (const base of db.baseObjects) {
                    const tName = base.charAt(0).toUpperCase() + base.slice(1) + 'Tag';
                    targetProps = targetProps.concat(db.getProperties(tName) || []);
                }
            }

            targetMeta = targetProps.find(m => m.name.toLowerCase() === targetPropName.toLowerCase());
        }

        if (targetMeta && targetMeta.sourceFile && targetMeta.sourceLine !== undefined) {
            const SRC_DIR = path.join(globalStoragePath, 'corex_src_cache');
            const absolutePath = path.resolve(SRC_DIR, targetMeta.sourceFile);
            
            if (!fs.existsSync(absolutePath)) return null;

            const fileUri = pathToFileURL(absolutePath).toString();
            return Location.create(fileUri, {
                start: { line: targetMeta.sourceLine, character: 0 },
                end: { line: targetMeta.sourceLine, character: 0 }
            });
        }
        return null;
    }
});
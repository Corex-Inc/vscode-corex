import { Location } from 'vscode-languageserver/node';
import { definitionRegistry } from '../DefinitionRegistry';
import { eventRegistry } from '../../services/events';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { globalStoragePath } from '../../server';

definitionRegistry.register({
    provide: (ctx) => {
        const node = ctx.currentNode;
        if (!node || (node.name !== 'on' && node.name !== 'after')) return null;

        const evMatch = node.text.match(/^(\s*)(on|after)\s+([^:]+):/i);
        if (evMatch) {
            const prefixLen = evMatch[1].length + evMatch[2].length + 1;
            const eventText = evMatch[3];
            
            const charInLine = ctx.position.character;
            if (charInLine >= prefixLen && charInLine <= prefixLen + eventText.length) {
                const resolved = eventRegistry.resolveEvent(eventText.trim());
                if (resolved && resolved.meta.sourceFile) {
                    const SRC_DIR = path.join(globalStoragePath, 'corex_src_cache');
                    const absolutePath = path.resolve(SRC_DIR, resolved.meta.sourceFile);
                    
                    if (fs.existsSync(absolutePath)) {
                        return Location.create(pathToFileURL(absolutePath).toString(), {
                            start: { line: resolved.meta.sourceLine!, character: 0 },
                            end: { line: resolved.meta.sourceLine!, character: 0 }
                        });
                    }
                }
            }
        }
        return null;
    }
});
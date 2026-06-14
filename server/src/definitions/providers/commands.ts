import { Location } from 'vscode-languageserver/node';
import { definitionRegistry } from '../DefinitionRegistry';
import { db } from '../../database';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { globalStoragePath } from '../../server';

definitionRegistry.register({
    provide: (ctx) => {
        const node = ctx.currentNode;
        if (!node) return null;

        const cmdMatch = node.text.match(/^(\s*)-\s*(~?[a-zA-Z0-9_]+)/);
        if (cmdMatch) {
            const cmdNameStart = node.text.indexOf(cmdMatch[2]);
            const cmdNameEnd = cmdNameStart + cmdMatch[2].length;
            
            if (ctx.position.character >= cmdNameStart && ctx.position.character <= cmdNameEnd) {
                const cmdMeta = db.getCommand(node.name);
                if (cmdMeta && cmdMeta.sourceFile) {
                    const SRC_DIR = path.join(globalStoragePath, 'corex_src_cache');
                    const absolutePath = path.resolve(SRC_DIR, cmdMeta.sourceFile);
                    if (fs.existsSync(absolutePath)) {
                        return Location.create(pathToFileURL(absolutePath).toString(), {
                            start: { line: cmdMeta.sourceLine!, character: 0 },
                            end: { line: cmdMeta.sourceLine!, character: 0 }
                        });
                    }
                }
            }
        }
        return null;
    }
});
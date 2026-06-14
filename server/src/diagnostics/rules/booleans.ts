import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { diagnosticRegistry } from '../DiagnosticRegistry';
import { resolveTagType } from '../../utils';
import { db } from '../../database';

diagnosticRegistry.register({
    checkNode: (node, ctx) => {
        const diagnostics = [];
        
        const boolRegex = /(<[^>]+>)\s*==\s*(true|false)\b/gi;
        let bMatch;
        while ((bMatch = boolRegex.exec(node.text)) !== null) {
            const innerTag = bMatch[1].substring(1, bMatch[1].length - 1);
            const tagType = resolveTagType(innerTag, ctx.ast, node.container, db);
            
            if (tagType === 'BooleanTag') {
                const startPos = ctx.doc.positionAt(ctx.doc.offsetAt({ line: node.line, character: 0 }) + bMatch.index);
                const endPos = ctx.doc.positionAt(ctx.doc.offsetAt({ line: node.line, character: 0 }) + bMatch.index + bMatch[0].length);
                
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: { start: startPos, end: endPos },
                    message: `' == ${bMatch[2]}' can be simplified.`,
                    source: "Corex LSP",
                    code: "simplify-bool",
                    data: { boolVal: bMatch[2], originalTag: bMatch[1] }
                });
            }
        }
        
        return diagnostics;
    }
});
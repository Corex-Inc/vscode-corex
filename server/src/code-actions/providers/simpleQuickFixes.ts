import { CodeAction, CodeActionKind, TextEdit } from 'vscode-languageserver/node';
import { codeActionRegistry } from '../CodeActionRegistry';

codeActionRegistry.register({
    provide: (ctx) => {
        const actions: CodeAction[] = [];
        const uri = ctx.doc.uri;

        for (const diag of ctx.getDiagnostics('unused-variable')) {
            actions.push({
                title: 'Remove unused variable',
                kind: CodeActionKind.QuickFix,
                diagnostics: [diag],
                edit: { changes: { [uri]: [ TextEdit.del({ start: { line: diag.data.line, character: 0 }, end: { line: diag.data.line + 1, character: 0 } }) ] } }
            });
        }

        for (const diag of ctx.getDiagnostics('missing-arg')) {
            actions.push({
                title: `Add missing argument brackets '[]'`,
                kind: CodeActionKind.QuickFix,
                diagnostics: [diag],
                edit: { changes: { [uri]: [ TextEdit.insert(diag.range.end, '[]') ] } }
            });
        }

        for (const diag of ctx.getDiagnostics('unexpected-arg')) {
            actions.push({
                title: `Remove unexpected argument`,
                kind: CodeActionKind.QuickFix,
                diagnostics: [diag],
                edit: { changes: { [uri]: [ TextEdit.replace(diag.range, diag.data.cleanName) ] } }
            });
        }

        for (const diag of ctx.getDiagnostics('unknown-var-type')) {
            actions.push({
                title: `Cast to specific type (.as[...])`,
                kind: CodeActionKind.QuickFix,
                diagnostics: [diag],
                edit: { changes: { [uri]: [ TextEdit.insert(ctx.doc.positionAt(diag.data.tagEndIndex), `.as[]`) ] } }
            });
        }

        for (const diag of ctx.getDiagnostics('simplify-bool')) {
            const isTrue = diag.data.boolVal === 'true';
            const tag = diag.data.originalTag;
            const replacementText = isTrue ? tag : `!${tag}`; 
            actions.push({
                title: `Simplify to '${replacementText}'`,
                kind: CodeActionKind.QuickFix,
                diagnostics: [diag],
                edit: { changes: { [uri]: [ TextEdit.replace(diag.range, replacementText) ] } }
            });
        }

        return actions;
    }
});
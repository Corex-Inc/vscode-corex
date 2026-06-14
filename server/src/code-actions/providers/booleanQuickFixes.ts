import { CodeAction, CodeActionKind, TextEdit } from 'vscode-languageserver/node';
import { codeActionRegistry } from '../CodeActionRegistry';
import { buildAlwaysTrueBlockActions, buildAlwaysFalseBlockActions } from '../utils';

codeActionRegistry.register({
    provide: (ctx) => {
        const actions: CodeAction[] = [];
        const uri = ctx.doc.uri;

        for (const diag of ctx.getDiagnostics('always-true-block')) {
            const actionsArr = buildAlwaysTrueBlockActions(ctx.doc, ctx.lines, diag.data);
            actions.push({
                title: `Unwrap 'if' block and remove unreachable 'else' branches`,
                kind: CodeActionKind.QuickFix,
                diagnostics: [diag],
                edit: { changes: { [uri]: actionsArr } }
            });
        }

        for (const diag of ctx.getDiagnostics('always-false-block')) {
            const actionsArr = buildAlwaysFalseBlockActions(ctx.doc, ctx.lines, diag.data);
            actions.push({
                title: `Remove unreachable 'if' block`,
                kind: CodeActionKind.QuickFix,
                diagnostics: [diag],
                edit: { changes: { [uri]: actionsArr } }
            });
        }

        for (const diag of ctx.getDiagnostics('simplify-bool-expr')) {
            const data = diag.data;
            const text = ctx.lines[diag.range.start.line];
            const exprText = text.substring(diag.range.start.character, diag.range.end.character);
            
            const afterMatch = text.substring(diag.range.end.character).match(/^\s*(&&|\|\|)/);
            const beforeMatch = text.substring(0, diag.range.start.character).match(/(&&|\|\|)\s*$/);

            let isAnd = false;
            let isOr = false;
            let hasOp = false;
            let opRange = { start: diag.range.start, end: diag.range.end };
            
            if (afterMatch) {
                isAnd = afterMatch[1] === '&&';
                isOr = afterMatch[1] === '||';
                opRange.end = { line: diag.range.start.line, character: diag.range.end.character + afterMatch[0].length };
                hasOp = true;
            } else if (beforeMatch) {
                isAnd = beforeMatch[1] === '&&';
                isOr = beforeMatch[1] === '||';
                opRange.start = { line: diag.range.start.line, character: diag.range.start.character - beforeMatch[0].length };
                hasOp = true;
            }

            if (hasOp) {
                if (data.finalResult === true && isAnd) {
                    actions.push({
                        title: `Remove redundant '${exprText}'`,
                        kind: CodeActionKind.QuickFix,
                        diagnostics: [diag],
                        edit: { changes: { [uri]: [ TextEdit.del(opRange) ] } }
                    });
                } else if (data.finalResult === false && isOr) {
                    actions.push({
                        title: `Remove redundant '${exprText}'`,
                        kind: CodeActionKind.QuickFix,
                        diagnostics: [diag],
                        edit: { changes: { [uri]: [ TextEdit.del(opRange) ] } }
                    });
                } else if (data.finalResult === true && isOr) {
                    const actionsArr = buildAlwaysTrueBlockActions(ctx.doc, ctx.lines, data);
                    actions.push({
                        title: `Evaluate as true (remove condition and unwrap 'if' block)`,
                        kind: CodeActionKind.QuickFix,
                        diagnostics: [diag],
                        edit: { changes: { [uri]: actionsArr } },
                        isPreferred: true
                    });
                    actions.push({
                        title: `Remove redundant '${exprText}'`,
                        kind: CodeActionKind.QuickFix,
                        diagnostics: [diag],
                        edit: { changes: { [uri]: [ TextEdit.del(opRange) ] } }
                    });
                } else if (data.finalResult === false && isAnd) {
                    const actionsArr = buildAlwaysFalseBlockActions(ctx.doc, ctx.lines, data);
                    actions.push({
                        title: `Evaluate as false (remove unreachable 'if' block)`,
                        kind: CodeActionKind.QuickFix,
                        diagnostics: [diag],
                        edit: { changes: { [uri]: actionsArr } },
                        isPreferred: true
                    });
                    actions.push({
                        title: `Remove redundant '${exprText}'`,
                        kind: CodeActionKind.QuickFix,
                        diagnostics: [diag],
                        edit: { changes: { [uri]: [ TextEdit.del(opRange) ] } }
                    });
                }
            }
        }

        return actions;
    }
});
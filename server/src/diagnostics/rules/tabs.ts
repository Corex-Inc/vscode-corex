import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { diagnosticRegistry } from '../DiagnosticRegistry';

diagnosticRegistry.register({
    checkDocument: (ctx) => {
        const diagnostics = [];
        for (let i = 0; i < ctx.lines.length; i++) {
            if (ctx.lines[i].includes('\t')) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: i, character: 0 }, end: { line: i, character: ctx.lines[i].length } },
                    message: "Tabs are not allowed! Use spaces for indentation.",
                    source: "Corex LSP"
                });
            }
        }
        return diagnostics;
    }
});
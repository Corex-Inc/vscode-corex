import { DiagnosticSeverity, DiagnosticTag } from 'vscode-languageserver/node';
import { diagnosticRegistry } from '../DiagnosticRegistry';

diagnosticRegistry.register({
    finalize: (ctx) => {
        const diagnostics = [];
        
        for (const [cont, scope] of ctx.scopes) {
            for (const [name, defData] of scope.definedVars) {
                if (!scope.usedVars.has(name) && !defData.isImplicit) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Hint,
                        tags: [DiagnosticTag.Unnecessary],
                        range: { 
                            start: { line: defData.line, character: defData.startChar }, 
                            end: { line: defData.line, character: defData.endChar } 
                        },
                        message: `Variable '${name}' is never used.`,
                        code: "unused-variable",
                        data: { line: defData.line }
                    });
                }
            }
        }
        return diagnostics;
    }
});
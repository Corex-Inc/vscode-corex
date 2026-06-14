import { Diagnostic } from 'vscode-languageserver/node';
import { DiagnosticContext } from './DiagnosticContext';

export interface DiagnosticRule {
    checkDocument?: (ctx: DiagnosticContext) => Diagnostic[];
    checkNode?: (node: any, ctx: DiagnosticContext) => Diagnostic[];
    finalize?: (ctx: DiagnosticContext) => Diagnostic[];
}

class Registry {
    private rules: DiagnosticRule[] = [];

    public register(rule: DiagnosticRule) {
        this.rules.push(rule);
    }

    public run(ctx: DiagnosticContext): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];

        for (const rule of this.rules) {
            if (rule.checkDocument) {
                diagnostics.push(...rule.checkDocument(ctx));
            }
        }

        for (const node of ctx.ast) {
            for (const rule of this.rules) {
                if (rule.checkNode) {
                    diagnostics.push(...rule.checkNode(node, ctx));
                }
            }
        }

        for (const rule of this.rules) {
            if (rule.finalize) {
                diagnostics.push(...rule.finalize(ctx));
            }
        }

        return diagnostics;
    }
}

export const diagnosticRegistry = new Registry();
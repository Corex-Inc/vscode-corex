import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { diagnosticRegistry } from '../DiagnosticRegistry';
import { db } from '../../database';
import { splitCommandArgs } from '../../services/commands';

diagnosticRegistry.register({
    checkNode: (node, ctx) => {
        const diagnostics = [];
        if (node.name === 'on' || node.name === 'after' || !node.text.trim().startsWith('-')) {
            return [];
        }

        const cmdMeta = db.getCommand(node.name);
        if (cmdMeta) {
            let textNoComment = node.text.split('//')[0].split('#')[0].trimEnd();
            if (textNoComment.endsWith(':')) textNoComment = textNoComment.slice(0, -1).trimEnd();

            const args = splitCommandArgs(textNoComment);
            const providedCount = Math.max(0, args.length - 1);
            
            if (cmdMeta.requiredArgs !== undefined && cmdMeta.requiredArgs !== -1 && providedCount < cmdMeta.requiredArgs) {
                const match = node.text.match(new RegExp(`-\\s*~?${node.name}`, 'i'));
                const startChar = match ? match.index! + match[0].length - node.name.length : 0;
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: node.line, character: startChar }, end: { line: node.line, character: startChar + node.name.length } },
                    message: `Command '${node.name}' requires at least ${cmdMeta.requiredArgs} argument(s), but got ${providedCount}.`,
                    source: "Corex LSP"
                });
            }
        } else {
            if (node.name !== 'case' && node.name !== 'default' && node.name !== 'else') {
                const match = node.text.match(new RegExp(`-\\s*~?${node.name}`, 'i'));
                const startChar = match ? match.index! + match[0].length - node.name.length : 0;
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: node.line, character: startChar }, end: { line: node.line, character: startChar + node.name.length } },
                    message: `Unknown command '${node.name}'.`,
                    source: "Corex LSP"
                });
            }
        }
        return diagnostics;
    }
});
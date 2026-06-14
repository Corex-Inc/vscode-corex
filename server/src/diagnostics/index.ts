import { Diagnostic } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { diagnosticRegistry } from './DiagnosticRegistry';
import { DiagnosticContext } from './DiagnosticContext';

import './rules/tabs';
import './rules/commands';
import './rules/events';
import './rules/ifs';
import './rules/booleans';
import './rules/tags';
import './rules/unusedVars';

export function getDiagnostics(doc: TextDocument): Diagnostic[] {
    const ctx = new DiagnosticContext(doc);

    return diagnosticRegistry.run(ctx);
}
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { diagnosticRegistry } from '../DiagnosticRegistry';
import { eventRegistry } from '../../services/events';

diagnosticRegistry.register({
    checkNode: (node, ctx) => {
        const diagnostics = [];

        if (node.name === 'on' || node.name === 'after') {
            const evMatch = node.text.match(/^(\s*)(on|after)\s+(.+?):\s*(?:#.*|\/\/.*)?$/i);
            if (evMatch) {
                const eventLine = evMatch[3].trim();
                const resolved = eventRegistry.resolveEvent(eventLine);
                
                if (!resolved) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range: { start: { line: node.line, character: evMatch[1].length }, end: { line: node.line, character: node.text.length } },
                        message: `Event not found: '${eventLine}'`,
                        source: "Corex LSP"
                    });
                } else {
                    for (const sw of resolved.switches) {
                        const swIdx = node.text.indexOf(sw);
                        const colonIdx = sw.indexOf(':');

                        if (colonIdx === -1) {
                            diagnostics.push({
                                severity: DiagnosticSeverity.Error,
                                range: { start: { line: node.line, character: swIdx }, end: { line: node.line, character: swIdx + sw.length } },
                                message: `Invalid switch or trailing word: '${sw}'. Switches must be formatted as 'name:value'.`,
                                source: "Corex LSP"
                            });
                        } else if (sw.endsWith(':')) {
                            diagnostics.push({
                                severity: DiagnosticSeverity.Error,
                                range: { start: { line: node.line, character: swIdx }, end: { line: node.line, character: swIdx + sw.length } },
                                message: `Empty switch: '${sw}'. You must provide a value.`,
                                source: "Corex LSP"
                            });
                        } else {
                            const swName = sw.split(':')[0];
                            const isValid = resolved.meta.parsedSwitches?.some((s: any) => s.name === swName);
                            if (!isValid) {
                                diagnostics.push({
                                    severity: DiagnosticSeverity.Error,
                                    range: { start: { line: node.line, character: swIdx }, end: { line: node.line, character: swIdx + sw.length } },
                                    message: `Unknown switch '${swName}' for this event.`,
                                    source: "Corex LSP"
                                });
                            }
                        }
                    }
                }
            }
        }
        
        return diagnostics;
    }
});
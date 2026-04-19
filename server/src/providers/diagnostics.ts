import { Diagnostic, DiagnosticSeverity, DiagnosticTag } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseAST } from '../ast';
import { db } from '../database';
import { resolveTagType, splitTagChain, stripArgs } from '../utils';
import { eventRegistry } from './events';

class ContainerState {
    definedVars = new Map<string, { line: number, startChar: number, endChar: number, isImplicit: boolean, source: 'def' | 'loop' | 'definition' }>(); 
    varValues = new Map<string, string>();
    usedVars = new Set<string>();
}

export function getDiagnostics(doc: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] =[];
    const lines = doc.getText().split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('\t')) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: { start: { line: i, character: 0 }, end: { line: i, character: lines[i].length } },
                message: "Tabs are not allowed! Use spaces for indentation.",
                source: "Corex LSP"
            });
        }
    }

    const ast = parseAST(doc);
    const scopes = new Map<string, ContainerState>();

    let currentRoot = "global";
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const rootMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(?:#.*|\/\/.*)?$/);
        if (rootMatch) {
            currentRoot = rootMatch[1];
            if (!scopes.has(currentRoot)) scopes.set(currentRoot, new ContainerState());
        }

        const defsMatch = line.match(/^\s*definitions:\s*(.+)/i);
        if (defsMatch && scopes.has(currentRoot)) {
            const scope = scopes.get(currentRoot)!;
            const vars = defsMatch[1].split('|').map(v => v.trim().replace(/[\[\]]/g, ''));
            for (const v of vars) {
                if (v) {
                    const startChar = line.indexOf(v);
                    scope.definedVars.set(v, { line: i, startChar, endChar: startChar + v.length, isImplicit: false, source: 'definition' });
                }
            }
        }
    }

    for (const node of ast) {
        if (!scopes.has(node.container)) scopes.set(node.container, new ContainerState());
        const scope = scopes.get(node.container)!;

        const defMatch = node.text.match(/(?:def|define)\s+([a-zA-Z0-9_]+)\s*(.*)/i);
        if (defMatch) {
            const varName = defMatch[1];
            let val = defMatch[2] ? defMatch[2].trim() : '';

            if (val.includes('true')) val = 'true';
            else if (val.includes('false')) val = 'false';
            
            scope.varValues.set(varName, val);
            
            const startChar = defMatch.index! + defMatch[0].lastIndexOf(varName);
            scope.definedVars.set(varName, { line: node.line, startChar, endChar: startChar + varName.length, isImplicit: false, source: 'def' });
        }

        const asMatch = node.text.match(/\bas:([a-zA-Z0-9_]+)\b/i);
        if (asMatch) {
            const varName = asMatch[1];
            const startChar = asMatch.index! + 3; 
            scope.definedVars.set(varName, { line: node.line, startChar, endChar: startChar + varName.length, isImplicit: false, source: 'loop' });
        }

        for (const def of node.definitionsProvided) {
            if (!scope.definedVars.has(def)) {
                scope.definedVars.set(def, { line: node.line, startChar: 0, endChar: 0, isImplicit: true, source: 'loop' });
            }
        }
    }

    for (const node of ast) {
        const scope = scopes.get(node.container)!;

        if (node.name === 'if') {
            const ifPrefixMatch = node.text.match(/-\s*if\s+/i);
            if (ifPrefixMatch) {
                const prefixIndex = ifPrefixMatch.index! + ifPrefixMatch[0].length;
                const conditionBody = node.text.substring(prefixIndex).replace(/\s*:\s*$/, '').trim();

                const elseBlocks =[];
                let currIdx = node.endNodeIndex + 1;
                while (currIdx < ast.length) {
                    const nextNode = ast[currIdx];
                    if (nextNode.indent === node.indent && nextNode.path === node.path && nextNode.name === 'else') {
                        const isElseIf = nextNode.text.match(/^\s*-\s*else\s+if/i);
                        elseBlocks.push({
                            type: isElseIf ? 'else if' : 'else',
                            line: nextNode.line,
                            endLine: nextNode.endLine
                        });
                        currIdx = nextNode.endNodeIndex + 1;
                    } else {
                        break;
                    }
                }

                for (const tag of node.tagsUsed) {
                    if (tag.text.startsWith('[') && tag.text.includes(']')) {
                        const varName = tag.text.substring(1, tag.text.indexOf(']'));
                        const knownVal = scope.varValues.get(varName);

                        if (knownVal === 'true' || knownVal === 'false') {
                            const tagStartInLine = tag.start - doc.offsetAt({ line: node.line, character: 0 });
                            const textBeforeTag = node.text.substring(0, tagStartInLine).trim();
                            const isNegated = textBeforeTag.endsWith('!');

                            let finalResult = knownVal === 'true';
                            if (isNegated) finalResult = !finalResult;

                            const cleanCond = conditionBody.replace(/\s+/g, '');
                            const cleanTag = ((isNegated ? '!' : '') + `<${tag.text}>`).replace(/\s+/g, '');

                            if (cleanCond === cleanTag) {
                                diagnostics.push({
                                    severity: DiagnosticSeverity.Warning,
                                    range: { start: { line: node.line, character: 0 }, end: { line: node.line, character: node.text.length } },
                                    message: `Condition is always '${finalResult}'.`,
                                    source: "Corex LSP",
                                    code: finalResult ? "always-true-block" : '',
                                    data: { ifLine: node.line, ifEndLine: node.endLine, ifIndent: node.indent, elseBlocks }
                                });
                            }
                        }
                    }
                }
            }
        }

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
                            const isValid = resolved.meta.parsedSwitches?.some(s => s.name === swName);
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

        const boolRegex = /(<[^>]+>)\s*==\s*(true|false)\b/gi;
        let bMatch;
        while ((bMatch = boolRegex.exec(node.text)) !== null) {
            const startPos = doc.positionAt(doc.offsetAt({ line: node.line, character: 0 }) + bMatch.index);
            const endPos = doc.positionAt(doc.offsetAt({ line: node.line, character: 0 }) + bMatch.index + bMatch[0].length);
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: { start: startPos, end: endPos },
                message: `' == ${bMatch[2]}' can be simplified.`,
                source: "Corex LSP",
                code: "simplify-bool",
                data: { boolVal: bMatch[2], originalTag: bMatch[1] }
            });
        }

        for (const tag of node.tagsUsed) {
            const tagContent = tag.text;
            const parts = splitTagChain(tagContent);
            let currentType = 'ObjectTag';
            let currentLocalOffset = 0;

            if (parts[0].startsWith('[')) {
                const varName = parts[0].substring(1, parts[0].indexOf(']'));
                scope.usedVars.add(varName);

                const varInfo = scope.definedVars.get(varName);

                if (!varInfo) {
                    const varPartEnd = tag.start + parts[0].length;
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error, 
                        range: { start: doc.positionAt(tag.start), end: doc.positionAt(varPartEnd) },
                        message: `Undefined variable '${varName}'.`,
                        source: "Corex LSP"
                    });
                } else {
                    const hasCast = tagContent.match(/\.as\[.*?\]/i);
                    const currentTypeForVar = resolveTagType(tagContent, ast, node.container, db, 0);

                    if (currentTypeForVar === 'ObjectTag' && !hasCast) {
                        const varPartEnd = tag.start + parts[0].length;
                        
                        if (varInfo.source === 'definition') {
                            diagnostics.push({
                                severity: DiagnosticSeverity.Warning,
                                range: { start: doc.positionAt(tag.start), end: doc.positionAt(varPartEnd) },
                                message: `Type of injected variable '${varName}' is unknown. Consider casting it using .as[type].`,
                                source: "Corex LSP",
                                code: "unknown-var-type",
                                data: { tagEndIndex: varPartEnd } 
                            });
                        } else {
                            diagnostics.push({
                                severity: DiagnosticSeverity.Error,
                                range: { start: doc.positionAt(tag.start), end: doc.positionAt(varPartEnd) },
                                message: `Type of '${varName}' cannot be resolved. You must cast it using .as[type].`,
                                source: "Corex LSP",
                                code: "unknown-var-type",
                                data: { tagEndIndex: varPartEnd } 
                            });
                        }
                    }
                }
            } else {
                const baseClean = stripArgs(parts[0]).split('||')[0].toLowerCase();
                let isValidBase = false;

                const fmt = db.formatters.find(f => f.name.toLowerCase() === baseClean);
                if (fmt) {
                    currentType = (fmt.returnType || 'ElementTag').replace(/\(.*?\)/g, '').trim();
                    isValidBase = true;
                } else if (db.objectDocs.has(baseClean + 'tag')) {
                    currentType = (baseClean.charAt(0).toUpperCase() + baseClean.slice(1) + 'Tag').replace(/\(.*?\)/g, '').trim();
                    isValidBase = true;
                }

                if (!isValidBase) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range: { start: doc.positionAt(tag.start), end: doc.positionAt(tag.start + parts[0].length) },
                        message: `Unknown base tag or formatter '${baseClean}'`,
                        source: "Corex LSP"
                    });
                }
            }

            for (let j = 0; j < parts.length; j++) {
                const part = parts[j];
                const cleanPartName = stripArgs(part).toLowerCase();
                const hasBrackets = part.includes('[');
                const partRange = {
                    start: doc.positionAt(tag.start + currentLocalOffset),
                    end: doc.positionAt(tag.start + currentLocalOffset + part.length)
                };

                const currentType = resolveTagType(tagContent, ast, node.container, db, j);

                if (j === 0) {
                    if (!parts[0].startsWith('[')) {
                        let targetMeta = db.formatters.find(f => f.name.toLowerCase() === cleanPartName);
                        if (!targetMeta) {
                            const baseTagType = cleanPartName.charAt(0).toUpperCase() + cleanPartName.slice(1) + 'Tag';
                            targetMeta = db.objectDocs.get(baseTagType);
                        }
                        
                        if (targetMeta) {
                            const isReq = targetMeta.reqArg === 'all' || (Array.isArray(targetMeta.reqArg) && targetMeta.reqArg.includes(1));
                            const isNo = targetMeta.noArg === 'all' || (Array.isArray(targetMeta.noArg) && targetMeta.noArg.includes(1));

                            if (isReq && !hasBrackets) {
                                diagnostics.push({ severity: DiagnosticSeverity.Error, range: partRange, message: `Tag '${targetMeta.name}' requires an argument.`, source: "Corex LSP", code: "missing-arg" });
                            } else if (isNo && hasBrackets) {
                                diagnostics.push({ severity: DiagnosticSeverity.Error, range: partRange, message: `Tag '${targetMeta.name}' does not take an argument.`, source: "Corex LSP", code: "unexpected-arg", data: { cleanName: cleanPartName } });
                            }
                        }
                    }
                } else {
                    let targetProps = db.getProperties(currentType) || [];
                    if (currentType === 'ObjectTag') {
                        for (const base of db.baseObjects) {
                            const tName = base.charAt(0).toUpperCase() + base.slice(1) + 'Tag';
                            targetProps = targetProps.concat(db.getProperties(tName) ||[]);
                        }
                    }
                    
                    const targetMeta = targetProps.find(m => m.name.toLowerCase() === cleanPartName);

                    if (targetMeta) {
                        const isReq = targetMeta.reqArg === 'all' || (Array.isArray(targetMeta.reqArg) && targetMeta.reqArg.includes(j + 1));
                        const isNo = targetMeta.noArg === 'all' || (Array.isArray(targetMeta.noArg) && targetMeta.noArg.includes(j + 1));

                        if (isReq && !hasBrackets) {
                            diagnostics.push({
                                severity: DiagnosticSeverity.Error,
                                range: partRange,
                                message: `Property '${targetMeta.originalName || targetMeta.name}' requires an argument.`,
                                source: "Corex LSP",
                                code: "missing-arg"
                            });
                        } else if (isNo && hasBrackets) {
                            diagnostics.push({
                                severity: DiagnosticSeverity.Error,
                                range: partRange,
                                message: `Property '${targetMeta.originalName || targetMeta.name}' does not take an argument.`,
                                source: "Corex LSP",
                                code: "unexpected-arg",
                                data: { cleanName: cleanPartName }
                            });
                        }
                    }
                }
                currentLocalOffset += part.length + 1;
            }
        }
    }

    for (const [cont, scope] of scopes) {
        for (const[name, defData] of scope.definedVars) {
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
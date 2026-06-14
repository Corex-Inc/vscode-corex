import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { diagnosticRegistry } from '../DiagnosticRegistry';
import { splitTagChain, resolveTagType, stripArgs } from '../../utils';
import { db } from '../../database';

diagnosticRegistry.register({
    checkNode: (node, ctx) => {
        const diagnostics = [];
        const scope = ctx.getScope(node.container);

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
                        range: { start: ctx.doc.positionAt(tag.start), end: ctx.doc.positionAt(varPartEnd) },
                        message: `Undefined variable '${varName}'.`,
                        source: "Corex LSP"
                    });
                } else {
                    const hasCast = tagContent.match(/\.as\[.*?\]/i);
                    const currentTypeForVar = resolveTagType(tagContent, ctx.ast, node.container, db, 0);

                    if (currentTypeForVar === 'ObjectTag' && !hasCast) {
                        const varPartEnd = tag.start + parts[0].length;
                        
                        if (varInfo.source === 'definition') {
                            diagnostics.push({
                                severity: DiagnosticSeverity.Warning,
                                range: { start: ctx.doc.positionAt(tag.start), end: ctx.doc.positionAt(varPartEnd) },
                                message: `Type of injected variable '${varName}' is unknown. Consider casting it using .as[type].`,
                                source: "Corex LSP",
                                code: "unknown-var-type",
                                data: { tagEndIndex: varPartEnd } 
                            });
                        } else {
                            diagnostics.push({
                                severity: DiagnosticSeverity.Error,
                                range: { start: ctx.doc.positionAt(tag.start), end: ctx.doc.positionAt(varPartEnd) },
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
                        range: { start: ctx.doc.positionAt(tag.start), end: ctx.doc.positionAt(tag.start + parts[0].length) },
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
                    start: ctx.doc.positionAt(tag.start + currentLocalOffset),
                    end: ctx.doc.positionAt(tag.start + currentLocalOffset + part.length)
                };

                currentType = resolveTagType(tagContent, ctx.ast, node.container, db, j);

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
                            targetProps = targetProps.concat(db.getProperties(tName) || []);
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
        
        return diagnostics;
    }
});
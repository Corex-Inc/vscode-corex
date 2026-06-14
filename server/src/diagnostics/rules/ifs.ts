import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { diagnosticRegistry } from '../DiagnosticRegistry';

diagnosticRegistry.register({
    checkNode: (node, ctx) => {
        const diagnostics = [];
        const scope = ctx.getScope(node.container);

        if (node.name === 'if') {
            const ifPrefixMatch = node.text.match(/-\s*if\s+/i);
            if (ifPrefixMatch) {
                const prefixIndex = ifPrefixMatch.index! + ifPrefixMatch[0].length;
                const conditionBody = node.text.substring(prefixIndex).replace(/\s*:\s*$/, '').trim();

                const elseBlocks = [];
                let currIdx = node.endNodeIndex + 1;
                while (currIdx < ctx.ast.length) {
                    const nextNode = ctx.ast[currIdx];
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
                    if (tag.text.startsWith('[') && tag.text.indexOf(']') === tag.text.length - 1) {
                        const varName = tag.text.substring(1, tag.text.length - 1);
                        const knownVal = scope.varValues.get(varName);

                        if (knownVal === 'true' || knownVal === 'false') {
                            const tagStartInLine = tag.start - ctx.doc.offsetAt({ line: node.line, character: 0 });
                            const tagStartInCond = tagStartInLine - prefixIndex;
                            const tagLeftBracketInCond = tagStartInCond - 1;
                            const tagRightBracketInCond = tagStartInCond + tag.text.length;
                            
                            const prefixStr = conditionBody.substring(0, tagLeftBracketInCond);
                            const suffixStr = conditionBody.substring(tagRightBracketInCond + 1);

                            const matchPrefix = prefixStr.match(/(?:^|&&|\|\||\()\s*(?:!\s*|not\s+)?$/i);
                            const matchSuffix = suffixStr.match(/^\s*(?:&&|\|\||\)|$)/i);

                            if (matchPrefix && matchSuffix) {
                                const isNegatedMatch = prefixStr.match(/(?:!\s*|not\s+)$/i);
                                const isNegated = isNegatedMatch !== null;
                                const negatorStr = isNegated ? isNegatedMatch[0] : '';

                                let finalResult = knownVal === 'true';
                                if (isNegated) finalResult = !finalResult;

                                const isWholeCond = prefixStr.match(/^\s*(?:!\s*|not\s+)?$/i) !== null && suffixStr.match(/^\s*$/) !== null;

                                if (isWholeCond) {
                                    diagnostics.push({
                                        severity: DiagnosticSeverity.Warning,
                                        range: { start: { line: node.line, character: 0 }, end: { line: node.line, character: node.text.length } },
                                        message: `Condition is always '${finalResult}'.`,
                                        source: "Corex LSP",
                                        code: finalResult ? "always-true-block" : "always-false-block",
                                        data: { ifLine: node.line, ifEndLine: node.endLine, ifIndent: node.indent, elseBlocks }
                                    });
                                } else {
                                    const fullTagStr = negatorStr.trim() ? `${negatorStr.trim()}<${tag.text}>` : `<${tag.text}>`;
                                    const startChar = (tagStartInLine - 1) - negatorStr.length;
                                    const endChar = tagStartInLine + tag.text.length + 1;
                                    
                                    diagnostics.push({
                                        severity: DiagnosticSeverity.Warning,
                                        range: { start: { line: node.line, character: startChar }, end: { line: node.line, character: endChar } },
                                        message: `Expression '${fullTagStr}' is always '${finalResult}'.`,
                                        source: "Corex LSP",
                                        code: "simplify-bool-expr",
                                        data: { 
                                            finalResult, 
                                            originalText: conditionBody,
                                            ifLine: node.line, 
                                            ifEndLine: node.endLine, 
                                            ifIndent: node.indent, 
                                            elseBlocks 
                                        }
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        return diagnostics;
    }
});
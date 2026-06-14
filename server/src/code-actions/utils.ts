import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextEdit } from 'vscode-languageserver/node';

export function buildAlwaysTrueBlockActions(doc: TextDocument, docLines: string[], data: any): TextEdit[] {
    const actionsArr = [];
    actionsArr.push(TextEdit.del({
        start: { line: data.ifLine, character: 0 },
        end: { line: Math.min(doc.lineCount, data.ifLine + 1), character: 0 }
    }));
    for (let i = data.ifLine + 1; i <= data.ifEndLine; i++) {
        if (i >= docLines.length) break;
        const lineText = docLines[i];
        const indentMatch = lineText.match(/^(\s*)/);
        if (indentMatch && indentMatch[1].length > data.ifIndent) {
            const toRemove = Math.min(4, indentMatch[1].length - data.ifIndent);
            if (toRemove > 0) {
                actionsArr.push(TextEdit.del({
                    start: { line: i, character: 0 },
                    end: { line: i, character: toRemove }
                }));
            }
        }
    }
    if (data.elseBlocks && data.elseBlocks.length > 0) {
        const lastElse = data.elseBlocks[data.elseBlocks.length - 1];
        let endL = lastElse.endLine + 1;
        let endChar = 0;
        if (endL >= doc.lineCount) {
            endL = doc.lineCount - 1;
            endChar = docLines[endL].length;
        }
        actionsArr.push(TextEdit.del({
            start: { line: data.ifEndLine + 1, character: 0 },
            end: { line: endL, character: endChar }
        }));
    }
    return actionsArr;
}

export function buildAlwaysFalseBlockActions(doc: TextDocument, docLines: string[], data: any): TextEdit[] {
    const actionsArr = [];
    if (data.elseBlocks && data.elseBlocks.length > 0) {
        const firstElse = data.elseBlocks[0];
        actionsArr.push(TextEdit.del({
            start: { line: data.ifLine, character: 0 },
            end: { line: Math.min(doc.lineCount, data.ifEndLine + 1), character: 0 }
        }));
        if (firstElse.type === 'else if') {
            const elseIfLineText = docLines[firstElse.line];
            const match = elseIfLineText.match(/^(\s*-\s*)else\s+if/i);
            if (match) {
                actionsArr.push(TextEdit.replace({
                    start: { line: firstElse.line, character: 0 },
                    end: { line: firstElse.line, character: match[0].length }
                }, `${match[1]}if`));
            }
        } else if (firstElse.type === 'else') {
            actionsArr.push(TextEdit.del({
                start: { line: firstElse.line, character: 0 },
                end: { line: Math.min(doc.lineCount, firstElse.line + 1), character: 0 }
            }));
            for (let i = firstElse.line + 1; i <= firstElse.endLine; i++) {
                if (i >= docLines.length) break;
                const lineText = docLines[i];
                const indentMatch = lineText.match(/^(\s*)/);
                if (indentMatch && indentMatch[1].length > data.ifIndent) {
                    const toRemove = Math.min(4, indentMatch[1].length - data.ifIndent);
                    if (toRemove > 0) {
                        actionsArr.push(TextEdit.del({
                            start: { line: i, character: 0 },
                            end: { line: i, character: toRemove }
                        }));
                    }
                }
            }
        }
    } else {
        let endL = data.ifEndLine + 1;
        let endChar = 0;
        if (endL >= doc.lineCount) {
            endL = doc.lineCount - 1;
            endChar = docLines[endL].length;
        }
        actionsArr.push(TextEdit.del({
            start: { line: data.ifLine, character: 0 },
            end: { line: endL, character: endChar }
        }));
    }
    return actionsArr;
}
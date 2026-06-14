import { CodeAction, CodeActionKind, TextEdit } from 'vscode-languageserver/node';
import { codeActionRegistry } from '../CodeActionRegistry';
import { extractAllTagsGlobal } from '../../ast';

codeActionRegistry.register({
    provide: (ctx) => {
        const actions: CodeAction[] = [];
        const { doc, params, ast, lines } = ctx;
        const uri = doc.uri;
        const range = params.range;
        const offsetStart = doc.offsetAt(range.start);
        const offsetEnd = doc.offsetAt(range.end);

        let targetTag: { text: string, start: number, end: number } | null = null;
        const allTags = extractAllTagsGlobal(doc.getText());
        
        const overlappingTags = allTags.filter((t: any) => t.start <= offsetEnd && t.end >= offsetStart);
        if (overlappingTags.length > 0) {
            overlappingTags.sort((a: any, b: any) => (a.end - a.start) - (b.end - b.start));
            targetTag = overlappingTags[0];
        }

        if (targetTag) {
            const cleanTag = `<${targetTag.text}>`;
            const newVarName = "myRefactoredDef";
            
            const startPos = doc.positionAt(targetTag.start - 1);
            const endPos = doc.positionAt(targetTag.end + 1);
            
            const lineText = doc.getText({ start: { line: startPos.line, character: 0 }, end: { line: startPos.line + 1, character: 0 } });
            const indentMatch = lineText.match(/^(\s*)/);
            const indent = indentMatch ? indentMatch[1] : "";

            actions.push({
                title: `Extract tag to variable '${newVarName}'`,
                kind: CodeActionKind.RefactorExtract,
                edit: {
                    changes: { [uri]: [
                        TextEdit.insert({ line: startPos.line, character: 0 }, `${indent}- def ${newVarName} ${cleanTag}\n`),
                        TextEdit.replace({ start: startPos, end: endPos }, `<[${newVarName}]>`)
                    ]}
                }
            });
        }

        const startLine = range.start.line;
        const endLine = range.end.line;
        
        const startNode = ast.find(n => n.line === startLine);
        if (startNode && startNode.container) {
            const currentContainer = startNode.container;

            const definedBefore = new Set<string>();
            const definedInside = new Set<string>();
            const usedInside = new Set<string>();

            for (const n of ast) {
                if (n.container !== currentContainer) continue;

                if (n.line < startLine) {
                    n.definitionsProvided.forEach((v: string) => definedBefore.add(v));
                } else if (n.line >= startLine && n.line <= endLine) {
                    n.definitionsProvided.forEach((v: string) => definedInside.add(v));
                    
                    for (const t of n.tagsUsed) {
                        if (t.text.startsWith('[') && t.text.includes(']')) {
                            const varName = t.text.substring(1, t.text.indexOf(']'));
                            if (!definedInside.has(varName)) {
                                usedInside.add(varName);
                            }
                        }
                    }
                }
            }

            const requiredVars = [...usedInside].filter(v => definedBefore.has(v));
            
            const linesToExtract = lines.slice(startLine, endLine + 1);
            
            const firstLineIndentMatch = linesToExtract[0].match(/^(\s*)/);
            const baseIndentLevel = firstLineIndentMatch ? firstLineIndentMatch[1].length : 0;
            const baseIndentString = firstLineIndentMatch ? firstLineIndentMatch[1] : "";
            
            const newIndent = "        ";
            const indentedBlock = linesToExtract.map(line => {
                if (line.trim() === "") return "";
                const currentIndentMatch = line.match(/^(\s*)/);
                const currentIndent = currentIndentMatch ? currentIndentMatch[1].length : 0;
                const relativeIndent = currentIndent >= baseIndentLevel ? currentIndent - baseIndentLevel : 0;
                return newIndent + " ".repeat(relativeIndent) + line.trimStart();
            }).join('\n');

            const definitionsLine = requiredVars.length > 0 ? `\n    definitions: ${requiredVars.join('|')}` : '';
            const runArgs = requiredVars.map(v => `def.${v}:<[${v}]>`).join(' ');
            const runCmd = `${baseIndentString}- ~run myRefactorTask${runArgs ? ' ' + runArgs : ''}\n`;
            
            const newTask = `\n\nmyRefactorTask:\n    type: task\n    private: true${definitionsLine}\n    script:\n${indentedBlock}\n`;

            let replaceEndLine = endLine + 1;
            let replaceEndChar = 0;
            if (replaceEndLine >= doc.lineCount) {
                replaceEndLine = doc.lineCount - 1;
                replaceEndChar = doc.getText().length; 
            }

            actions.push({
                title: `Extract selected lines to new Task`,
                kind: CodeActionKind.RefactorExtract,
                edit: {
                    changes: {
                        [uri]: [
                            TextEdit.replace(
                                { start: { line: startLine, character: 0 }, end: { line: replaceEndLine, character: replaceEndChar } },
                                runCmd
                            ),
                            TextEdit.insert(
                                doc.positionAt(doc.getText().length),
                                newTask
                            )
                        ]
                    }
                }
            });
        }

        return actions;
    }
});
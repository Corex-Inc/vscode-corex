import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseAST } from '../ast';

export class ContainerState {
    definedVars = new Map<string, { line: number, startChar: number, endChar: number, isImplicit: boolean, source: 'def' | 'loop' | 'definition' }>(); 
    varValues = new Map<string, string>();
    usedVars = new Set<string>();
}

export class DiagnosticContext {
    public readonly doc: TextDocument;
    public readonly lines: string[];
    public readonly ast: any[];
    public readonly scopes = new Map<string, ContainerState>();

    constructor(doc: TextDocument) {
        this.doc = doc;
        this.lines = doc.getText().split('\n');
        this.ast = parseAST(doc);
        this.buildScopes();
    }

    public getScope(containerName: string): ContainerState {
        if (!this.scopes.has(containerName)) {
            this.scopes.set(containerName, new ContainerState());
        }
        return this.scopes.get(containerName)!;
    }

    private buildScopes() {
        let currentRoot = "global";
        
        for (let i = 0; i < this.lines.length; i++) {
            const line = this.lines[i];
            const rootMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(?:#.*|\/\/.*)?$/);
            if (rootMatch) {
                currentRoot = rootMatch[1];
                this.getScope(currentRoot);
            }

            const defsMatch = line.match(/^\s*definitions:\s*(.+)/i);
            if (defsMatch) {
                const scope = this.getScope(currentRoot);
                const vars = defsMatch[1].split('|').map(v => v.trim().replace(/[\[\]]/g, ''));
                for (const v of vars) {
                    if (v) {
                        const startChar = line.indexOf(v);
                        scope.definedVars.set(v, { line: i, startChar, endChar: startChar + v.length, isImplicit: false, source: 'definition' });
                    }
                }
            }
        }

        for (const node of this.ast) {
            const scope = this.getScope(node.container);

            const defMatch = node.text.match(/(?:def|define)\s+([a-zA-Z0-9_]+)\s*(.*)/i);
            if (defMatch) {
                const varName = defMatch[1];
                let val = defMatch[2] ? defMatch[2].trim() : '';

                if (val.includes('true')) val = 'true';
                else if (val.includes('false')) val = 'false';
                
                scope.varValues.set(varName, val);
                
                let startChar = defMatch.index! + defMatch[0].indexOf(varName);
                const spaceIdx = defMatch[0].search(/\s/);
                if (spaceIdx !== -1) {
                    startChar = defMatch.index! + defMatch[0].indexOf(varName, spaceIdx);
                }
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
    }
}
import { RenameParams, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseAST } from '../ast';

export class RenameContext {
    public readonly params: RenameParams;
    public readonly doc: TextDocument;
    public readonly position: Position;
    public readonly offset: number;

    private _ast?: any[];
    private _currentNode?: any | null;
    private _varNameToRename?: string | null;
    private _loopNode?: any | null;

    constructor(params: RenameParams, doc: TextDocument) {
        this.params = params;
        this.doc = doc;
        this.position = params.position;
        this.offset = doc.offsetAt(this.position);
    }

    get ast() {
        if (!this._ast) this._ast = parseAST(this.doc);
        return this._ast;
    }

    get currentNode() {
        if (this._currentNode === undefined) {
            this._currentNode = this.ast.find(n => n.line === this.position.line) || null;
        }
        return this._currentNode;
    }

    get varNameToRename(): string | null {
        if (this._varNameToRename !== undefined) return this._varNameToRename;
        this._varNameToRename = this.resolveVarName();
        return this._varNameToRename;
    }

    get loopNode() {
        const node = this.currentNode;
        const varName = this.varNameToRename;
        if (!node || !varName) return null;

        if (this._loopNode === undefined) {
            this._loopNode = this.ast
                .slice(0, this.ast.indexOf(node) + 1)
                .reverse()
                .find(n => {
                    if (!['repeat', 'foreach', 'while'].includes(n.name)) return false;
                    if (n.endNodeIndex < this.ast.indexOf(node)) return false;
                    
                    const currentAsMatch = n.text.match(/\bas:([a-zA-Z0-9_]+)\b/i);
                    const currentAsName = currentAsMatch ? currentAsMatch[1] : null;
                    
                    return varName === 'loopIndex' || 
                           varName === 'key' || 
                           varName === 'value' || 
                           varName === currentAsName;
                }) || null;
        }
        return this._loopNode;
    }

    get scopeNodes() {
        const node = this.currentNode;
        if (!node) return [];

        return this.loopNode 
            ? this.ast.slice(this.ast.indexOf(this.loopNode), this.loopNode.endNodeIndex + 1)
            : this.ast.filter(n => n.container === node.container);
    }

    private resolveVarName(): string | null {
        const node = this.currentNode;
        if (!node) return null;

        for (const tag of node.tagsUsed) {
            if (this.offset >= tag.start && this.offset <= tag.end) {
                if (tag.text.startsWith('[') && tag.text.includes(']')) {
                    return tag.text.substring(1, tag.text.indexOf(']'));
                }
            }
        }

        const defMatch = node.text.match(/(?:def|define)\s+([a-zA-Z0-9_]+)/i);
        if (defMatch) {
            const startIdx = node.text.indexOf(defMatch[1]);
            if (this.position.character >= startIdx && this.position.character <= startIdx + defMatch[1].length) {
                return defMatch[1];
            }
        }

        const asMatch = node.text.match(/\bas:([a-zA-Z0-9_]+)\b/i);
        if (asMatch) {
            const startIdx = node.text.indexOf(asMatch[1]);
            if (this.position.character >= startIdx && this.position.character <= startIdx + asMatch[1].length) {
                return asMatch[1];
            }
        }

        return null;
    }
}
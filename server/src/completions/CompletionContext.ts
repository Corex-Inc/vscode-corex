import { TextDocumentPositionParams, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseAST } from '../ast';
import { eventRegistry } from '../services/events';

export class CompletionContext {
    public readonly doc: TextDocument;
    public readonly pos: TextDocumentPositionParams;
    public readonly position: Position;
    public readonly linePrefix: string;

    private _ast?: any;
    private _currentContainer?: string;
    private _parentEventMeta?: any;

    constructor(pos: TextDocumentPositionParams, doc: TextDocument) {
        this.pos = pos;
        this.doc = doc;
        this.position = pos.position;
        this.linePrefix = doc.getText({ 
            start: { line: pos.position.line, character: 0 }, 
            end: pos.position 
        });
    }

    get ast() {
        if (!this._ast) this._ast = parseAST(this.doc);
        return this._ast;
    }

    get isCommand() {
        return this.linePrefix.trim().startsWith('-');
    }

    get isTag() {
        return this.linePrefix.includes('<');
    }

    get isEventLine() {
        return /^\s*(on|after)\b/i.test(this.linePrefix);
    }

    get currentContainer(): string {
        if (this._currentContainer !== undefined) return this._currentContainer;
        this._currentContainer = "global";
        for (let i = this.position.line; i >= 0; i--) {
            const line = this.doc.getText({ start: { line: i, character: 0 }, end: { line: i + 1, character: 0 } });
            const containerMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(?:#.*|\/\/.*)?$/);
            if (containerMatch) {
                this._currentContainer = containerMatch[1];
                break;
            }
        }
        return this._currentContainer;
    }

    get parentEventMeta() {
        if (this._parentEventMeta !== undefined) return this._parentEventMeta;
        this._parentEventMeta = null;
        
        const currentIndent = this.linePrefix.match(/^(\s*)/)?.[1].length || 0;
        for (let i = this.position.line - 1; i >= 0; i--) {
            const l = this.doc.getText({ start: { line: i, character: 0 }, end: { line: i + 1, character: 0 } });
            const ind = l.match(/^(\s*)/)?.[1]?.length || 0;
            if (ind < currentIndent && /^\s*(on|after)\s+/.test(l)) {
                const m = l.match(/^\s*(on|after)\s+(.+?):\s*(?:#.*|\/\/.*)?$/i);
                if (m) {
                    const res = eventRegistry.resolveEvent(m[2].trim());
                    if (res) this._parentEventMeta = res.meta;
                }
                break;
            }
            if (ind === 0 && l.trim() !== '') break;
        }
        return this._parentEventMeta;
    }

    get parentIsEvents(): boolean {
        const currentIndent = this.linePrefix.match(/^(\s*)/)?.[1].length || 0;
        for (let i = this.position.line - 1; i >= 0; i--) {
            const l = this.doc.getText({ start: { line: i, character: 0 }, end: { line: i + 1, character: 0 } });
            const cleanL = l.split('//')[0].split('#')[0].trim();
            const ind = l.match(/^(\s*)/)?.[1]?.length || 0;
            if (ind < currentIndent) {
                if (cleanL === 'events:') return true;
                if (/^(on|after)\b/i.test(cleanL)) return false;
                if (ind === 0 && cleanL !== '') break;
            }
        }
        return false;
    }
}
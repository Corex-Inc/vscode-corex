import { TextDocumentPositionParams, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseAST, extractAllTagsGlobal } from '../ast';

export class DefinitionContext {
    public readonly pos: TextDocumentPositionParams;
    public readonly doc: TextDocument;
    public readonly position: Position;
    public readonly offset: number;

    private _ast?: any[];
    private _currentNode?: any | null;
    private _currentTag?: { text: string, start: number, end: number } | null;

    constructor(pos: TextDocumentPositionParams, doc: TextDocument) {
        this.pos = pos;
        this.doc = doc;
        this.position = pos.position;
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

    get currentTag() {
        if (this._currentTag === undefined) {
            const allTags = extractAllTagsGlobal(this.doc.getText());
            const tags = allTags.filter(t => this.offset >= t.start - 1 && this.offset <= t.end + 1);
            if (tags.length === 0) {
                this._currentTag = null;
            } else {
                tags.sort((a, b) => (a.end - a.start) - (b.end - b.start));
                this._currentTag = tags[0];
            }
        }
        return this._currentTag;
    }
}
import { CodeActionParams, Diagnostic } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseAST } from '../ast';

export class CodeActionContext {
    public readonly params: CodeActionParams;
    public readonly doc: TextDocument;
    
    private _ast?: any[];
    private _lines?: string[];

    constructor(params: CodeActionParams, doc: TextDocument) {
        this.params = params;
        this.doc = doc;
    }

    get ast() {
        if (!this._ast) this._ast = parseAST(this.doc);
        return this._ast;
    }

    get lines() {
        if (!this._lines) this._lines = this.doc.getText().split('\n');
        return this._lines;
    }

    public getDiagnostics(code: string): Diagnostic[] {
        return this.params.context.diagnostics.filter(d => d.code === code);
    }
}
import { createConnection, TextDocuments, ProposedFeatures, InitializeParams, TextDocumentSyncKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { db } from './database';
import { loadOrUpdateCache } from './parser';
import { getDiagnostics } from './providers/diagnostics';
import { handleCompletion } from './providers/completion';
import { handleHover } from './providers/hover';
import { handleCodeAction } from './providers/codeActions';
import { handleDefinition } from './providers/definition';
import { handleRename } from './providers/rename';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

export let globalStoragePath: string = "";

connection.onInitialize((params: InitializeParams) => {
    if (params.initializationOptions && params.initializationOptions.storagePath) {
        globalStoragePath = params.initializationOptions.storagePath;
    }

    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: { resolveProvider: false, triggerCharacters: ['.', '<', '- ', '['] },
            hoverProvider: true,
            definitionProvider: true,
            codeActionProvider: true,
            renameProvider: true
        }
    };
});

connection.onInitialized(async () => {
    await loadOrUpdateCache();
});

connection.onRenameRequest((params) => {
    return handleRename(params, documents);
});

connection.onRequest("corex/reloadDocs", async () => {
    try {
        await loadOrUpdateCache(true);
        return db.typeMap.size;
    } catch (error: any) {
        throw new Error(error.message || "Unknown ERROR");
    }
});

documents.onDidChangeContent(change => {
    const diagnostics = getDiagnostics(change.document);
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
});

connection.onDefinition((params) => {
    return handleDefinition(params, documents);
});

connection.onCodeAction((params) => {
    return handleCodeAction(params, documents);
});

connection.onCompletion((pos) => handleCompletion(pos, documents));
connection.onHover((pos) => handleHover(pos, documents));

documents.listen(connection);
connection.listen();
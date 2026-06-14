import { createConnection, TextDocuments, ProposedFeatures, InitializeParams, TextDocumentSyncKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { db } from './database';
import { loadOrUpdateCache } from './parser';
import { getDiagnostics } from './diagnostics/index';
import { handleCompletion } from './completions/index';
import { handleHover } from './hovers/index';
import { handleCodeAction } from './code-actions/index';
import { handleDefinition } from './definitions/index';
import { handleRename } from './renames/index';

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
        return db.baseObjects.size + db.events.length + db.commands.length + db.formatters.length + db.typeMap.size;
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
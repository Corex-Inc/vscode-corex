// client/src/extension.ts
import * as path from 'path';
import { workspace, ExtensionContext, commands, window, ProgressLocation } from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';
import * as fs from 'fs';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
    const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));

    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: { execArgv: ['--nolazy', '--inspect=6009'] }
        }
    };

    const storagePath = context.globalStorageUri.fsPath;
    if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
    }

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'corex' }],
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
        },
        initializationOptions: {
            storagePath: storagePath
        }
    };

    client = new LanguageClient(
        'corexLanguageServer',
        'Corex Language Server',
        serverOptions,
        clientOptions
    );

    client.start();

    const reloadCmd = commands.registerCommand('corex.reloadDocs', () => {
        window.withProgress({
            location: ProgressLocation.Notification,
            title: "Downloading metadoc...",
            cancellable: false
        }, async (progress) => {
            try {
                const elementsCount = await client.sendRequest<number>("corex/reloadDocs");
                
                window.showInformationMessage(`Metadoc successfully updated: ${elementsCount} elements loaded.`);
            } catch (error: any) {
                window.showErrorMessage(`Metadoc update failed: ${error.message || error}`);
            }
        });
    });

    context.subscriptions.push(reloadCmd);
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
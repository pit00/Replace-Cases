import * as vscode from 'vscode';

let params: {group:string, key:string, value:string}[] = [];
let importParams: {group:string, key:string, value:string}[] = [];

export function activate(context: vscode.ExtensionContext) {

    const kvProvider = new ReplaceCasesKVProvider(context.extensionUri);
    const scannerProvider = new ScannerProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.commands.registerCommand('Replace-Cases.import', async function () {
            const importAs = await vscode.window.showQuickPick(['CSV', 'TSV']);
            let sepChar = ',';
            let newLineChar = '\n';
            if (importAs) {
                importParams = [];
                if (importAs === 'CSV') {
                    sepChar = ',';
                    newLineChar = '\n';
                } else if (importAs === 'TSV') {
                    sepChar = '\t';
                    newLineChar = '\n';
                }
                let importFilePath = undefined;
                await vscode.window.showOpenDialog({ filters: { "File Extensions": ["*"] } }).then(fileUri => {
                    if (fileUri) {
                        importFilePath = fileUri[0].fsPath;
                    }
                });
                if (importFilePath) {
                    const importDoc = vscode.workspace.openTextDocument(vscode.Uri.file(importFilePath));
                    const importText = (await importDoc).getText();
                    const paramArray = importText.split(newLineChar);
                    for (const paramLine of paramArray) {
                        if (paramLine !== '') {
                            const paramItems = paramLine.split(sepChar);
                            importParams.push({
                                group: paramItems[0],
                                key: paramItems[1],
                                value: paramItems[2]
                            });
                        }
                    }
                    kvProvider.updateParams();
                }
            }
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('Replace-Cases.export', async function () {
            const exportAs = await vscode.window.showQuickPick(['CSV', 'TSV']);
            if (exportAs) {
                let data = "";
                if (exportAs === 'CSV') {
                    for (const param of params) {
                        data = data + param.group + ","  + param.key + "," + param.value + "\n";
                    }
                } else if (exportAs === 'TSV') {
                    for (const param of params) {
                        data = data + param.group + "\t"  + param.key + "\t" + param.value + "\n";
                    }
                }
                const exportDoc = await vscode.workspace.openTextDocument({content: data})
                ;(await exportDoc).save();
            }
        })
    );
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ReplaceCasesKVProvider.viewType, kvProvider)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('Replace-Cases.addParam', () => {
            kvProvider.addParam();
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('Replace-Cases.replaceAll', () => {
            kvProvider.replaceAll();
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('Replace-Cases.clearAll', () => {
            kvProvider.clearAll();
        })
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ScannerProvider.viewType, scannerProvider)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('Replace-Cases.re-scan', () => {
            scannerProvider.reScan();
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                scannerProvider.reScan();
            }
        })
    );
}

class ReplaceCasesKVProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'Replace-Cases.kv-explorer';

    private _view ?: vscode.WebviewView;
    private _context ?: vscode.WebviewViewResolveContext;

    constructor(private readonly _extensionUri: vscode.Uri,) {}

    public resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken,) {
        this._view = webviewView;
        this._context = context;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async data => {
            const editor = vscode.window.activeTextEditor;
            switch (data.type) {
                case 'replaceAllAction': {
                    if (editor) {
                        for (const param of data.value) {
                            let text = editor.document.getText();
                            var key_len = param.key.length;
                            var value_len = param.value.length;
                            if (key_len === 0) {
                                continue;
                            }
                            let startIndex = 0, index;
                            while ((index = text.indexOf(param.key, startIndex)) > -1) {
                                const pos_start = editor.document.positionAt(index);
                                const pos_end = editor.document.positionAt(index + key_len);

                                await editor.edit(editBuilder => {
                                    const range = new vscode.Range(pos_start, pos_end);
                                    editBuilder.replace(range, param.value);
                                });

                                text = editor.document.getText();
                                startIndex = index + value_len;
                            }
                        }
                    }
                } case 'updateParams': {
                    params = data.value;
                }
            }
        });
    }

    public addParam() {
        if (this._view) {
            this._view.show?.(true); // `show` is not implemented in 1.49 but is for 1.50 insiders
            this._view.webview.postMessage({ type: 'addParam' });
        }
    }

    public replaceAll() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'replaceAll' });
        }
    }

    public clearAll() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'clearAll' });
        }
    }

    public updateParams() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'updateParams', value: importParams });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'ps-main.js'));

        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
        const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));
        const styleCodiconUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));
        const fontCodiconUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'vscode-codicons', 'dist', 'codicon.ttf'));
        
        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <!--
                    Use a content security policy to only allow loading images from https or from our extension directory,
                    and only allow scripts that have a specific nonce.
                -->
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleResetUri}" rel="stylesheet">
                <link href="${styleVSCodeUri}" rel="stylesheet">
                <link href="${styleMainUri}" rel="stylesheet">
                <link href="${styleCodiconUri}" rel="stylesheet" />

                <title>Replace Cases</title>
            </head>
            <body>
                <div class="header replaceByGroup">
                    <div>Key</div>
                    <div>    Value</div>
                    <div class='icon-filler'></div>
                </div>
                <ul class="param-list"></ul>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}

class ScannerProvider implements vscode.WebviewViewProvider{
    public static readonly viewType = 'Replace-Cases.scanner';

    private _view ?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri,) {}

    public resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken,) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async data => {
            switch (data.type) {
                case 'getParams': {
                    this._view?.webview.postMessage({ type: 'getParams', value: params });
                }
            }
        });
    }

    public reScan() {
        if (this._view) {
            const text = vscode.window.activeTextEditor?.document.getText();
            this._view.webview.postMessage({ type: 'reScan', value: params, editor: text });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'sn-main.js'));

        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
        const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));

        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <!--
                    Use a content security policy to only allow loading images from https or from our extension directory,
                    and only allow scripts that have a specific nonce.
                -->
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleResetUri}" rel="stylesheet">
                <link href="${styleVSCodeUri}" rel="stylesheet">
                <link href="${styleMainUri}" rel="stylesheet">

                <title>Replace Cases</title>
            </head>
            <body>
                <div class='header'>
                    <div>Key</div>
                    <div>Count</div>
                </div>
                <ul class="scanner-list"></ul>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

// this method is called when your extension is deactivated
export function deactivate() {}

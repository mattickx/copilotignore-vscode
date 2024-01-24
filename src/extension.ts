import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';

class Extension {
  log: vscode.LogOutputChannel;

  patterns = ignore({});

  context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.log = vscode.window.createOutputChannel("Copilot Ignore", { log: true });
    this.context = context;
    context.subscriptions.push(this.log);
    this.log.info(`[constructor] Activated extension`);
  }

  initialize() {
    try {
      this.fillPatterns();

      this.context.subscriptions.push(

        // Register the event handlers for changes that trigger a re-check of the ignore patterns
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
          this.fillPatterns();
        }),
        vscode.workspace.onDidSaveTextDocument((file: vscode.TextDocument) => {
          if (file.fileName.endsWith('.copilotignore')) {
            this.fillPatterns();
          }
        }),
        vscode.workspace.onDidDeleteFiles((fileDeleteEvent: vscode.FileDeleteEvent) => {
          if (fileDeleteEvent.files.find(file => file.path.endsWith('.copilotignore'))) {
            this.fillPatterns();
          }
        }),
        vscode.workspace.onDidRenameFiles(() => {
          this.fillPatterns();
        }),

        // Register the event handlers that could triggers a state change
        vscode.window.onDidChangeVisibleTextEditors((editors) => this.setCopilotStateBasedOnEditors(editors)),

      );

      // this.setCopilotStateBasedOnEditors(vscode.window.visibleTextEditors, this.allPatterns);
      this.log.info(`[constructor] Initialized extension`);
    } catch (e) {
      this.log.info(`[activate] Error: ${e}`);
    }
  }

  // // Function to read ignore patterns from a file
  readIgnorePatterns(filepath: string): string[] {
    try {
      const patterns: string[] = [];

      if (fs.existsSync(filepath)) {
        this.log.info(`[readIgnorePatterns] Reading ignore patterns from: ${filepath}`);
        const lines = fs.readFileSync(filepath, 'utf-8').split('\n');
        for (const line of lines) {
          patterns.push(line.trim());
        }
      }

      return patterns;
    } catch (e) {
      this.log.info(`[readIgnorePatterns] Error: ${e}`);
      return [];
    }
  }

  // Function to check if a file matches any simple wildcard pattern
  matchesAnyPattern(filePath: string): boolean {
    try {
      if (!filePath || filePath.includes('Mattickx.copilotignore-vscode.Copilot')) {
        return false;
      }
      return this.patterns.test(filePath).ignored;
    } catch (e) {
      this.log.info(`[matchesAnyPattern] Error: ${e}`);
      return false;
    }
  }

  // // Main function to check and disable Copilot for the current workspace
  setConfigEnabled(newStateEnabled: boolean, filePath?: string) {
    try {
      const COPILOT_ENABLE_CONFIG = `github.copilot.enable`;
      const config = vscode.workspace.getConfiguration();

      this.log.info(`CopilotIgnore: Trying to set new state: (${newStateEnabled}) for file: ${filePath}`);

      const currentCopilotConfig: Record<string, boolean> = {
        ...(config.get(COPILOT_ENABLE_CONFIG) || {}),
      };

      if (currentCopilotConfig && Boolean(currentCopilotConfig['*']) === newStateEnabled) {
        this.log.info(`CopilotIgnore: Skipped due to already same boolean value (Old: ${currentCopilotConfig['*']} - New: ${newStateEnabled})`);
        return;
      }

      config.update(COPILOT_ENABLE_CONFIG, { ...currentCopilotConfig, '*': newStateEnabled ? undefined : false }, vscode.ConfigurationTarget.Workspace);

      this.log.info(`CopilotIgnore: Changed state to: ${newStateEnabled}`);
    } catch (e) {
      this.log.info(`[setConfigEnabled] Error: ${e}`);
      return [];
    }
  }

  fillPatterns() {
    try {
      this.patterns = ignore();

      let count = 0;

      if (vscode.workspace.workspaceFolders?.length) {
        vscode.workspace.workspaceFolders.forEach((folder) => {
          const localPatterns = this.readIgnorePatterns(path.resolve(folder.uri.path, '.copilotignore'));
          if (localPatterns.length) {
            this.patterns.add(localPatterns);
            count += localPatterns.length;
          }
        });
      }

      if (process?.env?.HOME) {
        const globalPatterns = this.readIgnorePatterns(`${process.env.HOME}/.copilotignore`);
        if (globalPatterns.length) {
          this.patterns.add(globalPatterns);
          count += globalPatterns.length;
        }
      }

      this.log.info(`Collected patterns: ${count}`);
    } catch (e) {
      this.log.info(`[fillPatterns] Error: ${e}`);
      return [];
    }
  }

  setCopilotStateBasedOnEditors(editors: readonly vscode.TextEditor[]) {
    const filesOpen = editors.map((editor) => vscode.workspace.asRelativePath(editor.document.uri));
    const foundOpenIgnoredFile = filesOpen.find((filePath) => this.matchesAnyPattern(filePath));
    this.setConfigEnabled(!foundOpenIgnoredFile, foundOpenIgnoredFile);
  }

}

export function activate(context: vscode.ExtensionContext) {
  const extension = new Extension(context);
  extension.initialize();
}

export function deactivate() { }
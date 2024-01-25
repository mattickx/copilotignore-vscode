import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';

const COPILOT_ENABLE_CONFIG = `github.copilot.enable`;

class Extension {
  log: vscode.LogOutputChannel;

  count: number = 0;

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
        vscode.window.onDidChangeVisibleTextEditors(() => this.trigger()),
        vscode.window.onDidChangeActiveTextEditor(() => this.trigger()),
      );

      this.log.info(`[initialize] Initialized extension`);
    } catch (e) {
      this.log.info(`[initialize] Error: ${e}`);
    }
  }

  trigger() {
    if (this.count === 0) {
      this.log.info(`[trigger] Pattern count is 0. Trigger ignored.`);
      return;
    }
    this.setCopilotStateBasedOnEditors(vscode.window.visibleTextEditors);
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

  isInvalidFile(filePath: string): boolean {
    return !filePath?.length || filePath[0] === '/' || filePath.includes('Mattickx.copilotignore-vscode.Copilot') || filePath === 'undefined';
  }

  // Function to check if a file matches any simple wildcard pattern
  matchesAnyPattern(filePath: string): boolean {
    try {
      if (this.isInvalidFile(filePath)) {
        return false;
      }
      const result = this.patterns.test(filePath).ignored;
      this.log.info(`[matchesAnyPattern] Does ${filePath} match: ${result}`);
      return result;
    } catch (e) {
      this.log.info(`[matchesAnyPattern] Error: ${e}`);
      return false;
    }
  }

  // // Main function to check and disable Copilot for the current workspace
  setConfigEnabled(newStateEnabled: boolean) {
    try {
      const config = vscode.workspace.getConfiguration();

      let currentConfig: Record<string, boolean> = {
        ...(config.get(COPILOT_ENABLE_CONFIG) || {}),
      };

      let newConfig = Object.keys(currentConfig).reduce((obj, k) => {
        obj[k] = newStateEnabled;
        return obj;
      }, {} as Record<string, boolean>);

      // Make sure '*' is first
      newConfig = {
        '*': newStateEnabled,
        ...newConfig,
        // Defaults of copilot
        plaintext: false,
        markdown: false,
        scminput: false,
      };

      config.update(COPILOT_ENABLE_CONFIG, newConfig, vscode.ConfigurationTarget.Global);

      this.log.info(`[setConfigEnabled] Should Copilot be enabled: ${newStateEnabled}`);
    } catch (e) {
      this.log.info(`[setConfigEnabled] Error: ${e}`);
      return [];
    }
  }

  fillPatterns() {
    try {
      this.count = 0;
      this.patterns = ignore();

      if (vscode.workspace.workspaceFolders?.length) {
        vscode.workspace.workspaceFolders.forEach((folder) => {
          const localPatterns = this.readIgnorePatterns(path.resolve(folder.uri.path, '.copilotignore'));
          if (localPatterns.length) {
            this.patterns.add(localPatterns);
            this.count += localPatterns.length;
          }
        });
      }

      if (process?.env?.HOME) {
        const globalPatterns = this.readIgnorePatterns(`${process.env.HOME}/.copilotignore`);
        if (globalPatterns.length) {
          this.patterns.add(globalPatterns);
          this.count += globalPatterns.length;
        }
      }

      this.log.info(`[fillPatterns] Collected patterns: ${this.count}`);
    } catch (e) {
      this.log.info(`[fillPatterns] Error: ${e}`);
      return [];
    }
  }

  setCopilotStateBasedOnEditors(editors: readonly vscode.TextEditor[]) {
    const filesOpen = editors.map((editor) => vscode.workspace.asRelativePath(editor.document.uri)).filter((filePath) => !this.isInvalidFile(filePath));
    if (filesOpen.length === 0) {
      return;
    }
    const foundOpenIgnoredFile = filesOpen.find((filePath) => this.matchesAnyPattern(filePath));
    this.log.info(`[setCopilotStateBasedOnEditors] New enabled state from files: ${!foundOpenIgnoredFile}`);
    this.setConfigEnabled(!foundOpenIgnoredFile);
  }

}

export function activate(context: vscode.ExtensionContext) {
  const extension = new Extension(context);
  extension.initialize();
  // vscode.commands.registerCommand('copilot-ignore', () => {
  //   extension.setConfigEnabled(false, 'command');
  // });
}

export function deactivate() { }
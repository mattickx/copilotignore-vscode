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
        vscode.window.onDidChangeVisibleNotebookEditors(() => this.trigger()),
        vscode.window.onDidChangeActiveNotebookEditor(() => this.trigger()),
      );

      // If we have it, register the event handler for new git repositories appearing
      // This is especially needed because whilst we register a dependency on that plugin, it activates lazily
      // Having this also allows us to remove that dependency, should that be desirable.
      const gitExtensions = vscode.extensions.getExtension('vscode.git');
      if (gitExtensions) {
        const git = gitExtensions.exports.getAPI(1);
        this.context.subscriptions.push(
          git.onDidOpenRepository(() => {
            this.fillPatterns();
          }),
        );
      }

      this.log.info(`[initialize] Initialized extension`);
    } catch (e) {
      this.log.info(`[initialize] Error: ${e}`);
    }
  }

  trigger() {
    if (this.count === 0) {
      this.log.info(`[trigger] Pattern count is 0. Copilot will be enabled in settings.`);
      this.setConfigEnabled(true);
      return;
    }
    this.setCopilotStateBasedOnVisibleEditors(vscode.window.visibleTextEditors, vscode.window.visibleNotebookEditors);
  }

  // Function to read ignore patterns from a file
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

  // Ignore invalid files that are not in a folder of the workspace
  isInvalidFile(filePath: string): boolean {
    if (!filePath?.length || filePath === 'undefined' || filePath.includes('Mattickx.copilotignore-vscode.Copilot')) {
      return true;
    }

    if (filePath[0] === '/') {
      const found = vscode.workspace.workspaceFolders?.find((folder) => {
        return filePath.includes(folder.uri.fsPath) || filePath.includes(folder.uri.path);
      });
      return !found;
    }

    return false;
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

  // Main function to check and disable Copilot for the current workspace
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

  getGitRepositories(): string[] {
    const gitExtensions = vscode.extensions.getExtension('vscode.git');
    if (gitExtensions) {
      const git = gitExtensions.exports.getAPI(1);
      return git.repositories.map((repo: { rootUri: vscode.Uri; }) => repo.rootUri.fsPath);
    }
    return [];
  }

  getWorkspaceFolders(): string[] {
    if (vscode.workspace.workspaceFolders?.length) {
      return vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath);
    }
    return [];
  }

  fillPatterns() {
    try {
      this.count = 0;
      this.patterns = ignore();

      let gitRepos = this.getGitRepositories();
      this.log.info(`[fillPatterns] Git repos: ${gitRepos.length}`);
      let workspaceFolders = this.getWorkspaceFolders();
      this.log.info(`[fillPatterns] Workspace folders: ${workspaceFolders.length}`);
      let folders = new Set<string>([...gitRepos, ...workspaceFolders]);
      this.log.info(`[fillPatterns] Distinct folders: ${folders.size}`);
      folders.forEach((folder) => {
        const filePath = path.join(folder, '.copilotignore');
        const localPatterns = this.readIgnorePatterns(filePath);
        this.patterns.add(localPatterns);
        this.count += localPatterns.length;
      });

      if (process?.env?.HOME) {
        const filePath = path.join(process.env.HOME, '.copilotignore');
        const globalPatterns = this.readIgnorePatterns(filePath);
        this.patterns.add(globalPatterns);
        this.count += globalPatterns.length;
      }

      this.log.info(`[fillPatterns] Collected patterns: ${this.count}`);
    } catch (e) {
      this.log.info(`[fillPatterns] Error: ${e}`);
      return [];
    }
  }

  setCopilotStateBasedOnVisibleEditors(editors: readonly vscode.TextEditor[], notebooks: readonly vscode.NotebookEditor[]) {
    // Filter out the editors that are cells in notebooks

    const filesOpen = ([] as string[]).concat(
      editors.filter((editor) => editor.document.uri.scheme !== 'vscode-notebook-cell').map((editor) => vscode.workspace.asRelativePath(editor.document.uri)),
      notebooks.map((notebookEditor) => vscode.workspace.asRelativePath(notebookEditor.notebook.uri)),
    ).filter((filePath) => !this.isInvalidFile(filePath));

    if (filesOpen.length === 0) {
      return;
    }

    let foundOpenIgnoredFile = false
    for (const filePath of filesOpen) {
      if (this.matchesAnyPattern(filePath)) {
        foundOpenIgnoredFile = true;
        break;
      }
    }

    this.log.info(`[setCopilotStateBasedOnVisibleEditors] New enabled state from files: ${!foundOpenIgnoredFile}`);
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
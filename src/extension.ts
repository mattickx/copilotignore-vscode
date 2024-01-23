import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import globToRegExp from 'glob-to-regexp';

const COPILOT_ENABLE_CONFIG = `github.copilot.enable`;

const log = vscode.window.createOutputChannel("CopilotIgnore");

// Function to read ignore patterns from a file
function readIgnorePatterns(filepath: string): string[] {
  const patterns: string[] = [];
  if (fs.existsSync(filepath)) {
    const lines = fs.readFileSync(filepath, 'utf-8').split('\n');
    for (const line of lines) {
      patterns.push(line.trim());
    }
  }
  return patterns;
}

// // Function to check if a file matches any simple wildcard pattern
function matchesAnyPattern(filename: string, patterns: string[]): boolean {
  if (!filename || !patterns?.length) {
    return false;
  }
  for (const pattern of patterns) {
    const regex = globToRegExp(pattern);
    if (filename.match(regex)) {
      return true;
    }
  }
  return false;
}

// Main function to check and disable Copilot for the current workspace
function setConfigEnabled(newStateEnabled: boolean, filePath?: string) {
  try {
    const config = vscode.workspace.getConfiguration();

    log.appendLine(`CopilotIgnore: Trying to set new state: (${newStateEnabled}) for file: ${filePath}`);

    const currentCopilotConfig: Record<string, boolean> = {
      ...(config.get(COPILOT_ENABLE_CONFIG) || {}),
    };

    if (currentCopilotConfig && Boolean(currentCopilotConfig['*']) === newStateEnabled) {
      log.appendLine(`CopilotIgnore: Skipped due to already same boolean value (Old: ${currentCopilotConfig['*']} - New: ${newStateEnabled})`);
      return;
    }

    config.update(COPILOT_ENABLE_CONFIG, { ...currentCopilotConfig, '*': newStateEnabled ? undefined : false }, vscode.ConfigurationTarget.Workspace);

    log.appendLine(`CopilotIgnore: Changed state to: ${newStateEnabled}`);
  } catch (e: any) {
    log.appendLine(`[setConfigEnabled] Error: ${e} ${e?.stack?.toString()}`);
    return [];
  }
}

const getPatterns = () => {
  try {
    const allPatterns: string[] = [];

    if (vscode.workspace.workspaceFolders?.length) {
      vscode.workspace.workspaceFolders.forEach((folder) => {
        const localPatterns = readIgnorePatterns(path.resolve(folder.uri.path, '.copilotignore'));
        if (localPatterns.length) { allPatterns.push(...localPatterns); }
      });
    }

    const globalPatterns = readIgnorePatterns(`${process.env.HOME}/.copilotignore`);
    if (allPatterns.length) { allPatterns.push(...globalPatterns); }

    log.appendLine(`Collected patterns: ${allPatterns.length}`);

    return allPatterns;
  } catch (e: any) {
    log.appendLine(`[getPatterns] Error: ${e} ${e?.stack?.toString()}`);
    return [];
  }
};

// Register the extension's activation event
export function activate(context: vscode.ExtensionContext) {
  let allPatterns: string[] = getPatterns();

  try {
    const setCopilotStateBasedOnEditors = (editors: readonly vscode.TextEditor[]) => {
      const filesOpen = editors.map((editor) => editor.document.uri.fsPath);
      const foundOpenIgnoredFile = filesOpen.find((filePath) => matchesAnyPattern(filePath, allPatterns));
      setConfigEnabled(!foundOpenIgnoredFile, foundOpenIgnoredFile);
    };

    // Register the event handlers for changes that trigger a re-check of the ignore patterns
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        allPatterns = getPatterns();
      }),
      vscode.workspace.onDidSaveTextDocument((file: vscode.TextDocument) => {
        if (file.fileName.endsWith('.copilotignore')) {
          allPatterns = getPatterns();
        }
      }),
      vscode.workspace.onDidRenameFiles(() => {
        allPatterns = getPatterns();
      }),
    );

    // Register the event handlers that could triggers a state change
    context.subscriptions.push(
      vscode.window.onDidChangeVisibleTextEditors((editors) => setCopilotStateBasedOnEditors(editors)),
    );

    setCopilotStateBasedOnEditors(vscode.window.visibleTextEditors);
  } catch (e: any) {
    log.appendLine(`[activate] Error: ${e} ${e?.stack?.toString()}`);
  }
}
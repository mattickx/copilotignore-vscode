import * as vscode from 'vscode'
import * as path from 'path'
import * as ignore from 'ignore'

const COPILOT_ENABLE_CONFIG = `github.copilot.enable`

function debounce(func: Function, timeout = 100): Function {
  let timer: any
  return (...args: any[]) => {
    clearTimeout(timer)
    // @ts-ignore
    timer = setTimeout(() => { func.apply(this, args) }, timeout)
  }
}

class Extension {
  log: vscode.LogOutputChannel

  count: number = 0

  patterns = new Map<string, ignore.Ignore>()

  context: vscode.ExtensionContext

  trigger: Function

  constructor(context: vscode.ExtensionContext) {
    this.log = vscode.window.createOutputChannel("Copilot Ignore", { log: true })
    this.context = context
    context.subscriptions.push(this.log)

    this.trigger = this._trigger //debounce(this._trigger, 100) // https://github.com/mattickx/copilotignore-vscode/issues/11

    this.log.info(`[constructor] Activated extension`)
  }

  initialize() {
    try {
      this.fillPatterns()

      this.context.subscriptions.push(
        // Register the event handlers for changes that trigger a re-check of the ignore patterns
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
          this.fillPatterns()
        }),
        vscode.workspace.onDidSaveTextDocument((file: vscode.TextDocument) => {
          if (file.fileName.endsWith('.copilotignore')) {
            this.fillPatterns()
          }
        }),
        vscode.workspace.onDidDeleteFiles((fileDeleteEvent: vscode.FileDeleteEvent) => {
          if (fileDeleteEvent.files.find(file => file.path.endsWith('.copilotignore'))) {
            this.fillPatterns()
          }
        }),
        vscode.workspace.onDidRenameFiles(() => {
          this.fillPatterns()
        }),

        // Register the event handlers that could triggers a state change
        vscode.window.onDidChangeVisibleTextEditors(() => this.trigger('onDidChangeVisibleTextEditors')),
        // vscode.window.onDidChangeActiveTextEditor(() => this.trigger('onDidChangeActiveTextEditor')),
        vscode.window.onDidChangeVisibleNotebookEditors(() => this.trigger('onDidChangeVisibleNotebookEditors')),
        // vscode.window.onDidChangeActiveNotebookEditor(() => this.trigger('onDidChangeActiveNotebookEditor')),
      )

      this.log.info(`[initialize] Initialized extension`)
    } catch (e) {
      this.log.info(`[initialize] Error: ${e}`)
    }
  }

  _trigger(triggerName: string) {
    this.log.info(`[trigger] Triggered by: ${triggerName}`)
    if (this.count === 0) {
      this.log.info(`[trigger] Pattern count is 0. Copilot will be enabled in settings.`)
      this.setConfigEnabled(true)
      return
    }
    this.setCopilotStateBasedOnVisibleEditors(vscode.window.visibleTextEditors, vscode.window.visibleNotebookEditors)
  }

  // Function to read ignore patterns from a file
  async readIgnorePatterns(fileUri: vscode.Uri): Promise<string[]> {
    const patterns: string[] = []
    try {
      this.log.info(`[readIgnorePatterns] Reading ignore patterns from: ${fileUri}`)
      const fileContent = await vscode.workspace.fs.readFile(fileUri)
      const text = new TextDecoder().decode(fileContent)
      let lines = text.split('\n')
      for (const line of lines) {
        // We need to skip whitespace only lines
        if (line) {
          patterns.push(line.trim())
        }
      }

    } catch (e) {
      if (e instanceof vscode.FileSystemError && e.code === 'FileNotFound') {
        this.log.debug(`[readIgnorePatterns] FileNotFound: ${e}`)
      } else {
        this.log.info(`[readIgnorePatterns] Error: ${e}`)
      }
    }
    return patterns
  }

  // Ignore invalid files that are not in a folder of the workspace
  isInvalidFile(filePath: string): boolean {
    if (!filePath?.length || filePath === 'undefined' || filePath.includes('Mattickx.copilotignore-vscode.Copilot')) {
      return true
    }

    if (filePath[0] === '/') {
      const found = vscode.workspace.workspaceFolders?.find((folder) => {
        return filePath.includes(folder.uri.fsPath) || filePath.includes(folder.uri.path)
      })
      return !found
    }

    return false
  }

  // Function to check if a file matches any simple wildcard pattern
  matchesAnyPattern(filePath: string): boolean {
    try {
      if (this.isInvalidFile(filePath)) {
        return false
      }
      for (const [folder, patterns] of this.patterns) {
        if (filePath.startsWith(folder)) {
          const result = patterns.test(filePath.replace(folder, '').replace(/^\//, '')).ignored
          if (result) {
            this.log.info(`[matchesAnyPattern] Does ${filePath} match: ${result}`)
            return result
          }
        }
      }
      return false
    } catch (e) {
      this.log.info(`[matchesAnyPattern] Error: ${e}`)
      return false
    }
  }

  // Main function to check and disable Copilot for the current workspace
  setConfigEnabled(newStateEnabled: boolean): boolean {
    try {
      return (
        this.setConfigEnabledByExtension(newStateEnabled)
        || this.setConfigEnabledBySettings(newStateEnabled)
      )
    } catch (e) {
      this.log.info(`[setConfigEnabled] Error: ${e}`)
      return false
    }
  }

  setConfigEnabledByExtension(newStateEnabled: boolean): boolean {
    try {
      const copilot = vscode.extensions.getExtension('github.copilot')
      const hasSetContext = typeof copilot?.exports?.setContext !== 'undefined'
      if (hasSetContext) {
        copilot?.exports.setContext('copilot:enabled', newStateEnabled)
      }
      return hasSetContext
    } catch (err) {
      return false
    }
  }

  setConfigEnabledBySettings(newStateEnabled: boolean): boolean {
    const config = vscode.workspace.getConfiguration()

    let currentConfig: Record<string, boolean> = {
      ...(config.get(COPILOT_ENABLE_CONFIG) || {}),
    }

    let newConfig = Object.keys(currentConfig).reduce((obj, k) => {
      obj[k] = newStateEnabled
      return obj
    }, {} as Record<string, boolean>)

    // Make sure '*' is first
    newConfig = {
      '*': newStateEnabled,
      ...newConfig,
      // Defaults of copilot
      plaintext: false,
      markdown: false,
      scminput: false,
    }

    this.log.info(`[setConfigEnabled] Should Copilot be enabled: ${newStateEnabled}`)
    try {
      config.update(COPILOT_ENABLE_CONFIG, newConfig, vscode.ConfigurationTarget.Global).then(() => {
        this.log.info(`[setConfigEnabled] New enabled state: ${newStateEnabled}`)
      })
      return true
    } catch (err) {
      return false
    }
  }

  async findIgnoreFiles(root: vscode.Uri, folder: vscode.Uri) {
    const directories = await vscode.workspace.fs.readDirectory(folder)
    // Find all directories inside folder
    // recurse this function for folders.
    // limitation: this will *not* follow symbolic links, but this means we don't need to check for loops.
    for (const [name, type] of directories) {
      if (type === vscode.FileType.Directory) {
        const dirUri = vscode.Uri.joinPath(folder, name)
        await this.findIgnoreFiles(root, dirUri)
      }
      if (name === '.copilotignore') {
        const fileUri = vscode.Uri.joinPath(folder, '.copilotignore')
        const localPatterns = await this.readIgnorePatterns(fileUri)
        if (localPatterns.length) {
          // These patterns are as read from the file. If file is in root of workspace, this is as expected.
          // If file is in a subfolder, we need to prefix appropriately.
          const relativePath = folder.fsPath.replace(root.fsPath, '').replace(/^\//, '')
          let patterns = ignore.default()
          patterns.add(localPatterns)
          this.log.info(`[findIgnoreFiles] relativePath ${relativePath} has ${localPatterns.length} patterns`)
          this.patterns.set(relativePath, patterns)
          this.count += localPatterns.length
        }
      }
    }
  }

  async fillPatterns() {
    try {
      this.count = 0
      this.patterns.clear()
      this.patterns.set("", ignore.default())

      if (vscode.workspace.workspaceFolders?.length) {
        for (const folder of vscode.workspace.workspaceFolders) {
          await this.findIgnoreFiles(folder.uri, folder.uri)
        }
      }

      if (process?.env?.HOME) {
        const fileUri = vscode.Uri.file(path.join(process.env.HOME, '.copilotignore'))
        const globalPatterns = await this.readIgnorePatterns(fileUri)
        if (globalPatterns.length) {
          this.patterns.get("")?.add(globalPatterns)
          this.count += globalPatterns.length
        }
      }

      this.log.info(`[fillPatterns] Collected patterns: ${this.count}`)
    } catch (e) {
      this.log.info(`[fillPatterns] Error: ${e}`)
      return []
    }
  }

  setCopilotStateBasedOnVisibleEditors(editors: readonly vscode.TextEditor[], notebooks: readonly vscode.NotebookEditor[]) {
    // Filter out the editors that are cells in notebooks

    const filesOpen = ([] as string[]).concat(
      editors.filter((editor) => editor.document.uri.scheme !== 'vscode-notebook-cell').map((editor) => vscode.workspace.asRelativePath(editor.document.uri)),
      notebooks.map((notebookEditor) => vscode.workspace.asRelativePath(notebookEditor.notebook.uri)),
    ).filter((filePath) => !this.isInvalidFile(filePath))

    if (filesOpen.length === 0) {
      return
    }

    let foundOpenIgnoredFile = false
    for (const filePath of filesOpen) {
      if (this.matchesAnyPattern(filePath)) {
        foundOpenIgnoredFile = true
        break
      }
    }

    this.log.info(`[setCopilotStateBasedOnVisibleEditors] New enabled state from files: ${!foundOpenIgnoredFile}`)
    this.setConfigEnabled(!foundOpenIgnoredFile)
  }

}

export function activate(context: vscode.ExtensionContext) {
  const extension = new Extension(context)
  extension.initialize()
  // vscode.commands.registerCommand('copilot-ignore', () => {
  //   extension.setConfigEnabled(false, 'command')
  // })
}

export function deactivate() { }

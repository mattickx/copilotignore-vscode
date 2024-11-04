import * as vscode from 'vscode'
import * as path from 'path'
import * as ignore from 'ignore'

const COPILOT_ENABLE_CONFIG = 'github.copilot.enable'
const COPILOT_EXTENSION_ID = 'GitHub.copilot'

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

    this.trigger = debounce(this._trigger.bind(this), 100)

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

      this.trigger('initialize')

      this.log.info(`[initialize] Initialized extension`)
    } catch (e) {
      this.log.info(`[initialize] Error: ${e}`)
    }
  }

  async _trigger(triggerName: string) {
    this.log.info(`----------------------------------------`)
    this.log.info(`[trigger] Triggered by: ${triggerName}`)
    if (this.count === 0) {
      this.log.info(`[trigger] Pattern count is 0. Copilot will be enabled in settings.`)
      await this.setConfigEnabled(true)
      return
    }
    this.setCopilotStateBasedOnVisibleEditors(vscode.window.visibleTextEditors, vscode.window.visibleNotebookEditors)
  }

  // Function to read ignore patterns from a file
  async readIgnorePatterns(fileUri: vscode.Uri): Promise<string[]> {
    const patterns: string[] = []
    try {
      this.log.info(`----------------------------------------`)
      this.log.info(`[readIgnorePatterns] Reading ignore patterns from: ${fileUri}`)
      const fileContent = await vscode.workspace.fs.readFile(fileUri)
      const text = new TextDecoder().decode(fileContent)
      let lines = text.split('\n')
      for (const line of lines) {
        // We need to skip whitespace only lines
        const pattern = line.trim()
        if (pattern) {
          patterns.push(pattern)
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
    let result = false
    try {
      if (this.isInvalidFile(filePath)) {
        return false
      }
      for (const [folder, patterns] of this.patterns) {
        if (filePath.startsWith(folder)) {
          result = patterns.test(filePath.replace(folder, '').replace(/^\//, '')).ignored
          if (result) {
            this.log.info(`[matchesAnyPattern] Does ${filePath}, from: ./${folder}, match: ${result}`)
            return result
          }
        }
      }
    } catch (e) {
      this.log.info(`[matchesAnyPattern] Error: ${e}`)
      return false
    }
    this.log.info(`[matchesAnyPattern] Does ${filePath} match: ${result}`)
    return result
  }

  // Main function to check and disable Copilot for the current workspace
  async setConfigEnabled(newStateEnabled: boolean): Promise<boolean> {
    let done = false
    try {
      done = await this.setConfigEnabledByExtension(newStateEnabled)
      if (!done) {
        done = await this.setConfigEnabledBySettings(newStateEnabled)
      }
    } catch (e) {
      this.log.info(`[setConfigEnabled] Error: ${e}`)
    }
    if (!newStateEnabled) {
      this.closeAllCopilotWindows()
    }
    this.refreshStatusBarCopilot()
    return done
  }

  async setConfigEnabledByExtension(newStateEnabled: boolean): Promise<boolean> {
    this.log.info(`[setConfigEnabledByExtension] Should Copilot be enabled: ${newStateEnabled}`)

    const copilot = vscode.extensions.getExtension(COPILOT_EXTENSION_ID)
    if (!copilot) {
      this.log.info(`[setConfigEnabledByExtension] Error: Copilot extension not found`)
      return false
    }

    try {
      const hasSetContext = typeof copilot?.exports?.setContext !== 'undefined'
      if (hasSetContext) {
        this.log.info(`[setConfigEnabledByExtension] Config set by setContext, new state: ${newStateEnabled}`)
        // @NOTE: This used to work till 10/2024, but it seems it might be broken since 11/2024
        // setContext is not available in the API anymore
        await copilot.exports.setContext('copilot:enabled', newStateEnabled)
        return true
      }
    } catch (e) {
      this.log.info(`[setConfigEnabledByExtension] Error: ${e}`)
    }
    this.log.info(`[setConfigEnabledByExtension] Config unable to set by extension`)
    return false
  }

  async setConfigEnabledBySettings(newStateEnabled: boolean): Promise<boolean> {
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

    this.log.info(`[setConfigEnabledBySettings] Should Copilot be enabled: ${newStateEnabled}`)
    try {
      this.log.info(`[setConfigEnabledBySettings] Config set by ConfigurationTarget.Global, new state: ${newStateEnabled}`)
      await config.update(COPILOT_ENABLE_CONFIG, newConfig, vscode.ConfigurationTarget.Global)
      return true
    } catch (e) {
      this.log.info(`[setConfigEnabledBySettings] Error: ${e}`)
    }
    this.log.info(`[setConfigEnabledBySettings] Config unable to set by extension`)
    return false
  }

  async closeAllCopilotWindows() {
    // @TODO: This does not work as intended
    //        This should close all panels/chats/suggestions related to copilot

    // await vscode.commands.executeCommand('workbench.action.chat.cancel')
    // await vscode.commands.executeCommand('workbench.action.quickchat.close')
    // await vscode.commands.executeCommand('inlineChat.close')

    // await vscode.commands.executeCommand('workbench.action.terminal.chat.cancel')
    // await vscode.commands.executeCommand('workbench.action.terminal.chat.discard')
    // await vscode.commands.executeCommand('workbench.action.terminal.chat.close')

    // await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.removeView')
    // await vscode.commands.executeCommand('workbench.panel.chat.view.edits.removeView')
    // await vscode.commands.executeCommand('workbench.chat.movedView.welcomeView.removeView')
  }

  async refreshStatusBarCopilot() {
    // @TODO: This does not work as intended
    //        This should refresh copilot icon state in the status bar, as it does not reflect the changes immediately 

    // await vscode.commands.executeCommand('workbench.extensions.action.refreshExtension', [COPILOT_EXTENSION_ID])
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

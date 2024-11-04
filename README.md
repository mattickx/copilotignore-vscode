# VSCode Copilot Ignore

This is my way of solving [Copilot Discussion #10305 .copilotignore support](https://github.com/orgs/community/discussions/10305) while waiting for official support.


## ℹ️ Description
The VSCode Copilot Ignore extension enhances your Visual Studio Code experience by allowing you to specify files and directories where GitHub Copilot should be disabled. This helps you customize the Copilot suggestions to only focus on code you want assistance with.


## ⚠️ Limitations

1. As soon as you your treeview contains a .copilotignore file, it's an all or nothing situation. If a match is found it will overwrite your **GLOBAL** copilot settings `github.copilot.enable` with all `false`/`true` value, be aware of this overwrite!

2. If you have a `github.copilot.enable` entry in your `workspace settings` or in `.vscode/settings.json`, that would take precedent meaning this extension will not work.


## ✅ Features
**Ignore file:** Create a .copilotignore file anywhere in open workspace to specify patterns of files and directories. Patterns will apply relative to where they are defined.
If the file of the active editor matches a pattern, Copilot will be disabled.
Works just like .gitignore but for copilot.

**Global file:** A global file can be used at `$HOME/.copilotignore`

**Reactive**: Changes made to the .copilotignore file(s) are immediately reflected.


# 📋 To do list

- [x] Create a working proof of concept for .copilotignore
- [x] Make .copilotignore file change trigger a reload of patterns
- [x] Usage should be compatible as .gitignore
- [x] Upload the extension to Visual Studio Code Marketplace.
- [ ] Add option to take into account files that are open, but not in active editor.
- [x] Make .copilotignore take into account it's own path/location (apply patterns recursive)


# ⚙️ Usage

- Install the [extension](https://marketplace.visualstudio.com/items?itemName=Mattickx.copilotignore-vscode) from the Visual Studio Code Marketplace.
- Reload the window with the `> Developer: Reload Window` command in VS Code to make sure.
- Create a .copilotignore file in **the root of your workspace**.
- Specify the file patterns, directories, or files that you want Copilot to ignore in the .copilotignore file.
- Save the file, and Copilot will adapt its suggestions accordingly.

The copilot icon should be crossed when copilot should be disabled.

Any configured Copilot Organisation/Repository Exclusion list(s) from Copilot Business should still take effect.


# 🔧 Build/Install from source

- Clone git repository
- Edit src/extension.ts as needed
- Run ``npm run install`` & ``npm run build``
- Install the copilotignore-X.X.X.vsix file through vscode (right click install Extension VSIX)
- Reload the window with the `> Developer: Reload Window` command in VS Code


# 🛠️ Debugging
For debugging an output channel with the name `Copilot Ignore` is available in the output tab of VS Code.


# 🤝 Contribute
Continuous improvement is encouraged and your contributions are valuable!

If you identify areas for improvement, have suggestions or encounter issues, please create a GitHub issue.


# 📜 License
This extension is licensed under the MIT License.

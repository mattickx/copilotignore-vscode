# VSCode Copilot Ignore

This is my way of solving [Copilot Discussion #10305 .copilotignore support](https://github.com/orgs/community/discussions/10305) while waiting for official support.

## ℹ️ Description
The VSCode Copilot Ignore extension enhances your Visual Studio Code experience by allowing you to specify files and directories where GitHub Copilot should be disabled. This helps you customize the Copilot suggestions to only focus on code you want assistance with.

## ⚠️ Limitations
Patterns of multiple .copilotignore files will simply be concatenated into one list of patterns.

Meaning the .copilotignore file does not work recursively based on its own path yet (like other .ignore files).

## ✅ Features
**Ignore file:** Create a .copilotignore file in the root of a workspace to specify patterns of files and directories.
If the file of the active editor matches a pattern, Copilot will be disabled.

**Reactive**: Changes made to the .copilotignore file(s) are immediately reflected.

# 📋 To do list

- [x] Create a working proof of concept for .copilotignore
- [x] Make .copilotignore file change trigger a reload of patterns
- [x] Usage should be compatible as .gitignore
- [x] Upload the extension to Visual Studio Code Marketplace.
- [ ] Add option to take into account files that are open, but not in active editor. 
- [ ] Make .copilotignore take into account it's own path/location (apply patterns recursive)

# ⚙️ Usage

- Install the [extension](https://marketplace.visualstudio.com/items?itemName=Mattickx.copilotignore-vscode) from the Visual Studio Code Marketplace.
- Create a .copilotignore file in **the root of your workspace**.
- Specify the file patterns, directories, or files that you want Copilot to ignore in the .copilotignore file.
- Save the file, and Copilot will adapt its suggestions accordingly.


# 🔧 Build/Install from source
- Clone git repository
- Edit src/extension.ts as needed
- Run ``npm run build``
- Install the copilotignore-X.X.X.vsix file through vscode (right click install Extension VSIX)

# 🤝 Contribute
Continuous improvement is encouraged and your contributions are valuable!

If you identify areas for improvement, have suggestions or encounter issues, please create a GitHub issue.

# 📜 License
This extension is licensed under the MIT License.

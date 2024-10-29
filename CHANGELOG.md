# Change Log

All notable changes to the "copilotignore" extension will be documented in this file.

## [0.1.7] - 2024-10-29

- Greatly improve functionallity of state change, by using the copilot extension context ([26b073f](https://github.com/mattickx/copilotignore-vscode/commit/26b073f5d103810695b75d39c03ddda070508bed))
- Fix trigger being called multiple times at once ([f2f40e1](https://github.com/mattickx/copilotignore-vscode/commit/f2f40e1ff227caa84c1650291120dbd0164bf932))
- Use vscode fs api for compatibility in remote environments ([#8](https://github.com/mattickx/copilotignore-vscode/pull/8/files))

## [0.1.6] - 2024-05-13

- Fix related to ipynb files ([#6](https://github.com/mattickx/copilotignore-vscode/pull/6/files) by @guzy0324)

## [0.1.5] - 2024-01-26

- Improve isInvalidFile logic
- Add documentation for the global .copilotignore file on systems (through the HOME env variable)

## [0.1.4] - 2024-01-25

- Add in a copy of copilot's default settings to avoid misbehaviour
- If 0 patterns are recognized, then enable copilot by default
- Add onStartupFinished in activationEvents
 
## [0.1.3] - 2024-01-24

- Make it use global vs code settings for copilot for multi root workspaces

## [0.1.2] - 2024-01-24

- Recalculation on delete of the .copilotignore file
- Refactor of the trigger function
- Better logging and debugging
- Improve docs

## [0.1.1] - 2023-01-24

- Refactor: Use `ignore` package for compatible usage like .gitignore files
- Removed dependency: `glob-to-regexp` 
- Fixes dependencies not included in production builds
- First working version on [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Mattickx.copilotignore-vscode)! 🎉

## [0.1.0] - 2023-01-23

- Initial release

# PropelAuth CLI Development Guide

## Build & Development Commands
```
npm run build        # Build the project (tsc + copy templates)
npm run dev          # Watch mode for development
npm run start        # Run the CLI after building
npm run prepublishOnly  # Build before publishing
```

## Code Style Guidelines
- **TypeScript**: Strict mode enabled, target ES2020, Node16 module system
- **Formatting**: 
  - Single quotes, no semicolons, 4-space indentation
  - 120 character line width, ES5 trailing commas
- **Imports**: Use explicit .js extensions in imports (ES modules)
- **Naming**: 
  - camelCase for variables, functions, and methods
  - PascalCase for interfaces, types, and classes
- **Error Handling**: Use try/catch blocks for file operations, handle cancelled user inputs
- **UI**: Use @clack/prompts for interactive CLI, picocolors for colored output

## Project Structure
- `src/commands/`: CLI command implementations
- `src/helpers/`: Utility functions and framework-specific code
- `src/types/`: TypeScript type definitions
- `templates/`: Template files for code generation
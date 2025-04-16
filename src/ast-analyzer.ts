/**
 * AST Analyzer
 * 
 * Provides Abstract Syntax Tree (AST) parsing and analysis capabilities
 * for different programming languages, enabling more accurate code analysis
 * than regex-based approaches.
 */

import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import * as babelParser from '@babel/parser';
import * as babelTypes from '@babel/types';
import { TypescriptParser } from '@typescript-eslint/typescript-estree';
import { Logger } from './types.js';
import { AstParseError, UnsupportedLanguageError, FileAccessError } from './errors.js';

// Import tree-sitter modules dynamically
let Parser: any;
let JavaScript: any;
let TypeScript: any;
let Python: any;

// Dynamically load tree-sitter modules
async function loadTreeSitter() {
  try {
    // Tree-sitter core
    const treeSitter = await import('tree-sitter');
    Parser = treeSitter.Parser;
    
    // Language grammars
    const jsGrammar = await import('tree-sitter-javascript');
    JavaScript = jsGrammar.default;
    
    const tsGrammar = await import('tree-sitter-typescript');
    TypeScript = tsGrammar.tsx;
    
    const pyGrammar = await import('tree-sitter-python');
    Python = pyGrammar.default;
  } catch (error) {
    console.warn('Tree-sitter modules could not be loaded. Falling back to Babel parser only.');
  }
}

// Try to load tree-sitter modules but don't block initialization
loadTreeSitter().catch(err => console.warn('Error loading tree-sitter:', err));

/**
 * Supported programming languages for AST analysis
 */
export enum ProgrammingLanguage {
  JavaScript = 'javascript',
  TypeScript = 'typescript',
  Python = 'python',
  Java = 'java',
  CSharp = 'csharp',
  Go = 'go',
  Ruby = 'ruby',
  PHP = 'php',
  Unknown = 'unknown'
}

/**
 * Options for AST parsing
 */
export interface AstParseOptions {
  language?: ProgrammingLanguage;  // Programming language (auto-detected if not specified)
  filePath?: string;               // File path (used for language detection)
  plugins?: string[];              // Babel parser plugins
  logger?: Logger;                 // Logger for operations
}

/**
 * Represents a code location in a file
 */
export interface CodeLocation {
  filePath: string;                // Path to the file
  startLine: number;               // Starting line number (1-based)
  endLine: number;                 // Ending line number (1-based)
  startColumn?: number;            // Starting column number (0-based)
  endColumn?: number;              // Ending column number (0-based)
}

/**
 * Component information extracted from AST
 */
export interface Component {
  name: string;                    // Component name
  type: string;                    // Component type (class, function, etc.)
  filePath: string;                // File path
  location: CodeLocation;          // Code location
  methods?: Method[];              // Methods (for class components)
  properties?: Property[];         // Properties (for class components)
  exports?: boolean;               // Whether the component is exported
  isDefault?: boolean;             // Whether it's a default export
  superClass?: string;             // Parent class (if any)
  interfaces?: string[];           // Implemented interfaces (if any)
  dependencies?: Import[];         // Dependencies (imports used by the component)
  framework?: string;              // Framework-specific information (React, Angular, etc.)
}

/**
 * Method information extracted from AST
 */
export interface Method {
  name: string;                    // Method name
  location: CodeLocation;          // Code location
  params: string[];                // Parameter names
  isAsync: boolean;                // Whether the method is async
  isStatic: boolean;               // Whether the method is static
  visibility?: string;             // Visibility (public, private, protected)
  returnType?: string;             // Return type (if available)
}

/**
 * Property information extracted from AST
 */
export interface Property {
  name: string;                    // Property name
  location: CodeLocation;          // Code location
  type?: string;                   // Property type (if available)
  initialValue?: string;           // Initial value (if available)
  isStatic: boolean;               // Whether the property is static
  visibility?: string;             // Visibility (public, private, protected)
}

/**
 * Import information extracted from AST
 */
export interface Import {
  source: string;                  // Import source
  defaultImport?: string;          // Default import name
  namedImports?: string[];         // Named imports
  namespaceImport?: string;        // Namespace import name
  location: CodeLocation;          // Code location
}

/**
 * Function information extracted from AST
 */
export interface Function {
  name: string;                    // Function name
  location: CodeLocation;          // Code location
  params: string[];                // Parameter names
  isAsync: boolean;                // Whether the function is async
  isExported: boolean;             // Whether the function is exported
  isDefault: boolean;              // Whether it's a default export
  returnType?: string;             // Return type (if available)
  dependencies?: Import[];         // Dependencies (imports used by the function)
}

/**
 * Class information extracted from AST
 */
export interface Class {
  name: string;                    // Class name
  location: CodeLocation;          // Code location
  methods: Method[];               // Methods
  properties: Property[];          // Properties
  isExported: boolean;             // Whether the class is exported
  isDefault: boolean;              // Whether it's a default export
  superClass?: string;             // Parent class (if any)
  interfaces?: string[];           // Implemented interfaces (if any)
  dependencies?: Import[];         // Dependencies (imports used by the class)
}

/**
 * Variable information extracted from AST
 */
export interface Variable {
  name: string;                    // Variable name
  location: CodeLocation;          // Code location
  type?: string;                   // Variable type (if available)
  initialValue?: string;           // Initial value (if available)
  isExported: boolean;             // Whether the variable is exported
  isConst: boolean;                // Whether the variable is constant
}

/**
 * AST analysis result for a file
 */
export interface AstAnalysisResult {
  filePath: string;                // File path
  language: ProgrammingLanguage;   // Programming language
  imports: Import[];               // Imports
  exports: string[];               // Exports
  components: Component[];         // Components
  functions: Function[];           // Functions
  classes: Class[];                // Classes
  variables: Variable[];           // Variables
  dependencies: string[];          // Dependencies (import sources)
  entryPoint?: boolean;            // Whether the file appears to be an entry point
  hasSideEffects?: boolean;        // Whether the file has side effects
  complexityScore?: number;        // Cyclomatic complexity score
}

/**
 * Detect programming language from file path or content
 */
export function detectLanguage(filePath: string, content?: string): ProgrammingLanguage {
  const ext = path.extname(filePath).toLowerCase();
  
  switch (ext) {
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return ProgrammingLanguage.JavaScript;
    
    case '.ts':
    case '.tsx':
    case '.mts':
    case '.cts':
      return ProgrammingLanguage.TypeScript;
    
    case '.py':
      return ProgrammingLanguage.Python;
    
    case '.java':
      return ProgrammingLanguage.Java;
    
    case '.cs':
      return ProgrammingLanguage.CSharp;
    
    case '.go':
      return ProgrammingLanguage.Go;
    
    case '.rb':
      return ProgrammingLanguage.Ruby;
    
    case '.php':
      return ProgrammingLanguage.PHP;
    
    default:
      // Try to detect from content if available
      if (content) {
        if (content.includes('import React') || content.includes('function Component') || content.includes('export default')) {
          // JavaScript/TypeScript heuristics
          if (content.includes('interface ') || content.includes(': string') || content.includes(': number')) {
            return ProgrammingLanguage.TypeScript;
          }
          return ProgrammingLanguage.JavaScript;
        }
        
        if (content.includes('def ') && content.includes('import ') && (content.includes('self') || content.includes('__init__'))) {
          return ProgrammingLanguage.Python;
        }
        
        if (content.includes('public class ') || content.includes('private class ')) {
          return ProgrammingLanguage.Java;
        }
      }
      
      return ProgrammingLanguage.Unknown;
  }
}

/**
 * Parse code into an AST using the appropriate parser
 */
export async function parseAst(code: string, options: AstParseOptions = {}): Promise<any> {
  const {
    language,
    filePath,
    plugins = [],
    logger
  } = options;
  
  // Detect language if not specified
  const detectedLanguage = language || (filePath ? detectLanguage(filePath) : ProgrammingLanguage.Unknown);
  
  try {
    switch (detectedLanguage) {
      case ProgrammingLanguage.JavaScript:
      case ProgrammingLanguage.TypeScript:
        // Use Babel parser for JS/TS
        const babelPlugins = [
          'jsx',
          'classProperties',
          'classPrivateProperties',
          'classPrivateMethods',
          'decorators-legacy',
          'dynamicImport',
          'optionalChaining',
          'nullishCoalescingOperator',
          ...plugins
        ];
        
        // Add TypeScript plugin for TS files
        if (detectedLanguage === ProgrammingLanguage.TypeScript) {
          babelPlugins.push('typescript');
        }
        
        return babelParser.parse(code, {
          sourceType: 'module',
          plugins: babelPlugins as any[]
        });
      
      case ProgrammingLanguage.Python:
        // Use tree-sitter for Python
        if (Parser && Python) {
          const parser = new Parser();
          parser.setLanguage(Python);
          return parser.parse(code);
        }
        throw new UnsupportedLanguageError('Python parser (tree-sitter) not available');
      
      // Add more languages here as needed
      
      default:
        throw new UnsupportedLanguageError(`Unsupported language: ${detectedLanguage}`);
    }
  } catch (error) {
    throw new AstParseError(`Failed to parse AST for ${filePath || detectedLanguage}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Parse multiple files into ASTs
 */
export async function parseFilesAst(filePaths: string[], options: AstParseOptions = {}): Promise<Map<string, any>> {
  const { logger } = options;
  const result = new Map<string, any>();
  
  for (const filePath of filePaths) {
    try {
      if (!existsSync(filePath)) {
        logger?.warn(`File not found: ${filePath}`);
        continue;
      }
      
      const content = await fs.readFile(filePath, 'utf-8');
      const language = detectLanguage(filePath, content);
      
      const ast = await parseAst(content, {
        ...options,
        language,
        filePath
      });
      
      result.set(filePath, ast);
    } catch (error) {
      logger?.error(`Error parsing file ${filePath}:`, error);
      // Continue with other files
    }
  }
  
  return result;
}

/**
 * Analyze AST for JavaScript/TypeScript
 */
export function analyzeJavaScriptAst(ast: any, filePath: string): AstAnalysisResult {
  const imports: Import[] = [];
  const exports: string[] = [];
  const components: Component[] = [];
  const functions: Function[] = [];
  const classes: Class[] = [];
  const variables: Variable[] = [];
  const dependencies: string[] = [];
  
  // Helper function to get code location
  function getLocation(node: any): CodeLocation {
    return {
      filePath,
      startLine: node.loc?.start?.line || 0,
      endLine: node.loc?.end?.line || 0,
      startColumn: node.loc?.start?.column || 0,
      endColumn: node.loc?.end?.column || 0
    };
  }
  
  // Find imports
  ast.program.body.forEach((node: any) => {
    if (babelTypes.isImportDeclaration(node)) {
      const importInfo: Import = {
        source: node.source.value,
        location: getLocation(node),
        namedImports: []
      };
      
      if (!dependencies.includes(node.source.value)) {
        dependencies.push(node.source.value);
      }
      
      // Process import specifiers
      node.specifiers.forEach((specifier: any) => {
        if (babelTypes.isImportDefaultSpecifier(specifier)) {
          importInfo.defaultImport = specifier.local.name;
        } else if (babelTypes.isImportNamespaceSpecifier(specifier)) {
          importInfo.namespaceImport = specifier.local.name;
        } else if (babelTypes.isImportSpecifier(specifier)) {
          importInfo.namedImports = importInfo.namedImports || [];
          importInfo.namedImports.push(specifier.local.name);
        }
      });
      
      imports.push(importInfo);
    }
    
    // Find exports
    else if (babelTypes.isExportNamedDeclaration(node)) {
      if (node.declaration) {
        if (babelTypes.isFunctionDeclaration(node.declaration) && node.declaration.id) {
          exports.push(node.declaration.id.name);
        } else if (babelTypes.isClassDeclaration(node.declaration) && node.declaration.id) {
          exports.push(node.declaration.id.name);
        } else if (babelTypes.isVariableDeclaration(node.declaration)) {
          node.declaration.declarations.forEach((decl: any) => {
            if (decl.id && babelTypes.isIdentifier(decl.id)) {
              exports.push(decl.id.name);
            }
          });
        }
      }
      
      // Named exports
      if (node.specifiers) {
        node.specifiers.forEach((specifier: any) => {
          if (babelTypes.isExportSpecifier(specifier)) {
            exports.push(specifier.exported.name);
          }
        });
      }
    } else if (babelTypes.isExportDefaultDeclaration(node)) {
      if (node.declaration) {
        if (babelTypes.isFunctionDeclaration(node.declaration) && node.declaration.id) {
          exports.push(`default (${node.declaration.id.name})`);
        } else if (babelTypes.isClassDeclaration(node.declaration) && node.declaration.id) {
          exports.push(`default (${node.declaration.id.name})`);
        } else {
          exports.push('default');
        }
      }
    }
    
    // Find classes
    else if (babelTypes.isClassDeclaration(node) || 
            (babelTypes.isExportDefaultDeclaration(node) && 
             babelTypes.isClassDeclaration(node.declaration))) {
      const classNode = babelTypes.isExportDefaultDeclaration(node) ? node.declaration : node;
      const isExported = babelTypes.isExportDefaultDeclaration(node) || 
                        (babelTypes.isExportNamedDeclaration(node.parent) && 
                         node.parent.declaration === node);
      
      if (!classNode.id) {
        return; // Skip anonymous classes
      }
      
      const classInfo: Class = {
        name: classNode.id.name,
        location: getLocation(classNode),
        methods: [],
        properties: [],
        isExported,
        isDefault: babelTypes.isExportDefaultDeclaration(node)
      };
      
      // Check if it's a component
      const isComponent = 
        // React class component
        (classNode.superClass && 
         ((babelTypes.isIdentifier(classNode.superClass) && classNode.superClass.name === 'Component') || 
          (babelTypes.isMemberExpression(classNode.superClass) && 
           babelTypes.isIdentifier(classNode.superClass.object) && 
           classNode.superClass.object.name === 'React' &&
           babelTypes.isIdentifier(classNode.superClass.property) && 
           classNode.superClass.property.name === 'Component'))) ||
        // Or has render method
        classNode.body.body.some((member: any) => 
          babelTypes.isClassMethod(member) && 
          babelTypes.isIdentifier(member.key) && 
          member.key.name === 'render'
        );
      
      // Process class methods
      classNode.body.body.forEach((member: any) => {
        if (babelTypes.isClassMethod(member)) {
          const methodInfo: Method = {
            name: babelTypes.isIdentifier(member.key) ? member.key.name : 
                 babelTypes.isStringLiteral(member.key) ? member.key.value : 'unknown',
            location: getLocation(member),
            params: member.params.map((param: any) => 
              babelTypes.isIdentifier(param) ? param.name : 'unknown'
            ),
            isAsync: member.async,
            isStatic: member.static,
            visibility: member.accessibility || 
                       (member.key.name.startsWith('#') ? 'private' : 
                        member.key.name.startsWith('_') ? 'protected' : 'public')
          };
          
          classInfo.methods.push(methodInfo);
        } else if (babelTypes.isClassProperty(member)) {
          const propertyInfo: Property = {
            name: babelTypes.isIdentifier(member.key) ? member.key.name : 
                 babelTypes.isStringLiteral(member.key) ? member.key.value : 'unknown',
            location: getLocation(member),
            isStatic: member.static,
            visibility: member.accessibility || 
                       (member.key.name.startsWith('#') ? 'private' : 
                        member.key.name.startsWith('_') ? 'protected' : 'public')
          };
          
          if (member.value) {
            propertyInfo.initialValue = member.value.type;
          }
          
          classInfo.properties.push(propertyInfo);
        }
      });
      
      // Add class to results
      classes.push(classInfo);
      
      // If it's a component, add to components
      if (isComponent) {
        components.push({
          name: classInfo.name,
          type: 'class',
          filePath,
          location: classInfo.location,
          methods: classInfo.methods,
          properties: classInfo.properties,
          exports: isExported,
          isDefault: classInfo.isDefault,
          superClass: classNode.superClass ? 
            (babelTypes.isIdentifier(classNode.superClass) ? classNode.superClass.name : 
             babelTypes.isMemberExpression(classNode.superClass) ? 
              `${babelTypes.isIdentifier(classNode.superClass.object) ? classNode.superClass.object.name : ''}.${
                babelTypes.isIdentifier(classNode.superClass.property) ? classNode.superClass.property.name : ''
              }` : 
              'unknown') : 
            undefined,
          framework: 'React'
        });
      }
    }
    
    // Find functions
    else if (babelTypes.isFunctionDeclaration(node) || 
            (babelTypes.isExportDefaultDeclaration(node) && 
             babelTypes.isFunctionDeclaration(node.declaration))) {
      const funcNode = babelTypes.isExportDefaultDeclaration(node) ? node.declaration : node;
      const isExported = babelTypes.isExportDefaultDeclaration(node) || 
                        (babelTypes.isExportNamedDeclaration(node.parent) && 
                         node.parent.declaration === node);
      
      if (!funcNode.id) {
        return; // Skip anonymous functions
      }
      
      const funcInfo: Function = {
        name: funcNode.id.name,
        location: getLocation(funcNode),
        params: funcNode.params.map((param: any) => 
          babelTypes.isIdentifier(param) ? param.name : 
          babelTypes.isAssignmentPattern(param) && babelTypes.isIdentifier(param.left) ? param.left.name : 
          'unknown'
        ),
        isAsync: funcNode.async,
        isExported,
        isDefault: babelTypes.isExportDefaultDeclaration(node)
      };
      
      // Check if it's a React functional component
      const isComponent = 
        // Has JSX return
        funcNode.body && babelTypes.isBlockStatement(funcNode.body) && 
        funcNode.body.body.some((statement: any) => 
          babelTypes.isReturnStatement(statement) && 
          statement.argument && 
          (babelTypes.isJSXElement(statement.argument) || 
           babelTypes.isJSXFragment(statement.argument))
        ) ||
        // Or has Component-like name (PascalCase)
        funcNode.id.name.match(/^[A-Z][A-Za-z0-9]*$/) && 
        // And at least one import from React
        imports.some(imp => imp.source === 'react');
      
      // Add function to results
      functions.push(funcInfo);
      
      // If it's a component, add to components
      if (isComponent) {
        components.push({
          name: funcInfo.name,
          type: 'function',
          filePath,
          location: funcInfo.location,
          exports: isExported,
          isDefault: funcInfo.isDefault,
          framework: 'React'
        });
      }
    }
    
    // Find variables (especially arrow function components)
    else if (babelTypes.isVariableDeclaration(node) ||
            (babelTypes.isExportNamedDeclaration(node) && 
             babelTypes.isVariableDeclaration(node.declaration))) {
      const varNode = babelTypes.isExportNamedDeclaration(node) ? node.declaration : node;
      const isExported = babelTypes.isExportNamedDeclaration(node);
      
      varNode.declarations.forEach((decl: any) => {
        if (!decl.id || !babelTypes.isIdentifier(decl.id)) {
          return; // Skip destructuring or other complex patterns
        }
        
        const variableInfo: Variable = {
          name: decl.id.name,
          location: getLocation(decl),
          isExported,
          isConst: varNode.kind === 'const'
        };
        
        if (decl.init) {
          variableInfo.initialValue = decl.init.type;
          
          // Check for arrow function components
          const isArrowComponent = 
            // Arrow function that returns JSX
            (babelTypes.isArrowFunctionExpression(decl.init) && 
             ((babelTypes.isBlockStatement(decl.init.body) && 
               decl.init.body.body.some((statement: any) => 
                 babelTypes.isReturnStatement(statement) && 
                 statement.argument && 
                 (babelTypes.isJSXElement(statement.argument) || 
                  babelTypes.isJSXFragment(statement.argument))
               )) || 
              (babelTypes.isJSXElement(decl.init.body) || 
               babelTypes.isJSXFragment(decl.init.body)))) &&
            // And has Component-like name (PascalCase)
            decl.id.name.match(/^[A-Z][A-Za-z0-9]*$/);
          
          if (isArrowComponent) {
            components.push({
              name: decl.id.name,
              type: 'arrow-function',
              filePath,
              location: getLocation(decl),
              exports: isExported,
              isDefault: false,
              framework: 'React'
            });
          }
        }
        
        variables.push(variableInfo);
      });
    }
  });
  
  // Check if file is potentially an entry point
  const isEntryPoint = 
    // Common entry point filenames
    ['index', 'main', 'app', 'server'].includes(path.basename(filePath, path.extname(filePath))) ||
    // Contains app startup code
    (code.includes('ReactDOM.render') || 
     code.includes('createRoot') || 
     code.includes('app.listen') || 
     code.includes('new Express') || 
     code.includes('new Koa') || 
     code.includes('new Application'));
  
  // Calculate cyclomatic complexity (very basic)
  const complexityIndicators = [
    /if\s*\(/g,
    /else\s+if/g,
    /for\s*\(/g,
    /while\s*\(/g,
    /case\s+/g,
    /catch\s*\(/g,
    /&&/g,
    /\|\|/g,
    /\?\s*./g
  ];
  
  let complexityScore = 1; // Start with 1
  for (const pattern of complexityIndicators) {
    const matches = code.match(pattern);
    if (matches) {
      complexityScore += matches.length;
    }
  }
  
  return {
    filePath,
    language: filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? 
      ProgrammingLanguage.TypeScript : 
      ProgrammingLanguage.JavaScript,
    imports,
    exports,
    components,
    functions,
    classes,
    variables,
    dependencies,
    entryPoint: isEntryPoint,
    complexityScore
  };
}

/**
 * Analyze AST for Python
 */
export function analyzePythonAst(ast: any, filePath: string, code: string): AstAnalysisResult {
  // Tree-sitter AST node visitor
  function visitNode(node: any, visitor: (node: any, parentNode: any) => void, parentNode: any = null) {
    visitor(node, parentNode);
    
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        visitNode(child, visitor, node);
      }
    }
  }
  
  // Initialize empty result structures
  const imports: Import[] = [];
  const exports: string[] = [];
  const components: Component[] = [];
  const functions: Function[] = [];
  const classes: Class[] = [];
  const variables: Variable[] = [];
  const dependencies: string[] = [];
  
  // Helper function for tree-sitter code location
  function getLocation(node: any): CodeLocation {
    // Tree-sitter uses 0-based line and column numbers
    return {
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      startColumn: node.startPosition.column,
      endColumn: node.endPosition.column
    };
  }
  
  // Visit the tree-sitter AST
  visitNode(ast.rootNode, (node, parentNode) => {
    // Import statements
    if (node.type === 'import_statement') {
      const importInfo: Import = {
        source: code.substring(node.startPosition.index, node.endPosition.index).replace('import ', '').trim(),
        location: getLocation(node),
        namedImports: []
      };
      
      // Extract the module name
      const moduleNameNode = node.children.find((child: any) => child.type === 'dotted_name');
      if (moduleNameNode) {
        const moduleName = code.substring(moduleNameNode.startPosition.index, moduleNameNode.endPosition.index).trim();
        importInfo.source = moduleName;
        
        if (!dependencies.includes(moduleName)) {
          dependencies.push(moduleName);
        }
      }
      
      imports.push(importInfo);
    }
    
    // Import from statements
    else if (node.type === 'import_from_statement') {
      const importInfo: Import = {
        source: '',
        location: getLocation(node),
        namedImports: []
      };
      
      // Extract the module name
      const moduleNode = node.children.find((child: any) => child.type === 'dotted_name');
      if (moduleNode) {
        const moduleName = code.substring(moduleNode.startPosition.index, moduleNode.endPosition.index).trim();
        importInfo.source = moduleName;
        
        if (!dependencies.includes(moduleName)) {
          dependencies.push(moduleName);
        }
      }
      
      // Extract named imports
      const namedImportsNode = node.children.find((child: any) => child.type === 'import_items');
      if (namedImportsNode) {
        namedImportsNode.children.forEach((child: any) => {
          if (child.type === 'identifier') {
            const name = code.substring(child.startPosition.index, child.endPosition.index).trim();
            if (name && !name.includes(',')) {
              importInfo.namedImports?.push(name);
            }
          }
        });
      }
      
      imports.push(importInfo);
    }
    
    // Class definitions
    else if (node.type === 'class_definition') {
      const nameNode = node.children.find((child: any) => child.type === 'identifier');
      if (!nameNode) return;
      
      const className = code.substring(nameNode.startPosition.index, nameNode.endPosition.index).trim();
      
      const classInfo: Class = {
        name: className,
        location: getLocation(node),
        methods: [],
        properties: [],
        isExported: true, // In Python, all declarations are "exported"
        isDefault: false // No default exports in Python
      };
      
      // Find all methods in the class
      node.children.forEach((child: any) => {
        if (child.type === 'block') {
          child.children.forEach((blockChild: any) => {
            if (blockChild.type === 'function_definition') {
              const methodNameNode = blockChild.children.find((c: any) => c.type === 'identifier');
              if (methodNameNode) {
                const methodName = code.substring(methodNameNode.startPosition.index, methodNameNode.endPosition.index).trim();
                
                // Find parameters
                const params: string[] = [];
                const paramListNode = blockChild.children.find((c: any) => c.type === 'parameters');
                if (paramListNode) {
                  paramListNode.children.forEach((paramNode: any) => {
                    if (paramNode.type === 'identifier') {
                      const paramName = code.substring(paramNode.startPosition.index, paramNode.endPosition.index).trim();
                      params.push(paramName);
                    }
                  });
                }
                
                const methodInfo: Method = {
                  name: methodName,
                  location: getLocation(blockChild),
                  params,
                  isAsync: blockChild.children.some((c: any) => c.type === 'async'),
                  isStatic: methodName.startsWith('static_') || 
                           blockChild.children.some((c: any) => {
                             if (c.type === 'decorator') {
                               const decoratorText = code.substring(c.startPosition.index, c.endPosition.index);
                               return decoratorText.includes('@staticmethod') || decoratorText.includes('@classmethod');
                             }
                             return false;
                           }),
                  visibility: methodName.startsWith('_') ? 
                             (methodName.startsWith('__') ? 'private' : 'protected') : 
                             'public'
                };
                
                classInfo.methods.push(methodInfo);
              }
            }
          });
        }
      });
      
      // Check if it's a Django model or other framework component
      const isDjangoModel = 
        // Inherits from models.Model
        node.children.some((child: any) => {
          if (child.type === 'argument_list') {
            const inheritText = code.substring(child.startPosition.index, child.endPosition.index);
            return inheritText.includes('models.Model') || 
                  inheritText.includes('Model') || 
                  inheritText.includes('ModelForm');
          }
          return false;
        }) ||
        // Has model-like methods
        classInfo.methods.some(method => 
          ['save', 'delete', 'get_absolute_url', 'clean', 'validate_unique'].includes(method.name)
        );
      
      const isFlaskView = 
        // Has route decorators or methods
        node.children.some((child: any) => {
          if (child.type === 'decorator') {
            const decoratorText = code.substring(child.startPosition.index, child.endPosition.index);
            return decoratorText.includes('@app.route') || 
                  decoratorText.includes('@blueprint.route');
          }
          return false;
        }) ||
        // Has view-like methods
        classInfo.methods.some(method => 
          ['get', 'post', 'put', 'delete', 'dispatch'].includes(method.name)
        );
      
      // Add class to results
      classes.push(classInfo);
      
      // If it's a component, add to components
      if (isDjangoModel || isFlaskView) {
        components.push({
          name: className,
          type: 'class',
          filePath,
          location: classInfo.location,
          methods: classInfo.methods,
          properties: classInfo.properties,
          exports: true,
          framework: isDjangoModel ? 'Django' : 'Flask'
        });
      }
    }
    
    // Function definitions
    else if (node.type === 'function_definition' && parentNode?.type !== 'class_definition') {
      const nameNode = node.children.find((child: any) => child.type === 'identifier');
      if (!nameNode) return;
      
      const functionName = code.substring(nameNode.startPosition.index, nameNode.endPosition.index).trim();
      
      // Find parameters
      const params: string[] = [];
      const paramListNode = node.children.find((c: any) => c.type === 'parameters');
      if (paramListNode) {
        paramListNode.children.forEach((paramNode: any) => {
          if (paramNode.type === 'identifier') {
            const paramName = code.substring(paramNode.startPosition.index, paramNode.endPosition.index).trim();
            params.push(paramName);
          }
        });
      }
      
      const funcInfo: Function = {
        name: functionName,
        location: getLocation(node),
        params,
        isAsync: node.children.some((c: any) => c.type === 'async'),
        isExported: true, // In Python, all declarations are "exported"
        isDefault: false // No default exports in Python
      };
      
      // Add function to results
      functions.push(funcInfo);
      
      // Check if it's a view function
      const isViewFunction =
        // Has route decorators
        node.children.some((child: any) => {
          if (child.type === 'decorator') {
            const decoratorText = code.substring(child.startPosition.index, child.endPosition.index);
            return decoratorText.includes('@app.route') || 
                   decoratorText.includes('@blueprint.route');
          }
          return false;
        }) ||
        // Returns a Response or render
        code.substring(node.startPosition.index, node.endPosition.index).includes('return render') ||
        code.substring(node.startPosition.index, node.endPosition.index).includes('return Response') ||
        code.substring(node.startPosition.index, node.endPosition.index).includes('return JsonResponse');
      
      if (isViewFunction) {
        components.push({
          name: functionName,
          type: 'function',
          filePath,
          location: funcInfo.location,
          exports: true,
          framework: 'Flask'
        });
      }
    }
  });
  
  // Check if file is potentially an entry point
  const isEntryPoint = 
    // Common entry point filenames
    ['__main__', 'app', 'server', 'wsgi', 'asgi', 'manage'].includes(path.basename(filePath, path.extname(filePath))) ||
    // Contains app startup code
    (code.includes('if __name__ == "__main__"') || 
     code.includes("if __name__ == '__main__'") || 
     code.includes('app = Flask') || 
     code.includes('app.run(') || 
     code.includes('application = get_wsgi_application()'));
  
  // Calculate cyclomatic complexity (very basic)
  const complexityIndicators = [
    /if\s+/g,
    /elif\s+/g,
    /for\s+/g,
    /while\s+/g,
    /except\s+/g,
    /and\s+/g,
    /or\s+/g
  ];
  
  let complexityScore = 1; // Start with 1
  for (const pattern of complexityIndicators) {
    const matches = code.match(pattern);
    if (matches) {
      complexityScore += matches.length;
    }
  }
  
  return {
    filePath,
    language: ProgrammingLanguage.Python,
    imports,
    exports,
    components,
    functions,
    classes,
    variables,
    dependencies,
    entryPoint: isEntryPoint,
    complexityScore
  };
}

/**
 * Analyze AST for any supported language
 */
export async function analyzeAst(ast: any, filePath: string, code: string): Promise<AstAnalysisResult> {
  const language = detectLanguage(filePath, code);
  
  switch (language) {
    case ProgrammingLanguage.JavaScript:
    case ProgrammingLanguage.TypeScript:
      return analyzeJavaScriptAst(ast, filePath);
    
    case ProgrammingLanguage.Python:
      return analyzePythonAst(ast, filePath, code);
    
    default:
      throw new UnsupportedLanguageError(`Language analysis not supported for ${language}`);
  }
}

/**
 * Analyze a file using AST
 */
export async function analyzeFile(filePath: string, options: AstParseOptions = {}): Promise<AstAnalysisResult> {
  const { logger } = options;
  
  try {
    if (!existsSync(filePath)) {
      throw new FileAccessError(`File not found: ${filePath}`);
    }
    
    const content = await fs.readFile(filePath, 'utf-8');
    const language = detectLanguage(filePath, content);
    
    const ast = await parseAst(content, {
      ...options,
      language,
      filePath
    });
    
    return await analyzeAst(ast, filePath, content);
  } catch (error) {
    logger?.error(`Error analyzing file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Analyze multiple files using AST
 */
export async function analyzeFiles(filePaths: string[], options: AstParseOptions = {}): Promise<AstAnalysisResult[]> {
  const { logger } = options;
  const results: AstAnalysisResult[] = [];
  
  for (const filePath of filePaths) {
    try {
      const result = await analyzeFile(filePath, options);
      results.push(result);
    } catch (error) {
      logger?.error(`Error analyzing file ${filePath}:`, error);
      // Continue with other files
    }
  }
  
  return results;
}

/**
 * Detect dependencies between components based on AST analysis
 */
export function detectComponentDependencies(results: AstAnalysisResult[]): Map<string, string[]> {
  const dependencies = new Map<string, string[]>();
  
  // Create a map of exports to their file paths
  const exportMap = new Map<string, string>();
  for (const result of results) {
    for (const exportName of result.exports) {
      // Handle default exports - normalize them to the filename
      if (exportName === 'default') {
        const fileName = path.basename(result.filePath, path.extname(result.filePath));
        exportMap.set(fileName, result.filePath);
      } else if (exportName.startsWith('default (')) {
        // Handle named default exports
        const name = exportName.substring(9, exportName.length - 1);
        exportMap.set(name, result.filePath);
      } else {
        exportMap.set(exportName, result.filePath);
      }
    }
    
    // Add components to the export map
    for (const component of result.components) {
      exportMap.set(component.name, result.filePath);
    }
  }
  
  // Iterate through all results and find dependencies
  for (const result of results) {
    const fileDependencies: string[] = [];
    
    // Check imports
    for (const importInfo of result.imports) {
      // Handle relative imports
      if (importInfo.source.startsWith('.')) {
        const basePath = path.dirname(result.filePath);
        const normalizedPath = path.normalize(path.join(basePath, importInfo.source));
        
        // Check if this imports a file we've analyzed
        for (const other of results) {
          const otherDir = path.dirname(other.filePath);
          const otherBase = path.basename(other.filePath, path.extname(other.filePath));
          
          // Exact file match
          if (normalizedPath === other.filePath || 
              `${normalizedPath}.js` === other.filePath ||
              `${normalizedPath}.jsx` === other.filePath ||
              `${normalizedPath}.ts` === other.filePath ||
              `${normalizedPath}.tsx` === other.filePath ||
              `${normalizedPath}.py` === other.filePath) {
            fileDependencies.push(other.filePath);
          }
          // Directory import (index file)
          else if (normalizedPath === otherDir && otherBase === 'index') {
            fileDependencies.push(other.filePath);
          }
        }
      }
      // Handle named exports via import specifiers
      else if (importInfo.defaultImport && exportMap.has(importInfo.defaultImport)) {
        fileDependencies.push(exportMap.get(importInfo.defaultImport)!);
      } else if (importInfo.namedImports) {
        for (const namedImport of importInfo.namedImports) {
          if (exportMap.has(namedImport)) {
            fileDependencies.push(exportMap.get(namedImport)!);
          }
        }
      }
    }
    
    // Remove duplicates and self-references
    dependencies.set(result.filePath, [...new Set(fileDependencies)].filter(dep => dep !== result.filePath));
  }
  
  return dependencies;
}

/**
 * Detect design patterns based on AST analysis
 */
export function detectDesignPatterns(results: AstAnalysisResult[]): Record<string, any[]> {
  const patterns: Record<string, any[]> = {
    singleton: [],
    factory: [],
    observer: [],
    strategy: [],
    adapter: [],
    repository: [],
    provider: []
  };
  
  // Helper function to find class by name
  function findClass(className: string): Class | undefined {
    for (const result of results) {
      for (const cls of result.classes) {
        if (cls.name === className) {
          return cls;
        }
      }
    }
    return undefined;
  }
  
  // Analyze each file
  for (const result of results) {
    // Check for Singleton pattern
    for (const cls of result.classes) {
      // Singleton: private constructor, static instance, getInstance method
      const hasPrivateConstructor = cls.methods.some(m => 
        m.name === 'constructor' && (m.visibility === 'private' || m.name.startsWith('#'))
      );
      
      const hasStaticInstance = cls.properties.some(p => 
        p.isStatic && (p.name.includes('instance') || p.name.includes('Instance'))
      );
      
      const hasGetInstanceMethod = cls.methods.some(m => 
        m.isStatic && (m.name === 'getInstance' || m.name === 'get_instance')
      );
      
      if (hasPrivateConstructor || (hasStaticInstance && hasGetInstanceMethod)) {
        patterns.singleton.push({
          name: cls.name,
          filePath: result.filePath,
          pattern: 'Singleton',
          confidence: hasPrivateConstructor && hasStaticInstance && hasGetInstanceMethod ? 0.9 : 0.7
        });
      }
      
      // Factory pattern: create or factory methods that return instances
      const hasFactoryMethods = cls.methods.some(m => 
        (m.name.includes('create') || m.name.includes('Create') || 
         m.name.includes('factory') || m.name.includes('Factory') || 
         m.name.includes('build') || m.name.includes('Build') || 
         m.name.includes('new') || m.name.includes('New')) && 
        !m.name.match(/^(set|get)/)
      );
      
      if (hasFactoryMethods || cls.name.match(/(Factory|Builder|Provider)$/)) {
        patterns.factory.push({
          name: cls.name,
          filePath: result.filePath,
          pattern: 'Factory',
          confidence: cls.name.match(/(Factory|Builder)$/) ? 0.8 : 0.6
        });
      }
      
      // Observer pattern: subscribe/unsubscribe methods or event listeners
      const hasObserverMethods = cls.methods.some(m => 
        m.name.match(/^(on|add|remove|notify|subscribe|unsubscribe|attach|detach|addListener|removeListener)/)
      );
      
      const hasListenerProperties = cls.properties.some(p => 
        p.name.match(/(listeners|observers|handlers|subscribers|events|callbacks)/)
      );
      
      if (hasObserverMethods && hasListenerProperties) {
        patterns.observer.push({
          name: cls.name,
          filePath: result.filePath,
          pattern: 'Observer',
          confidence: 0.7
        });
      }
      
      // Strategy pattern: interface/class with multiple implementations
      if (cls.superClass || (cls.interfaces && cls.interfaces.length > 0)) {
        // Check if this class is extended by others
        let implementations = 0;
        for (const otherResult of results) {
          for (const otherCls of otherResult.classes) {
            if (otherCls.superClass === cls.name) {
              implementations++;
            }
          }
        }
        
        if (implementations >= 2 || 
            // Or has Strategy in the name
            cls.name.match(/(Strategy|Policy)($|[A-Z])/) ||
            // Or Behavior/Algorithm in the name
            cls.name.match(/(Behavior|Algorithm|Handler|Processor)($|[A-Z])/)) {
          patterns.strategy.push({
            name: cls.name,
            filePath: result.filePath,
            pattern: 'Strategy',
            confidence: cls.name.includes('Strategy') ? 0.8 : 0.6,
            implementations
          });
        }
      }
      
      // Repository pattern
      if (cls.name.match(/(Repository|DAO|Store)($|[A-Z])/) || 
          cls.methods.some(m => m.name.match(/^(find|get|save|delete|update)/))) {
        patterns.repository.push({
          name: cls.name,
          filePath: result.filePath,
          pattern: 'Repository',
          confidence: cls.name.includes('Repository') ? 0.9 : 0.7
        });
      }
      
      // Provider pattern
      if (cls.name.match(/(Provider|Service|Manager)($|[A-Z])/) || 
          cls.methods.some(m => m.name.match(/^(provide|get|create|retrieve)/))) {
        patterns.provider.push({
          name: cls.name,
          filePath: result.filePath,
          pattern: 'Provider',
          confidence: cls.name.includes('Provider') ? 0.9 : 0.7
        });
      }
    }
    
    // Adapter pattern: class that wraps another class or API
    for (const cls of result.classes) {
      if (cls.name.match(/(Adapter|Wrapper)($|[A-Z])/) || 
          (cls.properties.some(p => p.name.match(/(wrapped|original|adaptee|target)/)) && 
           cls.methods.length > 0)) {
        patterns.adapter.push({
          name: cls.name,
          filePath: result.filePath,
          pattern: 'Adapter',
          confidence: cls.name.includes('Adapter') ? 0.9 : 0.7
        });
      }
    }
  }
  
  return patterns;
}

/**
 * Detect security issues based on AST analysis
 */
export function detectSecurityIssues(results: AstAnalysisResult[]): any[] {
  const issues: any[] = [];
  
  // TODO: Implement security issue detection with AST
  // This requires more complex traversal of the AST and tracking variable usage
  
  return issues;
}

/**
 * Detect performance issues based on AST analysis
 */
export function detectPerformanceIssues(results: AstAnalysisResult[]): any[] {
  const issues: any[] = [];
  
  // TODO: Implement performance issue detection with AST
  // This requires more complex traversal of the AST and identifying common patterns
  
  return issues;
}

/**
 * Get component information for the repository
 */
export function getRepositoryComponents(results: AstAnalysisResult[]): Component[] {
  const components: Component[] = [];
  
  for (const result of results) {
    components.push(...result.components);
  }
  
  return components;
}

/**
 * Get dependency graph for the repository
 */
export function getRepositoryDependencyGraph(results: AstAnalysisResult[]): Record<string, string[]> {
  const dependencies = detectComponentDependencies(results);
  const graph: Record<string, string[]> = {};
  
  for (const [filePath, deps] of dependencies.entries()) {
    graph[filePath] = deps;
  }
  
  return graph;
}

/**
 * Get entry points for the repository
 */
export function getRepositoryEntryPoints(results: AstAnalysisResult[]): string[] {
  const entryPoints: string[] = [];
  
  for (const result of results) {
    if (result.entryPoint) {
      entryPoints.push(result.filePath);
    }
  }
  
  return entryPoints;
}

/**
 * Analyze a repository using AST
 */
export async function analyzeRepository(
  directory: string,
  options: AstParseOptions & { 
    fileExtensions?: string[];
    maxFiles?: number;
    logger?: Logger;
  } = {}
): Promise<{
  components: Component[];
  dependencyGraph: Record<string, string[]>;
  entryPoints: string[];
  patterns: Record<string, any[]>;
  securityIssues: any[];
  performanceIssues: any[];
  highComplexityFiles: { filePath: string; complexity: number }[];
}> {
  const { 
    fileExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py'],
    maxFiles = 500,
    logger
  } = options;
  
  // Find all files with specified extensions
  const allFiles: string[] = [];
  
  async function collectFiles(dir: string, depth = 0) {
    // Skip node_modules, dist, build directories
    if (dir.includes('node_modules') || 
        dir.includes('dist') || 
        dir.includes('build') || 
        dir.includes('.git') ||
        dir.includes('__pycache__')) {
      return;
    }
    
    // Stop if we have enough files
    if (allFiles.length >= maxFiles) {
      return;
    }
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await collectFiles(fullPath, depth + 1);
        } else if (entry.isFile() && fileExtensions.some(ext => entry.name.endsWith(ext))) {
          allFiles.push(fullPath);
          
          // Stop if we have enough files
          if (allFiles.length >= maxFiles) {
            logger?.info(`Reached maximum file count (${maxFiles}), stopping file collection`);
            return;
          }
        }
      }
    } catch (error) {
      logger?.error(`Error collecting files from ${dir}:`, error);
    }
  }
  
  logger?.info(`Starting file collection in ${directory}`);
  await collectFiles(directory);
  logger?.info(`Found ${allFiles.length} files to analyze`);
  
  // Analyze files
  const results = await analyzeFiles(allFiles, options);
  logger?.info(`Analyzed ${results.length} files`);
  
  // Extract repository information
  const components = getRepositoryComponents(results);
  const dependencyGraph = getRepositoryDependencyGraph(results);
  const entryPoints = getRepositoryEntryPoints(results);
  const patterns = detectDesignPatterns(results);
  const securityIssues = detectSecurityIssues(results);
  const performanceIssues = detectPerformanceIssues(results);
  
  // Find high complexity files
  const highComplexityFiles = results
    .filter(result => (result.complexityScore || 0) > 15)
    .map(result => ({
      filePath: result.filePath,
      complexity: result.complexityScore || 0
    }))
    .sort((a, b) => b.complexity - a.complexity);
  
  return {
    components,
    dependencyGraph,
    entryPoints,
    patterns,
    securityIssues,
    performanceIssues,
    highComplexityFiles
  };
}

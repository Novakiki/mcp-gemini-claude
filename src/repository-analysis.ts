/**
 * Repository Analysis Module
 * 
 * This module is responsible for analyzing a repository after it has been packaged.
 * It provides deep analysis capabilities to extract architecture, components, patterns,
 * and other useful information from the code.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { scanRepository } from './repomix-utils.js';
import { Logger } from './types.js';
import { TOKEN_LIMITS } from './token-management.js';

/**
 * Result of the repository analysis
 */
export interface RepositoryAnalysisResult {
  architecture: Architecture;
  components: Component[];
  dependencies: Dependencies;
  patterns: Pattern[];
  metrics: CodeMetrics;
  securityIssues?: SecurityIssue[];
  performanceIssues?: PerformanceIssue[];
}

/**
 * Architecture information extracted from the codebase
 */
interface Architecture {
  type: string;
  layers: string[];
  mainModules: string[];
  entryPoints: string[];
  description?: string;
}

/**
 * Component information
 */
interface Component {
  name: string;
  path: string;
  description?: string;
  files?: string[];
  responsibilities?: string[];
  complexity?: number;
  dependencies?: string[];
}

/**
 * Dependency information
 */
interface Dependencies {
  internal: Record<string, string[]>;
  external: Record<string, string[]>;
  graph?: Record<string, string[]>;
}

/**
 * Design pattern information
 */
interface Pattern {
  name: string;
  description?: string;
  instances?: string[];
  locations?: string[];
}

/**
 * Code metrics information
 */
interface CodeMetrics {
  totalFiles: number;
  totalComponents: number;
  avgComponentComplexity?: number;
  cohesion?: number;
  coupling?: number;
  cyclomaticComplexity?: number;
  linesOfCode?: number;
  commentRatio?: number;
}

/**
 * Security issue information
 */
interface SecurityIssue {
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location?: string;
  recommendation?: string;
}

/**
 * Performance issue information
 */
interface PerformanceIssue {
  title: string;
  impact: 'low' | 'medium' | 'high';
  description: string;
  location?: string;
  recommendation?: string;
}

/**
 * Perform custom analysis on a repository
 * @param repoDir Original repository directory
 * @param packagedCodePath Path to the packaged code file
 * @param options Analysis options
 * @returns Analysis results
 */
export async function analyzeRepository(
  repoDir: string,
  packagedCodePath: string,
  options: {
    query?: string;
    analysisType?: string;
    analysisDepth?: 'basic' | 'comprehensive';
    extractImports?: boolean;
    logger?: Logger;
  } = {}
): Promise<RepositoryAnalysisResult> {
  const logger = options.logger || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  const analysisType = options.analysisType || 'general';
  const analysisDepth = options.analysisDepth || 'basic';
  
  logger.info(`Analyzing repository: ${repoDir} (Type: ${analysisType}, Depth: ${analysisDepth})`);
  
  // Scan the repository for file information
  const scanResult = await scanRepository(repoDir, { logger });
  
  // Read the packaged code file
  const packagedCode = await fs.readFile(packagedCodePath, 'utf-8');
  
  // Extract core architecture
  const architecture = await detectArchitecture(packagedCode, scanResult, {
    analysisType,
    analysisDepth,
    logger
  });
  
  // Identify components
  const components = await identifyComponents(packagedCode, scanResult, {
    analysisType,
    analysisDepth,
    logger
  });
  
  // Analyze dependencies
  const dependencies = await analyzeDependencies(packagedCode, scanResult, {
    analysisType,
    analysisDepth,
    extractImports: options.extractImports !== false,
    logger
  });
  
  // Detect design patterns
  const patterns = await detectDesignPatterns(packagedCode, scanResult, {
    analysisType,
    analysisDepth,
    logger
  });
  
  // Calculate code metrics
  const metrics = calculateCodeMetrics(packagedCode, scanResult, components, dependencies);
  
  // Add specialized analysis based on analysis type
  let securityIssues, performanceIssues;
  
  if (analysisType === 'security' || analysisType === 'comprehensive') {
    securityIssues = await analyzeSecurityIssues(packagedCode, scanResult, {
      analysisDepth,
      logger
    });
  }
  
  if (analysisType === 'performance' || analysisType === 'comprehensive') {
    performanceIssues = await analyzePerformanceIssues(packagedCode, scanResult, {
      analysisDepth,
      logger
    });
  }
  
  logger.info(`Repository analysis completed with ${components.length} components identified`);
  
  return {
    architecture,
    components,
    dependencies,
    patterns,
    metrics,
    ...(securityIssues && { securityIssues }),
    ...(performanceIssues && { performanceIssues })
  };
}

/**
 * Detect the overall architecture of the codebase
 */
async function detectArchitecture(
  packagedCode: string, 
  scanResult: any,
  options: {
    analysisType: string;
    analysisDepth: string;
    logger: Logger;
  }
): Promise<Architecture> {
  const { logger } = options;
  logger.debug('Detecting architecture');
  
  // Analyze the file structure to infer architecture pattern
  const architecture: Architecture = {
    type: 'unknown',
    layers: [],
    mainModules: [],
    entryPoints: []
  };
  
  // Check for common architecture patterns based on directory structure and key files
  
  // Check for MVC pattern
  if (
    packagedCode.includes('/models/') && 
    packagedCode.includes('/views/') && 
    packagedCode.includes('/controllers/')
  ) {
    architecture.type = 'MVC';
    architecture.layers = ['Model', 'View', 'Controller'];
  }
  // Check for MVVM pattern
  else if (
    packagedCode.includes('/models/') && 
    packagedCode.includes('/views/') && 
    packagedCode.includes('/viewmodels/')
  ) {
    architecture.type = 'MVVM';
    architecture.layers = ['Model', 'View', 'ViewModel'];
  }
  // Check for Clean Architecture
  else if (
    packagedCode.includes('/entities/') && 
    packagedCode.includes('/usecases/') && 
    (packagedCode.includes('/adapters/') || packagedCode.includes('/interfaces/'))
  ) {
    architecture.type = 'Clean Architecture';
    architecture.layers = ['Entities', 'Use Cases', 'Interface Adapters', 'Frameworks'];
  }
  // Check for Microservices architecture
  else if (
    packagedCode.includes('/services/') && 
    packagedCode.includes('/api/') && 
    packagedCode.match(/docker-compose\.ya?ml/)
  ) {
    architecture.type = 'Microservices';
    architecture.layers = ['API Gateway', 'Service Layer', 'Data Layer'];
  }
  // Check for Monolithic architecture
  else if (scanResult.directories.some((dir: string) => dir.includes('config'))) {
    architecture.type = 'Monolithic';
    architecture.layers = ['Presentation', 'Business Logic', 'Data Access'];
  }
  // Default to n-tier architecture
  else {
    architecture.type = 'N-Tier';
    architecture.layers = ['Presentation', 'Business', 'Data Access'];
  }
  
  // Find main modules based on top-level directories and key files
  const mainModuleCandidates = scanResult.directories
    .filter((dir: string) => !dir.includes('/') && dir !== 'node_modules' && dir !== 'dist' && dir !== '.git')
    .map((dir: string) => dir);
  
  // Find entry points by looking for index files, main files, or app files
  const entryPointPatterns = [
    /index\.(?:js|ts|jsx|tsx|py|java|rb)$/,
    /main\.(?:js|ts|jsx|tsx|py|java|rb)$/,
    /app\.(?:js|ts|jsx|tsx|py|java|rb)$/,
    /server\.(?:js|ts|jsx|tsx|py|java|rb)$/,
  ];
  
  const entryPoints = scanResult.files
    .filter((file: { path: string }) => 
      entryPointPatterns.some(pattern => pattern.test(file.path))
    )
    .map((file: { path: string }) => file.path)
    .slice(0, 5); // Limit to top 5 entry points
  
  architecture.mainModules = mainModuleCandidates.slice(0, 10); // Limit to top 10 modules
  architecture.entryPoints = entryPoints;
  
  return architecture;
}

/**
 * Identify components in the codebase
 */
async function identifyComponents(
  packagedCode: string, 
  scanResult: any,
  options: {
    analysisType: string;
    analysisDepth: string;
    logger: Logger;
  }
): Promise<Component[]> {
  const { logger } = options;
  logger.debug('Identifying components');
  
  const components: Component[] = [];
  
  // Pattern to extract component-like structures from the code
  const componentPatterns = [
    // React/Vue component pattern
    {
      regex: /<file path="([^"]+)">\s*((?:import|require)[^\n]*\n)*\s*(?:export default |export |class |function )([A-Z][A-Za-z0-9_]*)(?:Component)?\s*(?:extends|implements|:|\(|\{)/g,
      type: 'ui'
    },
    // Service pattern
    {
      regex: /<file path="([^"]+)">\s*((?:import|require)[^\n]*\n)*\s*(?:export default |export |class |function |const )([A-Za-z0-9_]*)(?:Service|Provider|Repository|Manager|Handler)\s*(?:extends|implements|:|\(|\{)/g,
      type: 'service'
    },
    // Controller pattern
    {
      regex: /<file path="([^"]+)">\s*((?:import|require)[^\n]*\n)*\s*(?:export default |export |class |function )([A-Za-z0-9_]*)(?:Controller|Router|Route|Api)\s*(?:extends|implements|:|\(|\{)/g,
      type: 'controller'
    },
    // Model pattern
    {
      regex: /<file path="([^"]+)">\s*((?:import|require)[^\n]*\n)*\s*(?:export default |export |class |interface |type )([A-Za-z0-9_]*)(?:Model|Entity|Schema|Type|Interface)\s*(?:extends|implements|:|\(|\{)/g,
      type: 'model'
    }
  ];
  
  // Extract components from packagedCode using regex patterns
  for (const pattern of componentPatterns) {
    const regex = new RegExp(pattern.regex);
    let match;
    
    while ((match = regex.exec(packagedCode)) !== null) {
      const [, filePath, , componentName] = match;
      
      // Determine component path (directory)
      const componentPath = path.dirname(filePath);
      
      // Check if component already exists with the same name
      const existingComponent = components.find(c => c.name === componentName);
      
      if (existingComponent) {
        // Add this file to existing component
        if (existingComponent.files) {
          existingComponent.files.push(filePath);
        } else {
          existingComponent.files = [filePath];
        }
      } else {
        // Create new component
        components.push({
          name: componentName,
          path: componentPath,
          files: [filePath],
          responsibilities: [pattern.type]
        });
      }
    }
  }
  
  // Also identify components based on directory structure
  const componentDirPatterns = [
    { pattern: /components\/([^\/]+)$/, type: 'ui' },
    { pattern: /services\/([^\/]+)$/, type: 'service' },
    { pattern: /controllers\/([^\/]+)$/, type: 'controller' },
    { pattern: /models\/([^\/]+)$/, type: 'model' },
    { pattern: /hooks\/([^\/]+)$/, type: 'hook' },
    { pattern: /utils\/([^\/]+)$/, type: 'utility' },
    { pattern: /middleware\/([^\/]+)$/, type: 'middleware' },
  ];
  
  // Group files by directory as potential components
  const dirToFiles: Record<string, string[]> = {};
  
  for (const file of scanResult.files) {
    const dir = path.dirname(file.path);
    if (!dirToFiles[dir]) {
      dirToFiles[dir] = [];
    }
    dirToFiles[dir].push(file.path);
  }
  
  // Analyze directories that look like components
  for (const [dir, files] of Object.entries(dirToFiles)) {
    // Skip directories with too many or too few files
    if (files.length < 2 || files.length > 20) continue;
    
    // Check if directory matches component patterns
    for (const { pattern, type } of componentDirPatterns) {
      const match = dir.match(pattern);
      if (match) {
        const componentName = match[1];
        // Ensure reasonable component name (no weird characters, reasonable length)
        if (componentName && /^[A-Za-z0-9_-]+$/.test(componentName) && componentName.length < 30) {
          // Convert to PascalCase if needed
          const pascalName = componentName.charAt(0).toUpperCase() + componentName.slice(1);
          
          // Check if component already exists
          const existingComponent = components.find(c => c.name === pascalName || c.path === dir);
          
          if (existingComponent) {
            // Update existing component
            existingComponent.files = Array.from(new Set([...(existingComponent.files || []), ...files]));
            if (!existingComponent.responsibilities?.includes(type)) {
              existingComponent.responsibilities = [...(existingComponent.responsibilities || []), type];
            }
          } else {
            // Create new component
            components.push({
              name: pascalName,
              path: dir,
              files,
              responsibilities: [type]
            });
          }
          break;
        }
      }
    }
  }
  
  // For more comprehensive analysis, try to infer component purposes and descriptions
  if (options.analysisDepth === 'comprehensive') {
    for (const component of components) {
      component.description = inferComponentDescription(component, packagedCode);
      component.complexity = calculateComponentComplexity(component, packagedCode);
    }
  }
  
  return components;
}

/**
 * Infer a component's description from its code
 */
function inferComponentDescription(component: Component, packagedCode: string): string {
  // Try to extract comments that might describe the component
  const fileSection = component.files && component.files[0] ? 
    packagedCode.substring(
      packagedCode.indexOf(`<file path="${component.files[0]}">`),
      packagedCode.indexOf('</file>', packagedCode.indexOf(`<file path="${component.files[0]}">`)) + 7
    ) : '';
  
  // Look for JSDoc or similar comment blocks
  const commentBlockMatch = fileSection.match(/\/\*\*[\s\S]+?\*\/|\/\*[\s\S]+?\*\/|#\s*[^\n]+/);
  if (commentBlockMatch) {
    // Clean up the comment
    return commentBlockMatch[0]
      .replace(/\/\*\*|\*\/|\/\*|\*\/|\*\s*|\s*\*\s*|#\s*/g, '')
      .trim()
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('@'))
      .join(' ')
      .substring(0, 200) + (commentBlockMatch[0].length > 200 ? '...' : '');
  }
  
  // If no comment block, generate a description based on the component type and name
  const type = component.responsibilities?.[0] || 'component';
  const name = component.name;
  
  return `${name} ${type} located in ${component.path}`;
}

/**
 * Calculate component complexity based on code metrics
 */
function calculateComponentComplexity(component: Component, packagedCode: string): number {
  let complexity = 0;
  
  if (!component.files) return 1;
  
  // Base complexity on number of files
  complexity += Math.min(5, component.files.length / 2);
  
  // Increase complexity based on file sizes
  for (const file of component.files) {
    const fileSection = packagedCode.substring(
      packagedCode.indexOf(`<file path="${file}">`),
      packagedCode.indexOf('</file>', packagedCode.indexOf(`<file path="${file}">`)) + 7
    );
    
    // Count lines of code
    const lines = fileSection.split('\n').length;
    complexity += Math.min(3, lines / 100);
    
    // Count functions and classes as indicators of complexity
    const functionMatches = fileSection.match(/function\s+\w+|const\s+\w+\s*=\s*\(|class\s+\w+/g);
    complexity += functionMatches ? Math.min(4, functionMatches.length / 2) : 0;
    
    // Count conditionals as indicators of complexity
    const conditionalMatches = fileSection.match(/if\s*\(|switch\s*\(|for\s*\(|while\s*\(|catch\s*\(/g);
    complexity += conditionalMatches ? Math.min(3, conditionalMatches.length / 3) : 0;
  }
  
  // Scale to a 1-10 range
  return Math.min(10, Math.max(1, Math.round(complexity)));
}

/**
 * Analyze dependencies between components
 */
async function analyzeDependencies(
  packagedCode: string, 
  scanResult: any,
  options: {
    analysisType: string;
    analysisDepth: string;
    extractImports?: boolean;
    logger: Logger;
  }
): Promise<Dependencies> {
  const { logger } = options;
  logger.debug('Analyzing dependencies');
  
  // Initialize dependency structures
  const internal: Record<string, string[]> = {};
  const external: Record<string, string[]> = {};
  
  // Extract imports from each file
  const importRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
  let match;
  
  while ((match = importRegex.exec(packagedCode)) !== null) {
    const [, filePath, fileContent] = match;
    
    internal[filePath] = [];
    
    // Find all import statements
    const importStatements = fileContent.match(/import\s+.*?from\s+['"](.+?)['"]/g) || [];
    const requireStatements = fileContent.match(/require\s*\(\s*['"](.+?)['"]\s*\)/g) || [];
    
    // Process import statements
    for (const importStmt of importStatements) {
      const importMatch = importStmt.match(/from\s+['"](.+?)['"]/);
      if (importMatch && importMatch[1]) {
        const importPath = importMatch[1].trim();
        
        // Determine if it's an internal or external import
        if (
          importPath.startsWith('./') || 
          importPath.startsWith('../') || 
          (importPath.startsWith('/') && !importPath.startsWith('/node_modules/'))
        ) {
          // Internal dependency
          internal[filePath].push(importPath);
        } else {
          // External dependency
          const packageName = importPath.split('/')[0];
          if (!external[packageName]) {
            external[packageName] = [];
          }
          if (!external[packageName].includes(filePath)) {
            external[packageName].push(filePath);
          }
        }
      }
    }
    
    // Process require statements
    for (const requireStmt of requireStatements) {
      const requireMatch = requireStmt.match(/require\s*\(\s*['"](.+?)['"]\s*\)/);
      if (requireMatch && requireMatch[1]) {
        const requirePath = requireMatch[1].trim();
        
        // Determine if it's an internal or external import
        if (
          requirePath.startsWith('./') || 
          requirePath.startsWith('../') || 
          (requirePath.startsWith('/') && !requirePath.startsWith('/node_modules/'))
        ) {
          // Internal dependency
          internal[filePath].push(requirePath);
        } else {
          // External dependency
          const packageName = requirePath.split('/')[0];
          if (!external[packageName]) {
            external[packageName] = [];
          }
          if (!external[packageName].includes(filePath)) {
            external[packageName].push(filePath);
          }
        }
      }
    }
  }
  
  // Build dependency graph if doing comprehensive analysis
  let graph: Record<string, string[]> | undefined;
  
  if (options.analysisDepth === 'comprehensive') {
    graph = {};
    
    // Resolve relative paths to absolute paths
    for (const [filePath, imports] of Object.entries(internal)) {
      graph[filePath] = [];
      
      for (const importPath of imports) {
        // Resolve relative path to actual file
        let resolvedPath: string = '';
        try {
          resolvedPath = path.resolve(path.dirname(filePath), importPath);
          
          // Handle imports without extensions
          if (!scanResult.files.some((file: { path: string }) => file.path === resolvedPath)) {
            const extensions = ['.js', '.ts', '.jsx', '.tsx', '.json'];
            for (const ext of extensions) {
              const pathWithExt = resolvedPath + ext;
              if (scanResult.files.some((file: { path: string }) => file.path === pathWithExt)) {
                resolvedPath = pathWithExt;
                break;
              }
            }
          }
          
          // Also check for index files in directories
          if (!scanResult.files.some((file: { path: string }) => file.path === resolvedPath)) {
            const indexExtensions = ['/index.js', '/index.ts', '/index.jsx', '/index.tsx'];
            for (const ext of indexExtensions) {
              const indexPath = resolvedPath + ext;
              if (scanResult.files.some((file: { path: string }) => file.path === indexPath)) {
                resolvedPath = indexPath;
                break;
              }
            }
          }
          
          if (scanResult.files.some((file: { path: string }) => file.path === resolvedPath)) {
            graph[filePath].push(resolvedPath);
          }
        } catch (error) {
          logger.debug(`Error resolving import path: ${importPath} in ${filePath}`);
        }
      }
    }
  }
  
  return {
    internal,
    external,
    ...(graph && { graph })
  };
}

/**
 * Detect design patterns in the code
 */
async function detectDesignPatterns(
  packagedCode: string, 
  scanResult: any,
  options: {
    analysisType: string;
    analysisDepth: string;
    logger: Logger;
  }
): Promise<Pattern[]> {
  const { logger } = options;
  logger.debug('Detecting design patterns');
  
  const patterns: Pattern[] = [];
  
  // Define patterns to look for
  const patternDefinitions = [
    {
      name: 'Singleton',
      regex: /(?:const|let|var)\s+\w+\s*=\s*(?:\(\s*function\s*\(\)\s*\{|function\s*\(\)\s*\{|\(\s*\)\s*(?:=>|=>\s*\{))[\s\S]*?(?:if\s*\(\s*(?:instance|this\.\w+|!(?:instance|\w+))\s*\)|return\s*(?:instance|\w+);)[\s\S]*?(?:instance|\w+)\s*=|\s*static\s+getInstance\s*\(/g,
      description: 'Singleton pattern ensures a class has only one instance and provides a global point of access to it.'
    },
    {
      name: 'Factory',
      regex: /(?:class|function)\s+(\w+)Factory[\s\S]*?(?:create|make|build|getInstance|getHandler)[\s\S]*?return\s+(?:new\s+\w+|(\w+)\.getInstance\s*\(|(\w+)\.create)/g,
      description: 'Factory pattern provides an interface for creating objects without specifying their concrete classes.'
    },
    {
      name: 'Observer',
      regex: /(?:subscribe|addEventListener|on(?!ce\s*\())[\s\S]*?(?:notify|emit|publish|dispatch|trigger|fire\s*\()/g,
      description: 'Observer pattern defines a one-to-many dependency between objects where a state change in one object results in notification of all its dependents.'
    },
    {
      name: 'Strategy',
      regex: /(?:class|function)\s+(\w+)Strategy|(?:const|let|var)\s+strategies\s*=\s*(?:{|new Map\s*\()/g,
      description: 'Strategy pattern defines a family of algorithms, encapsulates each one, and makes them interchangeable.'
    },
    {
      name: 'Decorator',
      regex: /(?:@\w+|function\s+\w+\s*\([^)]*?\)\s*{[\s\S]*?return\s+function\s*\([^)]*?\)\s*{)/g,
      description: 'Decorator pattern attaches additional responsibilities to an object dynamically.'
    },
    {
      name: 'MVC',
      regex: /(?:class|function)\s+(?:\w+)Model[\s\S]*?(?:class|function)\s+(?:\w+)View[\s\S]*?(?:class|function)\s+(?:\w+)Controller/g,
      description: 'Model-View-Controller pattern separates an application into three main components: model, view, and controller.'
    },
    {
      name: 'Repository',
      regex: /(?:class|function)\s+(\w+)Repository(?:\s+|{|extends|\()/g,
      description: 'Repository pattern isolates the data layer from the rest of the app and provides an object-oriented view of the datasource.'
    },
    {
      name: 'Provider',
      regex: /(?:const|let|var|class)\s+(\w+Provider)[\s\S]*?(?:context|createContext|Provider)/g,
      description: 'Provider pattern makes data available to multiple nested components without explicitly passing props.'
    },
  ];
  
  // Look for each pattern in the packaged code
  for (const patternDef of patternDefinitions) {
    const regex = new RegExp(patternDef.regex);
    let match;
    const instances: string[] = [];
    
    // Reset regex lastIndex
    regex.lastIndex = 0;
    
    while ((match = regex.exec(packagedCode)) !== null) {
      // Try to find which file this match belongs to
      const fileStartPos = packagedCode.lastIndexOf('<file path="', match.index);
      const fileEndPos = packagedCode.indexOf('</file>', match.index);
      
      if (fileStartPos >= 0 && fileEndPos > fileStartPos) {
        const filePathMatch = packagedCode.substring(fileStartPos, packagedCode.indexOf('>', fileStartPos) + 1).match(/<file path="([^"]+)">/);
        if (filePathMatch && filePathMatch[1]) {
          const filePath = filePathMatch[1];
          instances.push(filePath);
        }
      }
    }
    
    // Only add pattern if instances were found
    if (instances.length > 0) {
      patterns.push({
        name: patternDef.name,
        description: patternDef.description,
        instances: Array.from(new Set(instances)) // Remove duplicates
      });
    }
  }
  
  return patterns;
}

/**
 * Calculate various code metrics
 */
function calculateCodeMetrics(
  packagedCode: string,
  scanResult: any,
  components: Component[],
  dependencies: Dependencies
): CodeMetrics {
  // Basic metrics
  const metrics: CodeMetrics = {
    totalFiles: scanResult.fileCount,
    totalComponents: components.length,
    avgComponentComplexity: 0,
    cohesion: 0,
    coupling: 0
  };
  
  // Calculate average component complexity
  if (components.length > 0) {
    const totalComplexity = components.reduce((sum, component) => 
      sum + (component.complexity || 1), 0);
    metrics.avgComponentComplexity = Number((totalComplexity / components.length).toFixed(2));
  }
  
  // Calculate approximate coupling (based on dependencies)
  const totalInternalDependencies = Object.values(dependencies.internal)
    .reduce((sum, deps) => sum + deps.length, 0);
  
  if (scanResult.fileCount > 0) {
    // Coupling metric: average number of dependencies per file
    metrics.coupling = Number((totalInternalDependencies / scanResult.fileCount).toFixed(2));
  }
  
  // Calculate approximate cohesion
  // Cohesion is high when components are focused (high internal connectivity, low external connectivity)
  if (components.length > 0) {
    let totalCohesionScore = 0;
    
    for (const component of components) {
      if (!component.files || component.files.length <= 1) {
        // Single file components have perfect cohesion by definition
        totalCohesionScore += 1;
        continue;
      }
      
      // Count internal references within the component
      let internalReferences = 0;
      let externalReferences = 0;
      
      for (const file of component.files) {
        const fileDependencies = dependencies.internal[file] || [];
        
        for (const dep of fileDependencies) {
          // Check if dependency points to another file in the same component
          const isInternal = component.files.some(componentFile => 
            componentFile.includes(dep) || dep.includes(componentFile));
          
          if (isInternal) {
            internalReferences++;
          } else {
            externalReferences++;
          }
        }
      }
      
      // Calculate cohesion ratio for this component
      const totalReferences = internalReferences + externalReferences;
      const componentCohesion = totalReferences > 0 ? 
        internalReferences / totalReferences : 0.5; // Default to medium cohesion if no references
      
      totalCohesionScore += componentCohesion;
    }
    
    // Average cohesion across all components
    metrics.cohesion = Number((totalCohesionScore / components.length).toFixed(2));
  }
  
  // Count lines of code (approximate)
  const lineCount = packagedCode.split('\n').length;
  metrics.linesOfCode = lineCount;
  
  // Calculate approximate cyclomatic complexity
  const conditionalMatchesCount = (packagedCode.match(/if\s*\(|else\s*\{|for\s*\(|while\s*\(|catch\s*\(|case\s+|default\s*:|&&|\|\||\?/g) || []).length;
  metrics.cyclomaticComplexity = Math.round(conditionalMatchesCount / Math.max(1, scanResult.fileCount));
  
  // Calculate comment ratio
  const commentLines = (packagedCode.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*/g) || []).length;
  metrics.commentRatio = Number((commentLines / Math.max(1, lineCount)).toFixed(2));
  
  return metrics;
}

/**
 * Analyze security issues in the code
 */
async function analyzeSecurityIssues(
  packagedCode: string, 
  scanResult: any,
  options: {
    analysisDepth: string;
    logger: Logger;
  }
): Promise<SecurityIssue[]> {
  const { logger } = options;
  logger.debug('Analyzing security issues');
  
  const securityIssues: SecurityIssue[] = [];
  
  // Define security issue patterns to look for
  const securityPatterns = [
    {
      name: 'Hardcoded Credentials',
      regex: /(?:const|let|var|private|public)\s+(?:\w+(?:password|secret|key|token|auth))\s*=\s*['"`][^'"`]{4,}['"`]/gi,
      severity: 'high',
      description: 'Hardcoded credentials found in source code, which poses a significant security risk.'
    },
    {
      name: 'SQL Injection',
      regex: /(?:execute|query|db\.query|connection\.query|executeQuery)\s*\(\s*[\s\S]*?\+\s*(?:req\.(?:params|query|body)|request\.(?:params|query|body)|(?:params|query|body))/gi,
      severity: 'critical',
      description: 'Potential SQL injection vulnerability, where user input is directly concatenated into SQL queries.'
    },
    {
      name: 'Cross-Site Scripting (XSS)',
      regex: /(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval|setTimeout|setInterval)\s*\(.*?(?:req\.(?:params|query|body)|request\.(?:params|query|body)|(?:params|query|body)|input|value)/gi,
      severity: 'high',
      description: 'Potential Cross-Site Scripting (XSS) vulnerability, where user input might be executed as code.'
    },
    {
      name: 'Insecure Direct Object Reference',
      regex: /(?:req|request)\.params\.(?:id|userId|fileId)|(?:params|query|body)\.(?:id|userId|fileId).*?(?:find|get|update|delete|remove)/gi,
      severity: 'medium',
      description: 'Possible Insecure Direct Object Reference (IDOR) where user input directly references objects without proper access control.'
    },
    {
      name: 'No Input Validation',
      regex: /app\.(?:get|post|put|delete|patch)\s*\(\s*(?:["'`][^"'`]+["'`]\s*,\s*)?function\s*\(\s*req\s*,/gi,
      severity: 'medium',
      description: 'Endpoint might lack input validation, making it vulnerable to various injection attacks.'
    },
    {
      name: 'Weak Cryptography',
      regex: /(?:createHash|createCipher)\s*\(\s*['"`](?:md5|sha1|des|rc4)['"`]/gi,
      severity: 'high',
      description: 'Usage of weak cryptographic algorithms that are considered insecure by modern standards.'
    },
    {
      name: 'CORS Misconfiguration',
      regex: /(?:Access-Control-Allow-Origin|res\.header\s*\(\s*['"`]Access-Control-Allow-Origin['"`])\s*(?:,\s*)?['"`]\*['"`]/gi,
      severity: 'medium',
      description: 'CORS is configured to allow all origins (*), which may lead to security vulnerabilities in certain contexts.'
    },
    {
      name: 'Insecure Cookie Configuration',
      regex: /(?:cookie|cookies|res\.cookie)\s*\(.*?(?:secure|httpOnly|sameSite)\s*:\s*false/gi,
      severity: 'medium',
      description: 'Cookies are configured without essential security attributes like Secure, HttpOnly, or SameSite.'
    },
    {
      name: 'Path Traversal',
      regex: /(?:(?:fs|require\(\s*['"`]fs['"`]\))\.(?:readFile|writeFile|appendFile|readFileSync|writeFileSync|appendFileSync)|path\.(?:resolve|join))\s*\(.*?(?:req\.(?:params|query|body)|request\.(?:params|query|body)|(?:params|query|body))/gi,
      severity: 'high',
      description: 'Potential path traversal vulnerability, where user input might be used in file operations.'
    },
    {
      name: 'Missing Rate Limiting',
      regex: /app\.(?:post|put)\s*\(\s*["'`]\/(?:login|signin|auth|authenticate|register|signup)["'`]/gi,
      severity: 'low',
      description: 'Authentication endpoints without obvious rate limiting, potentially allowing brute force attacks.'
    }
  ];
  
  // Look for each security issue pattern in the packaged code
  for (const pattern of securityPatterns) {
    const regex = new RegExp(pattern.regex);
    let match;
    
    while ((match = regex.exec(packagedCode)) !== null) {
      // Try to find which file this match belongs to
      const fileStartPos = packagedCode.lastIndexOf('<file path="', match.index);
      const fileEndPos = packagedCode.indexOf('</file>', match.index);
      
      if (fileStartPos >= 0 && fileEndPos > fileStartPos) {
        const filePathMatch = packagedCode.substring(fileStartPos, packagedCode.indexOf('>', fileStartPos) + 1).match(/<file path="([^"]+)">/);
        if (filePathMatch && filePathMatch[1]) {
          const filePath = filePathMatch[1];
          
          // Add security issue
          securityIssues.push({
            title: pattern.name,
            severity: pattern.severity as 'low' | 'medium' | 'high' | 'critical',
            description: pattern.description,
            location: filePath,
            recommendation: generateSecurityRecommendation(pattern.name)
          });
        }
      }
    }
  }
  
  return securityIssues;
}

/**
 * Generate a security recommendation based on the issue type
 */
function generateSecurityRecommendation(issueType: string): string {
  const recommendations: Record<string, string> = {
    'Hardcoded Credentials': 'Use environment variables or a secure vault service to store sensitive information.',
    'SQL Injection': 'Use parameterized queries or an ORM to prevent SQL injection.',
    'Cross-Site Scripting (XSS)': 'Sanitize user input and use context-appropriate encoding when rendering data.',
    'Insecure Direct Object Reference': 'Implement proper authorization checks and use indirect references.',
    'No Input Validation': 'Add input validation with a validation library like Joi, Yup, or express-validator.',
    'Weak Cryptography': 'Use modern cryptographic algorithms (SHA-256, AES, etc.) and standard libraries.',
    'CORS Misconfiguration': 'Specify explicit origins instead of wildcard "*" in CORS configuration.',
    'Insecure Cookie Configuration': 'Set Secure, HttpOnly, and SameSite attributes on cookies containing sensitive data.',
    'Path Traversal': 'Validate and sanitize user input before using in file operations, and use path.normalize().',
    'Missing Rate Limiting': 'Implement rate limiting on authentication endpoints to prevent brute force attacks.'
  };
  
  return recommendations[issueType] || 'Review and fix according to security best practices.';
}

/**
 * Analyze performance issues in the code
 */
async function analyzePerformanceIssues(
  packagedCode: string, 
  scanResult: any,
  options: {
    analysisDepth: string;
    logger: Logger;
  }
): Promise<PerformanceIssue[]> {
  const { logger } = options;
  logger.debug('Analyzing performance issues');
  
  const performanceIssues: PerformanceIssue[] = [];
  
  // Define performance issue patterns to look for
  const performancePatterns = [
    {
      name: 'Inefficient Loops',
      regex: /for\s*\([^)]*\)\s*[\s\S]*?for\s*\([^)]*\)[\s\S]*?(?:{[^{}]*}|[^{}]*for\s*\()/g,
      impact: 'medium',
      description: 'Nested loops that could potentially cause O(n²) or worse performance issues.'
    },
    {
      name: 'Large Bundle Size',
      regex: /import\s*{[^}]{100,}}\s*from/g,
      impact: 'medium',
      description: 'Large import statements that might increase bundle size unnecessarily.'
    },
    {
      name: 'Memory Leak',
      regex: /addEventListener[\s\S]*?(?!\s*removeEventListener)/g,
      impact: 'high',
      description: 'Event listeners added without corresponding removal, potentially causing memory leaks.'
    },
    {
      name: 'Expensive DOM Operations',
      regex: /(?:document\.getElementsBy|document\.querySelectorAll|\.innerHTML|\$\(['"]\w+['"])\)[\s\S]*?for\s*\(/g,
      impact: 'medium',
      description: 'DOM queries inside loops, which can be very inefficient.'
    },
    {
      name: 'Inefficient State Updates',
      regex: /(?:setState|useState)[\s\S]*?(?:setState|setX|setY|setCount|setData|setItems)/g,
      impact: 'medium',
      description: 'Multiple state updates that could potentially be batched.'
    },
    {
      name: 'Unnecessary Renders',
      regex: /(?:useEffect|componentDidUpdate)\s*\(\s*\(\s*\)\s*=>\s*{[\s\S]*?}\s*\)/g,
      impact: 'low',
      description: 'Effect hooks or lifecycle methods without dependency arrays, causing unnecessary renders.'
    },
    {
      name: 'Large Component',
      regex: /(?:function|class)\s+(\w+)[\s\S]{5000,}(?:return\s*\(|render\s*\(\s*\))/g,
      impact: 'medium',
      description: 'Unusually large component that could benefit from being split into smaller components.'
    },
    {
      name: 'Synchronous Network Requests',
      regex: /new\s+XMLHttpRequest\s*\(\s*\)[\s\S]*?\.open\s*\(\s*(?:'|")GET(?:'|")[^)]*false\s*\)/g,
      impact: 'high',
      description: 'Synchronous XMLHttpRequest, which blocks the main thread and causes poor performance.'
    },
    {
      name: 'Missing Virtualization',
      regex: /(?:map|forEach)\s*\(\s*\([^)]*\)\s*=>\s*[\s\S]*?(?:<(?:tr|li|div)[^>]*>)/g,
      impact: 'medium',
      description: 'Large lists rendered without virtualization, which can impact performance.'
    },
    {
      name: 'Unoptimized Images',
      regex: /<img\s+[^>]*src=(['"])[^'"]+\.(?:png|jpg|jpeg|gif)[^>]*>/g,
      impact: 'low',
      description: 'Image tags without width, height, or lazy loading attributes.'
    }
  ];
  
  // Look for each performance issue pattern in the packaged code
  for (const pattern of performancePatterns) {
    const regex = new RegExp(pattern.regex);
    let match;
    
    while ((match = regex.exec(packagedCode)) !== null) {
      // Try to find which file this match belongs to
      const fileStartPos = packagedCode.lastIndexOf('<file path="', match.index);
      const fileEndPos = packagedCode.indexOf('</file>', match.index);
      
      if (fileStartPos >= 0 && fileEndPos > fileStartPos) {
        const filePathMatch = packagedCode.substring(fileStartPos, packagedCode.indexOf('>', fileStartPos) + 1).match(/<file path="([^"]+)">/);
        if (filePathMatch && filePathMatch[1]) {
          const filePath = filePathMatch[1];
          
          // Add performance issue
          performanceIssues.push({
            title: pattern.name,
            impact: pattern.impact as 'low' | 'medium' | 'high',
            description: pattern.description,
            location: filePath,
            recommendation: generatePerformanceRecommendation(pattern.name)
          });
        }
      }
    }
  }
  
  return performanceIssues;
}

/**
 * Generate a performance recommendation based on the issue type
 */
function generatePerformanceRecommendation(issueType: string): string {
  const recommendations: Record<string, string> = {
    'Inefficient Loops': 'Consider restructuring the algorithm to avoid nested loops, or use more efficient data structures.',
    'Large Bundle Size': 'Use named imports instead of importing everything, and consider code splitting.',
    'Memory Leak': 'Ensure all event listeners are properly removed when components unmount.',
    'Expensive DOM Operations': 'Move DOM queries outside of loops, and use document fragments for batch DOM operations.',
    'Inefficient State Updates': 'Batch multiple state updates together when possible.',
    'Unnecessary Renders': 'Add proper dependency arrays to useEffect hooks to prevent unnecessary rerenders.',
    'Large Component': 'Split large components into smaller, more focused components for better maintainability and performance.',
    'Synchronous Network Requests': 'Use async/await or Promises for network requests instead of synchronous XMLHttpRequest.',
    'Missing Virtualization': 'Use virtualization libraries (like react-window or react-virtualized) for rendering large lists.',
    'Unoptimized Images': 'Add width, height, loading="lazy", and consider next-gen image formats.'
  };
  
  return recommendations[issueType] || 'Optimize according to performance best practices.';
}

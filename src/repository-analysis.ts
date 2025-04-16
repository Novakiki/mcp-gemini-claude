/**
 * Repository Analysis Module
 * 
 * This module is responsible for analyzing a repository after it has been packaged.
 * It provides deep analysis capabilities to extract architecture, components, patterns,
 * and other useful information from the code using AST-based analysis.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { scanRepository } from './repomix-utils.js';
import { Logger } from './types.js';
import { TOKEN_LIMITS } from './token-management.js';
import { 
  analyzeRepository as astAnalyzeRepository,
  analyzeFile,
  analyzeFiles,
  AstAnalysisResult,
  Component as AstComponent,
  ProgrammingLanguage,
  CodeLocation,
  detectComponentDependencies,
  detectDesignPatterns as astDetectDesignPatterns
} from './ast-analyzer.js';

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
 * Extract files from packaged code
 * This is required to enable analyzing the code with AST
 * @param packagedCodePath Path to the packaged code file
 * @param outputDir Directory to extract files to
 * @returns Map of original file paths to extracted file paths
 */
async function extractFilesFromPackagedCode(
  packagedCodePath: string,
  outputDir: string,
  logger: Logger
): Promise<Map<string, string>> {
  logger.info('Extracting files from packaged code');
  
  // Create output directory if it doesn't exist
  await fs.mkdir(outputDir, { recursive: true });
  
  // Read the packaged code file
  const packagedCode = await fs.readFile(packagedCodePath, 'utf-8');
  
  // Extract files using regex
  const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
  let match;
  const fileMap = new Map<string, string>();
  
  while ((match = fileRegex.exec(packagedCode)) !== null) {
    const [, filePath, fileContent] = match;
    
    // Skip files with non-analyzable extensions
    const ext = path.extname(filePath).toLowerCase();
    if (!['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cs', '.go', '.rb', '.php'].includes(ext)) {
      continue;
    }
    
    // Create subdirectories as needed
    const outputFilePath = path.join(outputDir, filePath);
    await fs.mkdir(path.dirname(outputFilePath), { recursive: true });
    
    // Write file
    await fs.writeFile(outputFilePath, fileContent);
    
    // Add to map
    fileMap.set(filePath, outputFilePath);
  }
  
  logger.info(`Extracted ${fileMap.size} files for AST analysis`);
  return fileMap;
}

/**
 * Perform custom analysis on a repository using AST-based analysis
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
  
  // Create a temporary directory for extracted files
  const tempDir = path.join(path.dirname(packagedCodePath), 'extracted-files-' + Date.now());
  
  try {
    // Extract files from packaged code for AST analysis
    const fileMap = await extractFilesFromPackagedCode(packagedCodePath, tempDir, logger);
    
    // Get list of extracted file paths for AST analysis
    const extractedFilePaths = Array.from(fileMap.values());
    
    // Perform AST analysis on extracted files
    logger.info('Performing AST analysis on extracted files');
    const astResults = await analyzeFiles(extractedFilePaths, { logger });
    
    // Extract core architecture based on AST results and file structure
    const architecture = await detectArchitecture(scanResult, astResults, {
      analysisType,
      analysisDepth,
      logger
    });
    
    // Convert AST components to our component format
    const components = convertAstComponents(astResults);
    
    // Detect dependencies between components using AST
    const dependencies = await analyzeDependencies(astResults, {
      analysisType,
      analysisDepth,
      extractImports: options.extractImports !== false,
      logger
    });
    
    // Detect design patterns using AST
    const patterns = await detectDesignPatterns(astResults, {
      analysisType,
      analysisDepth,
      logger
    });
    
    // Calculate code metrics
    const metrics = calculateCodeMetrics(astResults, scanResult, components, dependencies);
    
    // Add specialized analysis based on analysis type
    let securityIssues, performanceIssues;
    
    if (analysisType === 'security' || analysisType === 'comprehensive') {
      securityIssues = await analyzeSecurityIssues(astResults, {
        analysisDepth,
        logger
      });
    }
    
    if (analysisType === 'performance' || analysisType === 'comprehensive') {
      performanceIssues = await analyzePerformanceIssues(astResults, {
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
  } finally {
    // Clean up temporary files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      logger.warn(`Failed to clean up temporary directory: ${tempDir}`, error);
    }
  }
}

/**
 * Convert AST components to our component format
 */
function convertAstComponents(astResults: AstAnalysisResult[]): Component[] {
  const components: Component[] = [];
  
  // Collect all components from AST results
  for (const result of astResults) {
    for (const astComponent of result.components) {
      // Create component object
      const component: Component = {
        name: astComponent.name,
        path: path.dirname(astComponent.filePath),
        description: `${astComponent.type} component ${astComponent.framework ? `using ${astComponent.framework}` : ''}`,
        files: [astComponent.filePath],
        responsibilities: []
      };
      
      // Determine responsibilities based on component type and framework
      if (astComponent.type === 'class' || astComponent.type === 'function') {
        if (astComponent.framework === 'React') {
          component.responsibilities = ['ui', 'component'];
        } else if (astComponent.framework === 'Angular') {
          component.responsibilities = ['ui', 'component'];
        } else if (astComponent.framework === 'Vue') {
          component.responsibilities = ['ui', 'component'];
        } else if (astComponent.framework === 'Flask' || astComponent.framework === 'Express') {
          component.responsibilities = ['controller', 'route'];
        } else if (astComponent.framework === 'Django' || astComponent.framework === 'Sequelize') {
          component.responsibilities = ['model', 'data'];
        } else {
          component.responsibilities = [astComponent.type];
        }
      }
      
      // Add component if not already exists
      const existingComponent = components.find(c => c.name === component.name);
      if (existingComponent) {
        // Merge files and responsibilities
        existingComponent.files = [...new Set([...(existingComponent.files || []), ...(component.files || [])])];
        existingComponent.responsibilities = [...new Set([...(existingComponent.responsibilities || []), ...(component.responsibilities || [])])];
      } else {
        components.push(component);
      }
    }
  }
  
  return components;
}

/**
 * Detect the overall architecture of the codebase using AST analysis and directory structure
 */
async function detectArchitecture(
  scanResult: any,
  astResults: AstAnalysisResult[],
  options: {
    analysisType: string;
    analysisDepth: string;
    logger: Logger;
  }
): Promise<Architecture> {
  const { logger } = options;
  logger.debug('Detecting architecture using AST analysis');
  
  // Analyze the file structure to infer architecture pattern
  const architecture: Architecture = {
    type: 'unknown',
    layers: [],
    mainModules: [],
    entryPoints: []
  };
  
  // Find entry points from AST analysis
  const entryPoints = astResults
    .filter(result => result.entryPoint)
    .map(result => result.filePath);
  
  architecture.entryPoints = entryPoints;
  
  // Check for common architecture patterns based on directory structure
  const directories = scanResult.directories || [];
  
  // Check for MVC pattern
  if (
    directories.some((dir: string) => dir.includes('/models/')) && 
    directories.some((dir: string) => dir.includes('/views/')) && 
    directories.some((dir: string) => dir.includes('/controllers/'))
  ) {
    architecture.type = 'MVC';
    architecture.layers = ['Model', 'View', 'Controller'];
  }
  // Check for MVVM pattern
  else if (
    directories.some((dir: string) => dir.includes('/models/')) && 
    directories.some((dir: string) => dir.includes('/views/')) && 
    directories.some((dir: string) => dir.includes('/viewmodels/'))
  ) {
    architecture.type = 'MVVM';
    architecture.layers = ['Model', 'View', 'ViewModel'];
  }
  // Check for Clean Architecture
  else if (
    directories.some((dir: string) => dir.includes('/entities/')) && 
    directories.some((dir: string) => dir.includes('/usecases/')) && 
    (directories.some((dir: string) => dir.includes('/adapters/')) || 
     directories.some((dir: string) => dir.includes('/interfaces/')))
  ) {
    architecture.type = 'Clean Architecture';
    architecture.layers = ['Entities', 'Use Cases', 'Interface Adapters', 'Frameworks'];
  }
  // Check for Microservices architecture
  else if (
    directories.some((dir: string) => dir.includes('/services/')) && 
    directories.some((dir: string) => dir.includes('/api/')) && 
    scanResult.files.some((file: { path: string }) => file.path.match(/docker-compose\.ya?ml/))
  ) {
    architecture.type = 'Microservices';
    architecture.layers = ['API Gateway', 'Service Layer', 'Data Layer'];
  }
  // Check for React application architecture
  else if (
    directories.some((dir: string) => dir.includes('/components/')) && 
    astResults.some(result => 
      result.imports.some(imp => imp.source === 'react' || imp.source === 'react-dom')
    )
  ) {
    architecture.type = 'React Application';
    architecture.layers = ['Components', 'Hooks', 'Services', 'API'];
  }
  // Check for Angular application architecture
  else if (
    directories.some((dir: string) => dir.includes('/components/')) && 
    directories.some((dir: string) => dir.includes('/services/')) && 
    astResults.some(result => 
      result.imports.some(imp => imp.source.includes('@angular/'))
    )
  ) {
    architecture.type = 'Angular Application';
    architecture.layers = ['Components', 'Services', 'Modules'];
  }
  // Check for Express/Node.js application
  else if (
    directories.some((dir: string) => dir.includes('/routes/')) && 
    astResults.some(result => 
      result.imports.some(imp => imp.source === 'express')
    )
  ) {
    architecture.type = 'Express Application';
    architecture.layers = ['Routes', 'Controllers', 'Models', 'Middleware'];
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
  
  architecture.mainModules = mainModuleCandidates.slice(0, 10); // Limit to top 10 modules
  
  return architecture;
}

/**
 * Analyze dependencies between components using AST
 */
async function analyzeDependencies(
  astResults: AstAnalysisResult[],
  options: {
    analysisType: string;
    analysisDepth: string;
    extractImports?: boolean;
    logger: Logger;
  }
): Promise<Dependencies> {
  const { logger } = options;
  logger.debug('Analyzing dependencies using AST');
  
  // Initialize dependency structures
  const internal: Record<string, string[]> = {};
  const external: Record<string, string[]> = {};
  
  // Collect imports from AST results
  for (const result of astResults) {
    internal[result.filePath] = [];
    
    // Add internal dependencies
    for (const dependency of result.dependencies) {
      // Check if it's an internal dependency
      if (
        dependency.startsWith('./') || 
        dependency.startsWith('../') || 
        (dependency.startsWith('/') && !dependency.startsWith('/node_modules/'))
      ) {
        internal[result.filePath].push(dependency);
      } else {
        // External dependency
        const packageName = dependency.split('/')[0];
        if (!external[packageName]) {
          external[packageName] = [];
        }
        if (!external[packageName].includes(result.filePath)) {
          external[packageName].push(result.filePath);
        }
      }
    }
  }
  
  // Build dependency graph if doing comprehensive analysis
  let graph: Record<string, string[]> | undefined;
  
  if (options.analysisDepth === 'comprehensive') {
    // Use AST-based component dependency detection
    const componentDependencies = detectComponentDependencies(astResults);
    
    graph = {};
    for (const [filePath, dependencies] of componentDependencies.entries()) {
      graph[filePath] = dependencies;
    }
  }
  
  return {
    internal,
    external,
    ...(graph && { graph })
  };
}

/**
 * Detect design patterns in the code using AST
 */
async function detectDesignPatterns(
  astResults: AstAnalysisResult[],
  options: {
    analysisType: string;
    analysisDepth: string;
    logger: Logger;
  }
): Promise<Pattern[]> {
  const { logger } = options;
  logger.debug('Detecting design patterns using AST');
  
  // Use AST-based pattern detection
  const astPatterns = astDetectDesignPatterns(astResults);
  
  // Convert to our pattern format
  const patterns: Pattern[] = [];
  
  for (const [patternName, instances] of Object.entries(astPatterns)) {
    if (instances.length > 0) {
      patterns.push({
        name: patternName.charAt(0).toUpperCase() + patternName.slice(1),
        description: getPatternDescription(patternName),
        instances: instances.map(instance => instance.name),
        locations: instances.map(instance => instance.filePath)
      });
    }
  }
  
  return patterns;
}

/**
 * Get pattern description
 */
function getPatternDescription(patternName: string): string {
  const descriptions: Record<string, string> = {
    'singleton': 'Singleton pattern ensures a class has only one instance and provides a global point of access to it.',
    'factory': 'Factory pattern provides an interface for creating objects without specifying their concrete classes.',
    'observer': 'Observer pattern defines a one-to-many dependency between objects where a state change in one object results in notification of all its dependents.',
    'strategy': 'Strategy pattern defines a family of algorithms, encapsulates each one, and makes them interchangeable.',
    'adapter': 'Adapter pattern converts the interface of a class into another interface clients expect.',
    'repository': 'Repository pattern isolates the data layer from the rest of the app and provides an object-oriented view of the datasource.',
    'provider': 'Provider pattern makes data available to multiple nested components without explicitly passing props.'
  };
  
  return descriptions[patternName] || `${patternName.charAt(0).toUpperCase() + patternName.slice(1)} pattern`;
}

/**
 * Calculate various code metrics using AST results
 */
function calculateCodeMetrics(
  astResults: AstAnalysisResult[],
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
  
  // Calculate lines of code and complexity
  let totalLines = 0;
  let totalComplexity = 0;
  
  for (const result of astResults) {
    totalComplexity += result.complexityScore || 0;
  }
  
  // Calculate average complexity
  metrics.cyclomaticComplexity = Math.round(totalComplexity / Math.max(1, astResults.length));
  
  // Calculate average component complexity
  if (components.length > 0) {
    let totalComponentComplexity = 0;
    for (const component of components) {
      // Set complexity based on AST results if available
      if (!component.complexity) {
        const componentFiles = component.files || [];
        const componentAstResults = astResults.filter(result => componentFiles.includes(result.filePath));
        
        if (componentAstResults.length > 0) {
          const avgComplexity = componentAstResults.reduce((sum, result) => sum + (result.complexityScore || 0), 0) / componentAstResults.length;
          component.complexity = Math.min(10, Math.max(1, Math.round(avgComplexity)));
        } else {
          component.complexity = 1; // Default complexity
        }
      }
      
      totalComponentComplexity += component.complexity;
    }
    
    metrics.avgComponentComplexity = Number((totalComponentComplexity / components.length).toFixed(2));
  }
  
  // Calculate coupling (based on dependencies)
  const totalInternalDependencies = Object.values(dependencies.internal)
    .reduce((sum, deps) => sum + deps.length, 0);
  
  if (scanResult.fileCount > 0) {
    // Coupling metric: average number of dependencies per file
    metrics.coupling = Number((totalInternalDependencies / scanResult.fileCount).toFixed(2));
  }
  
  // Calculate approximate cohesion
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
  
  return metrics;
}

/**
 * Analyze security issues in the code using AST
 */
async function analyzeSecurityIssues(
  astResults: AstAnalysisResult[],
  options: {
    analysisDepth: string;
    logger: Logger;
  }
): Promise<SecurityIssue[]> {
  const { logger } = options;
  logger.debug('Analyzing security issues using AST');
  
  const securityIssues: SecurityIssue[] = [];
  
  // Helper function to add security issue
  function addSecurityIssue(
    title: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    description: string,
    filePath: string
  ) {
    securityIssues.push({
      title,
      severity,
      description,
      location: filePath,
      recommendation: generateSecurityRecommendation(title)
    });
  }
  
  // Analyze each file for security issues
  for (const result of astResults) {
    // Check for hardcoded credentials
    for (const variable of result.variables) {
      const name = variable.name.toLowerCase();
      if (
        (name.includes('password') || 
         name.includes('secret') || 
         name.includes('key') || 
         name.includes('token') || 
         name.includes('auth')) && 
        variable.isConst && 
        variable.initialValue === 'StringLiteral'
      ) {
        addSecurityIssue(
          'Hardcoded Credentials',
          'high',
          `Hardcoded credentials found in variable "${variable.name}"`,
          result.filePath
        );
      }
    }
    
    // Check for SQL Injection vulnerabilities in functions
    for (const func of result.functions) {
      // Look for functions that execute queries
      if (
        func.name.includes('query') || 
        func.name.includes('execute') || 
        func.name.includes('find') || 
        func.name.includes('select')
      ) {
        // If function has parameters with names like 'id', 'query', 'input'
        // and doesn't use parameterized queries
        const riskyParams = func.params.filter(param => 
          param.includes('id') || 
          param.includes('query') || 
          param.includes('input') || 
          param.includes('param') || 
          param.includes('request')
        );
        
        if (riskyParams.length > 0) {
          addSecurityIssue(
            'SQL Injection',
            'critical',
            `Potential SQL injection vulnerability in function "${func.name}" using parameters: ${riskyParams.join(', ')}`,
            result.filePath
          );
        }
      }
    }
    
    // Check for XSS vulnerabilities (DOM manipulation with user input)
    // This would require more sophisticated analysis of variable usage
    // Just checking if DOM manipulation functions are used with parameters
    for (const func of result.functions) {
      if (
        func.name.includes('render') || 
        func.name.includes('html') || 
        func.name.includes('dom')
      ) {
        const riskyParams = func.params.filter(param => 
          param.includes('content') || 
          param.includes('html') || 
          param.includes('text') || 
          param.includes('input')
        );
        
        if (riskyParams.length > 0) {
          addSecurityIssue(
            'Cross-Site Scripting (XSS)',
            'high',
            `Potential XSS vulnerability in function "${func.name}" using parameters: ${riskyParams.join(', ')}`,
            result.filePath
          );
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
 * Analyze performance issues in the code using AST
 */
async function analyzePerformanceIssues(
  astResults: AstAnalysisResult[],
  options: {
    analysisDepth: string;
    logger: Logger;
  }
): Promise<PerformanceIssue[]> {
  const { logger } = options;
  logger.debug('Analyzing performance issues using AST');
  
  const performanceIssues: PerformanceIssue[] = [];
  
  // Helper function to add performance issue
  function addPerformanceIssue(
    title: string,
    impact: 'low' | 'medium' | 'high',
    description: string,
    filePath: string
  ) {
    performanceIssues.push({
      title,
      impact,
      description,
      location: filePath,
      recommendation: generatePerformanceRecommendation(title)
    });
  }
  
  // Find files with high complexity scores
  for (const result of astResults) {
    if ((result.complexityScore || 0) > 15) {
      addPerformanceIssue(
        'High Cyclomatic Complexity',
        'medium',
        `File has high cyclomatic complexity score (${result.complexityScore})`,
        result.filePath
      );
    }
    
    // Large component (many functions/methods)
    if (result.functions.length + result.classes.length > 10) {
      addPerformanceIssue(
        'Large Component',
        'medium',
        `File contains many functions/classes (${result.functions.length + result.classes.length})`,
        result.filePath
      );
    }
    
    // Check for imports with potential performance impact
    const heavyImports = [
      'lodash', 'moment', 'jquery', 'rxjs', 'aws-sdk', 'material-ui', '@mui/material'
    ];
    
    for (const imp of result.imports) {
      if (heavyImports.some(heavy => imp.source === heavy || imp.source.startsWith(`${heavy}/`))) {
        addPerformanceIssue(
          'Heavy Dependencies',
          'low',
          `File imports potentially heavy library: ${imp.source}`,
          result.filePath
        );
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
    'High Cyclomatic Complexity': 'Refactor complex functions into smaller, more focused functions.',
    'Large Component': 'Split large components into smaller, more focused components for better maintainability and performance.',
    'Heavy Dependencies': 'Consider importing only the specific functions needed from the library (tree-shaking) or using lighter alternatives.',
    'Inefficient Loops': 'Consider restructuring the algorithm to avoid nested loops, or use more efficient data structures.',
    'Large Bundle Size': 'Use named imports instead of importing everything, and consider code splitting.',
    'Memory Leak': 'Ensure all event listeners are properly removed when components unmount.',
    'Expensive DOM Operations': 'Move DOM queries outside of loops, and use document fragments for batch DOM operations.',
    'Inefficient State Updates': 'Batch multiple state updates together when possible.',
    'Unnecessary Renders': 'Add proper dependency arrays to useEffect hooks to prevent unnecessary rerenders.'
  };
  
  return recommendations[issueType] || 'Optimize according to performance best practices.';
}

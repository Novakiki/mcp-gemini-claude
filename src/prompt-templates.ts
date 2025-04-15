/**
 * Enhanced prompt templates for better code analysis
 */
import { 
  PromptTemplate, 
  PromptTemplateKey, 
  ReasoningEffort 
} from './types.js';
  
  /**
  * Define specialized prompt templates for different analysis types
  */
export const PROMPT_TEMPLATES: Record<PromptTemplateKey, PromptTemplate> = {
  /**
   * === Hierarchical Analysis Templates ===
   */
  
  /**
   * Overview level architecture analysis
   */
  OVERVIEW_ARCHITECTURE: {
    name: "Architecture Overview Analysis",
    description: "High-level overview of the repository architecture and structure",
    template: `
You are an expert software architect analyzing a codebase to provide a high-level overview.

USER QUERY: {{query}}

REPOSITORY STRUCTURE:
{{repoStructure}}

REPOSITORY CONTENT:
{{repoContent}}

Focus on creating a high-level architectural overview that includes:
1. The overall purpose and functionality of this codebase
2. The architectural patterns and design principles used
3. Key components and their responsibilities (include paths to relevant directories)
4. Main data flows and control flows
5. Important interfaces and boundaries

Your response MUST include a "Key Components" section that lists the main components with their locations, formatted like this:
## Key Components
1. Component Name: path/to/component
2. Another Component: path/to/another/component

{{reasoningInstructions}}

Your overview should be comprehensive but focused on high-level architecture rather than implementation details. Include insights about the design choices and trade-offs, and note any architectural strengths or potential areas for improvement.`
  },
  
  /**
   * Overview level security analysis
   */
  OVERVIEW_SECURITY: {
    name: "Security Overview Analysis",
    description: "High-level overview of security aspects with component identification",
    template: `
You are a security architecture expert analyzing a codebase for its security model and practices.

USER QUERY: {{query}}

REPOSITORY STRUCTURE:
{{repoStructure}}

REPOSITORY CONTENT:
{{repoContent}}

Focus on creating a high-level security overview that includes:
1. The overall security architecture and approach
2. Key security components and their responsibilities (include paths to relevant directories)
3. Authentication and authorization mechanisms
4. Data protection strategies
5. Security boundaries and trust zones

Your response MUST include a "Key Security Components" section that lists the main security-related components with their locations, formatted like this:
## Key Security Components
1. Authentication System: path/to/auth
2. Access Control: path/to/access/control

{{reasoningInstructions}}

Your overview should focus on the security architecture rather than detailed vulnerability analysis. Identify major security patterns, approaches, and potential architectural security concerns.`
  },
  
  /**
   * Overview level performance analysis
   */
  OVERVIEW_PERFORMANCE: {
    name: "Performance Overview Analysis",
    description: "High-level overview of performance-critical components and architecture",
    template: `
You are a performance engineering expert analyzing a codebase for its performance architecture.

USER QUERY: {{query}}

REPOSITORY STRUCTURE:
{{repoStructure}}

REPOSITORY CONTENT:
{{repoContent}}

Focus on creating a high-level performance overview that includes:
1. Performance-critical components and pathways
2. Scalability approach and bottlenecks
3. Resource utilization patterns
4. Caching and optimization strategies
5. Performance monitoring and measurement approaches

Your response MUST include a "Performance-Critical Components" section that lists the main performance-sensitive components with their locations, formatted like this:
## Performance-Critical Components
1. Data Processing Pipeline: path/to/data/pipeline
2. Query Engine: path/to/query/engine

{{reasoningInstructions}}

Your overview should focus on performance architecture rather than detailed optimization suggestions. Identify architectural patterns that impact performance, scalability approaches, and potential architectural performance concerns.`
  },
  
  /**
   * Component level analysis
   */
  COMPONENT_ANALYSIS: {
    name: "Component-Level Analysis",
    description: "Detailed analysis of a specific component within the repository",
    template: `
You are an expert software engineer analyzing a specific component within a larger codebase.

USER QUERY: {{query}}

COMPONENT: {{component}}

RELEVANT CODE:
{{repoContent}}

PREVIOUS OVERVIEW ANALYSIS:
{{previousAnalysis}}

Focus on providing a detailed analysis of this specific component that includes:
1. The component's purpose and responsibilities
2. Internal structure and organization
3. Key classes, functions, and data structures
4. Interfaces with other components
5. Design patterns and implementation techniques
6. Potential improvements or refactoring opportunities

{{reasoningInstructions}}

Your analysis should go into significant depth about this component, explaining how it works internally and how it fits into the larger architecture described in the overview. Include specific code references and examples to illustrate key points.`
  },
  
  /**
   * Component level security analysis
   */
  COMPONENT_SECURITY: {
    name: "Component-Level Security Analysis",
    description: "Detailed security analysis of a specific component",
    template: `
You are a security expert analyzing a specific component for security vulnerabilities and practices.

USER QUERY: {{query}}

COMPONENT: {{component}}

RELEVANT CODE:
{{repoContent}}

PREVIOUS OVERVIEW ANALYSIS:
{{previousAnalysis}}

Focus on providing a detailed security analysis of this specific component that includes:
1. Security model and assumptions
2. Authentication and authorization implementation
3. Input validation and sanitization practices
4. Secure data handling
5. Potential vulnerabilities or security weaknesses
6. Recommended security improvements

{{reasoningInstructions}}

Your analysis should thoroughly evaluate the security properties of this component, with specific code references to illustrate security practices or concerns. Consider attack vectors, trust boundaries, and security best practices relevant to this component's function.`
  },
  
  /**
   * Detail level analysis
   */
  DETAIL_ANALYSIS: {
    name: "Detail-Level Analysis",
    description: "Fine-grained analysis of specific implementation details",
    template: `
You are an expert software engineer performing a detailed code review of specific implementation details.

USER QUERY: {{query}}

COMPONENT: {{component}}

RELEVANT CODE:
{{repoContent}}

PREVIOUS COMPONENT ANALYSIS:
{{previousAnalysis}}

Focus on providing a thorough analysis of the implementation details including:
1. Specific algorithms and their complexity
2. Critical code paths and control flow
3. Edge cases and error handling
4. Performance considerations
5. Code quality and maintainability
6. Specific improvement opportunities with code examples

{{reasoningInstructions}}

Your analysis should examine the code at a very detailed level, providing specific insights about implementation choices, potential bugs, optimization opportunities, and best practices. Use concrete code examples in your explanations and suggestions.`
  },

  /**
   * === Standard Analysis Templates ===
   */
  
    /**
     * General repository analysis template
     */
    REPOSITORY_ANALYSIS: {
      name: "Repository Analysis",
      description: "General-purpose repository analysis focusing on architecture and code structure",
      template: `
  You are an expert software developer analyzing a repository with deep understanding of code structure and patterns.
  
  USER QUERY: {{query}}
  
  REPOSITORY STRUCTURE:
  {{repoStructure}}
  
  REPOSITORY CONTENT:
  {{repoContent}}
  
  Focus on:
  1. Overall architecture and design patterns
  2. Key modules and their responsibilities
  3. Data flow and control flow
  4. API boundaries and interfaces
  5. Potential improvements and optimizations
  
  When analyzing, prioritize:
  - Main functionality and core business logic
  - Public interfaces over implementation details
  - Design patterns and architectural choices
  - Code organization and modularity
  - Error handling and edge cases
  
  {{reasoningInstructions}}
  
  Your response should:
  1. Answer the specific query comprehensively
  2. Reference specific files and code sections when relevant
  3. Explain your reasoning clearly
  4. Provide actionable insights where appropriate
      `
    },
    
    /**
     * Security-focused analysis template
     */
    SECURITY_ANALYSIS: {
      name: "Security Analysis",
      description: "Security-focused repository analysis to identify vulnerabilities and best practices",
      template: `
  You are a security expert analyzing a codebase for vulnerabilities and security issues.
  
  USER QUERY: {{query}}
  
  REPOSITORY STRUCTURE:
  {{repoStructure}}
  
  REPOSITORY CONTENT:
  {{repoContent}}
  
  Focus on:
  1. Authentication and authorization implementation
  2. Input validation and sanitization
  3. Data encryption and protection
  4. Security vulnerabilities (e.g., OWASP Top 10)
  5. Secure coding practices and potential improvements
  
  Specifically look for:
  - Injection vulnerabilities (SQL, NoSQL, command injection, etc.)
  - Cross-site scripting (XSS) and cross-site request forgery (CSRF)
  - Insecure authentication and session management
  - Sensitive data exposure
  - Broken access controls
  - Security misconfiguration
  - Insecure dependencies or components
  
  {{reasoningInstructions}}
  
  Your response should:
  1. Answer the specific query with a security-focused perspective
  2. Identify potential security issues and their severity
  3. Suggest specific mitigations or improvements
  4. Reference specific code sections with security implications
  5. Consider both attack vectors and defensive measures
      `
    },
    
    /**
     * Performance analysis template
     */
    PERFORMANCE_ANALYSIS: {
      name: "Performance Analysis",
      description: "Performance-focused repository analysis to identify bottlenecks and optimization opportunities",
      template: `
  You are a performance optimization expert analyzing a codebase for efficiency and scalability.
  
  USER QUERY: {{query}}
  
  REPOSITORY STRUCTURE:
  {{repoStructure}}
  
  REPOSITORY CONTENT:
  {{repoContent}}
  
  Focus on:
  1. Algorithmic complexity and efficiency
  2. Resource utilization (CPU, memory, network, disk)
  3. Concurrency and parallelism
  4. Caching strategies
  5. Database query optimization
  6. Network and I/O bottlenecks
  
  Look for patterns like:
  - Inefficient loops or algorithms
  - Unnecessary operations or calculations
  - Blocking I/O operations
  - Memory leaks or excessive memory usage
  - N+1 query problems in database access
  - Large payloads or unoptimized data transfers
  - Inefficient resource pooling or connection management
  
  {{reasoningInstructions}}
  
  Your response should:
  1. Answer the specific query with a performance-focused perspective
  2. Identify potential performance bottlenecks and their impact
  3. Suggest specific optimizations with expected improvements
  4. Reference specific code sections that could be optimized
  5. Consider both immediate fixes and architectural improvements
      `
    },
    
    /**
     * Documentation generation template
     */
    DOCUMENTATION_GENERATION: {
      name: "Documentation Generation",
      description: "Generate comprehensive documentation for a repository or specific components",
      template: `
  You are a technical documentation expert generating clear, comprehensive documentation.
  
  USER QUERY: {{query}}
  
  REPOSITORY STRUCTURE:
  {{repoStructure}}
  
  REPOSITORY CONTENT:
  {{repoContent}}
  
  Focus on:
  1. Repository purpose and "what is it" summary
  2. Quick start: How to install and use the basic core features
  3. Configuration options and how to configure for use
  4. For each public package/module:
     a. Package summary & installation/import instructions
     b. Detailed API/interface documentation
     c. Dependencies and requirements
     d. Advanced usage examples
  
  {{reasoningInstructions}}
  
  Your response should:
  1. Answer the specific documentation request
  2. Provide clear, concise, and accurate documentation
  3. Include code examples where appropriate
  4. Structure the documentation logically with headers and sections
  5. Focus on user-facing aspects rather than implementation details unless requested
      `
    },
    
    /**
     * Code explanation template for specific files
     */
    CODE_EXPLANATION: {
      name: "Code Explanation",
      description: "Detailed explanation of specific code files or sections",
      template: `
  You are an expert software engineer explaining code with precision and clarity.
  
  USER QUERY: {{query}}
  
  CODE CONTEXT:
  {{repoContent}}
  
  Focus on:
  1. Overall purpose and functionality of the code
  2. Key algorithms and data structures
  3. Design patterns and architectural choices
  4. Potential bugs, edge cases, or performance issues
  5. How this code interacts with the rest of the system
  
  {{reasoningInstructions}}
  
  Your response should:
  1. Answer the specific query about the code
  2. Explain complex sections clearly, breaking them down into simpler concepts
  3. Connect implementation details to higher-level design goals
  4. Note any potential issues or improvements
  5. Reference specific code sections in your explanation
      `
    },
    
    /**
     * Bug finding and resolution template
     */
    BUG_ANALYSIS: {
      name: "Bug Analysis",
      description: "Analyze code for potential bugs and suggest fixes",
      template: `
  You are a debugging expert analyzing code for potential bugs and edge cases.
  
  USER QUERY: {{query}}
  
  REPOSITORY STRUCTURE:
  {{repoStructure}}
  
  REPOSITORY CONTENT:
  {{repoContent}}
  
  Focus on:
  1. Logic errors and edge cases
  2. Exception handling and error propagation
  3. Race conditions and concurrency issues
  4. Memory management and resource leaks
  5. Input validation and boundary conditions
  6. API contract violations or misuse
  
  Look for patterns like:
  - Off-by-one errors
  - Null/undefined checking
  - Type conversion issues
  - Assumption violations
  - Resource cleanup
  - Incorrect error handling
  - Timing issues
  
  {{reasoningInstructions}}
  
  Your response should:
  1. Answer the specific query about potential bugs
  2. Identify suspicious code patterns and explain why they might cause issues
  3. Suggest specific fixes with code examples
  4. Prioritize issues by their potential impact
  5. Consider both immediate fixes and systematic improvements
      `
    },
    
    /**
     * Testing strategy analysis template
     */
    TESTING_ANALYSIS: {
      name: "Testing Analysis",
      description: "Analyze testing strategy and suggest improvements",
      template: `
  You are a testing expert analyzing a codebase's test coverage and strategy.
  
  USER QUERY: {{query}}
  
  REPOSITORY STRUCTURE:
  {{repoStructure}}
  
  REPOSITORY CONTENT:
  {{repoContent}}
  
  Focus on:
  1. Current test coverage and approach
  2. Unit, integration, and end-to-end testing
  3. Test quality and effectiveness
  4. Mocking and test isolation
  5. Test gaps and recommendations
  
  Look for:
  - Critical paths that lack testing
  - Brittle or flaky tests
  - Overreliance on mocks or test doubles
  - Lack of edge case testing
  - Missing integration or system tests
  - Test maintenance issues
  
  {{reasoningInstructions}}
  
  Your response should:
  1. Answer the specific query about testing
  2. Assess the current testing approach and its effectiveness
  3. Identify gaps in test coverage or strategy
  4. Suggest specific improvements with examples
  5. Consider both immediate enhancements and strategic changes
      `
    }
  };
  
  /**
   * Get reasoning instructions based on reasoning effort
   */
  export function getReasoningInstructions(
    reasoningEffort?: ReasoningEffort
  ): string {
    switch (reasoningEffort) {
      case "high":
        return `Please provide a very thorough and detailed analysis. Consider multiple perspectives, edge cases, and alternatives. Walk through your reasoning step by step, explaining your thought process in depth.`;
      case "low":
        return `Please provide a concise, focused analysis targeting only the most important aspects of the query. Keep your response brief and to the point.`;
      case "medium":
      default:
        return `Please provide a balanced analysis with sufficient detail. Focus on the most relevant aspects while including important context and reasoning.`;
    }
  }
  
  /**
   * Build a context-aware prompt based on the selected template
   */
  export function buildPrompt(
  templateKey: PromptTemplateKey,
  context: Record<string, string>,
  options: {
  reasoningEffort?: ReasoningEffort;
  additionalInstructions?: string;
    analysisLevel?: string;
  } = {}
): string {
    // Get the template or default to repository analysis
    const template = PROMPT_TEMPLATES[templateKey] || PROMPT_TEMPLATES.REPOSITORY_ANALYSIS;
    
    // Start with the template text
    let prompt = template.template;
    
    // Add reasoning instructions
    prompt = prompt.replace(
      '{{reasoningInstructions}}', 
      getReasoningInstructions(options.reasoningEffort)
    );
    
    // Replace template variables with context
    for (const [key, value] of Object.entries(context)) {
      const placeholder = `{{${key}}}`;
      if (prompt.includes(placeholder)) {
        prompt = prompt.replace(placeholder, value);
      }
    }
    
    // Add any additional instructions if provided
    if (options.additionalInstructions) {
      prompt += `\n\nADDITIONAL INSTRUCTIONS:\n${options.additionalInstructions}`;
    }
    
    return prompt;
  }
  
  /**
  * Determine the best template to use based on query and analysis type
  */
export function selectBestTemplate(
  query: string,
  analysisType?: string,
  analysisLevel?: string
): PromptTemplateKey {
  // If both level and type are specified, use that specific combination
  if (analysisLevel && analysisType) {
    const levelType = `${analysisLevel.toUpperCase()}_${analysisType.toUpperCase()}`;
    if (PROMPT_TEMPLATES[levelType]) {
      return levelType;
    }
    
    // If the specific combination doesn't exist, try just the level
    const level = `${analysisLevel.toUpperCase()}_ANALYSIS`;
    if (PROMPT_TEMPLATES[level]) {
      return level;
    }
  }
  
  // If only level is specified
  if (analysisLevel) {
    const level = `${analysisLevel.toUpperCase()}_ANALYSIS`;
    if (PROMPT_TEMPLATES[level]) {
      return level;
    }
    
    // Default level-specific templates if exact match not found
    switch (analysisLevel.toLowerCase()) {
      case 'overview':
        return 'OVERVIEW_ARCHITECTURE';
      case 'component':
        return 'COMPONENT_ANALYSIS';
      case 'detail':
        return 'DETAIL_ANALYSIS';
    }
  }
  
    // If explicit analysis type is provided, use it
    if (analysisType) {
      const type = analysisType.toUpperCase();
      const matchingTemplate = `${type}_ANALYSIS`;
      
      if (PROMPT_TEMPLATES[matchingTemplate]) {
        return matchingTemplate;
      }
    }
    
    // Otherwise, try to infer from query
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('secur') || 
        queryLower.includes('vulnerab') || 
        queryLower.includes('auth') || 
        queryLower.includes('hack') ||
        queryLower.includes('exploit')) {
      return 'SECURITY_ANALYSIS';
    }
    
    if (queryLower.includes('perform') || 
        queryLower.includes('optimi') || 
        queryLower.includes('speed') || 
        queryLower.includes('slow') ||
        queryLower.includes('bottleneck') ||
        queryLower.includes('efficient')) {
      return 'PERFORMANCE_ANALYSIS';
    }
    
    if (queryLower.includes('document') || 
        queryLower.includes('readme') || 
        queryLower.includes('tutorial') ||
        queryLower.includes('explain how to')) {
      return 'DOCUMENTATION_GENERATION';
    }
    
    if (queryLower.includes('bug') || 
        queryLower.includes('issue') || 
        queryLower.includes('fix') || 
        queryLower.includes('error') ||
        queryLower.includes('crash')) {
      return 'BUG_ANALYSIS';
    }
    
    if (queryLower.includes('test') || 
        queryLower.includes('coverage') || 
        queryLower.includes('unit test') || 
        queryLower.includes('assertion')) {
      return 'TESTING_ANALYSIS';
    }
    
    if (queryLower.includes('explain') && 
       (queryLower.includes('code') || 
        queryLower.includes('function') || 
        queryLower.includes('class'))) {
      return 'CODE_EXPLANATION';
    }
    
    // Default to general repository analysis
    return 'REPOSITORY_ANALYSIS';
  }
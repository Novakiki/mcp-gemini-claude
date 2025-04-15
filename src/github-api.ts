/**
 * GitHub API client for MCP-Gemini-Claude
 */
import fetch, { HeadersInit, RequestInit } from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { createSecureTempDir, cleanupTempFiles } from './utils.js';
import { getConfigManager } from './config-manager.js';
// Import shared types
import {
  GitHubAuthConfig, 
  GitHubRepoInfo,
  GitHubApiOptions,
  Logger,
  GitHubRepositoryContext
} from './types.js';

/**
 * GitHub API client implementation
 */
export class GitHubApiClient {
  private baseUrl: string;
  private authConfig: GitHubAuthConfig;
  private logger: Logger;
  private rateLimitRemaining: number = 60; // GitHub's default rate limit
  private rateLimitReset: number = 0;

  /**
   * Create a new GitHub API client
   */
  constructor(options: GitHubApiOptions = {}) {
    this.baseUrl = options.baseUrl || 'https://api.github.com';
    this.authConfig = options.authConfig || this.getDefaultAuthConfig();
    this.logger = options.logger || {
      debug: () => {},
      info: () => {},
      warn: console.warn,
      error: console.error
    };
  }

  /**
   * Get default authentication configuration
   */
  private getDefaultAuthConfig(): GitHubAuthConfig {
    const configManager = getConfigManager();
    const githubConfig = configManager.getGitHubConfig();
    
    if (githubConfig?.auth?.token) {
      return {
        type: 'token',
        token: githubConfig.auth.token
      };
    }
    
    // Fall back to environment variable
    if (process.env.GITHUB_TOKEN) {
      return {
        type: 'token',
        token: process.env.GITHUB_TOKEN
      };
    }
    
    return { type: 'none' };
  }

  /**
   * Make an authenticated request to the GitHub API
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    
    // Apply authentication
    const headers: HeadersInit = {
      'Accept': 'application/vnd.github.v3+json',
      ...(options.headers as Record<string, string> || {})
    };
    
    if (this.authConfig.type === 'token' && this.authConfig.token) {
      headers['Authorization'] = `token ${this.authConfig.token}`;
    }
    
    // Perform the request
    const response = await fetch(url, {
      ...options,
      headers
    });
    
    // Update rate limit information
    this.rateLimitRemaining = parseInt(response.headers.get('x-ratelimit-remaining') || '60', 10);
    this.rateLimitReset = parseInt(response.headers.get('x-ratelimit-reset') || '0', 10);
    
    // Handle rate limiting
    if (response.status === 403 && this.rateLimitRemaining === 0) {
      const resetDate = new Date(this.rateLimitReset * 1000);
      throw new Error(`GitHub API rate limit exceeded. Resets at ${resetDate.toISOString()}`);
    }
    
    // Handle other errors
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${errorText}`);
    }
    
    // Parse JSON response
    return await response.json() as T;
  }

  /**
   * Check if we can make requests to the GitHub API
   */
  async checkAuth(): Promise<boolean> {
    try {
      if (this.authConfig.type === 'none') {
        return true; // Can make unauthenticated requests
      }
      
      await this.request<{login: string}>('/user');
      return true;
    } catch (error) {
      this.logger.error('GitHub authentication check failed', error);
      return false;
    }
  }

  /**
   * Parse a GitHub repository URL
   */
  parseGitHubUrl(url: string): GitHubRepoInfo {
    if (!url) throw new Error('GitHub URL or repository path is required');
    
    // Handle simple "owner/repo" format
    if (url.indexOf('/') > 0 && !url.includes('://') && !url.includes('github.com')) {
      const [owner, repo] = url.split('/');
      return { owner, repo };
    }
    
    // Handle full URLs
    try {
      const parsedUrl = new URL(url);
      const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
      
      if (pathParts.length < 2) {
        throw new Error('Invalid GitHub repository URL');
      }
      
      const owner = pathParts[0];
      const repo = pathParts[1];
      
      // Check for branch and path
      let branch: string | undefined;
      let path: string | undefined;
      
      if (pathParts.length > 3 && pathParts[2] === 'tree') {
        branch = pathParts[3];
        path = pathParts.slice(4).join('/');
      } else if (pathParts.length > 3 && pathParts[2] === 'blob') {
        branch = pathParts[3];
        path = pathParts.slice(4).join('/');
      }
      
      return { owner, repo, branch, path };
    } catch (error) {
      throw new Error(`Failed to parse GitHub URL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get repository information
   */
  async getRepositoryInfo(owner: string, repo: string): Promise<GitHubRepoInfo> {
    const repoData = await this.request<any>(`/repos/${owner}/${repo}`);
    
    return {
      owner,
      repo,
      fullName: repoData.full_name,
      description: repoData.description,
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      issues: repoData.open_issues_count,
      lastUpdated: repoData.updated_at,
      language: repoData.language
    };
  }

  /**
   * List repository branches
   */
  async listBranches(owner: string, repo: string): Promise<string[]> {
    const branches = await this.request<{name: string}[]>(`/repos/${owner}/${repo}/branches`);
    return branches.map(branch => branch.name);
  }

  /**
   * Get the default branch for a repository
   */
  async getDefaultBranch(owner: string, repo: string): Promise<string> {
    const repoData = await this.request<{default_branch: string}>(`/repos/${owner}/${repo}`);
    return repoData.default_branch;
  }

  /**
   * Clone a GitHub repository to a local directory
   * Returns path to the cloned repository
   */
  async cloneRepository(
    owner: string, 
    repo: string, 
    options: {
      branch?: string;
      depth?: number;
      path?: string;
    } = {}
  ): Promise<string> {
    // Get default branch if not specified
    const branch = options.branch || await this.getDefaultBranch(owner, repo);
    
    // Create a temporary directory if no path specified
    let repoPath: string;
    let tempDir: string | null = null;
    
    if (options.path) {
      repoPath = path.resolve(options.path);
      await fs.mkdir(repoPath, { recursive: true });
    } else {
      const tempDirInfo = createSecureTempDir(`github-${owner}-${repo}-`);
      tempDir = tempDirInfo.tempDir;
      repoPath = tempDir;
    }
    
    try {
      this.logger.info(`Cloning ${owner}/${repo}#${branch} to ${repoPath}`);
      
      // Determine clone URL and auth
      let cloneUrl = `https://github.com/${owner}/${repo}.git`;
      let cloneCommand = `git clone --branch ${branch}`;
      
      // Add authentication if available
      if (this.authConfig.type === 'token' && this.authConfig.token) {
        cloneUrl = `https://${this.authConfig.token}:x-oauth-basic@github.com/${owner}/${repo}.git`;
      }
      
      // Add depth for shallow clone
      if (options.depth) {
        cloneCommand += ` --depth ${options.depth}`;
      }
      
      // Execute git clone
      cloneCommand += ` "${cloneUrl}" "${repoPath}"`;
      execSync(cloneCommand, { stdio: 'ignore' });
      
      return repoPath;
    } catch (error) {
      // Clean up temporary directory if we created one
      if (tempDir) {
        await cleanupTempFiles('', tempDir, this.logger);
      }
      
      throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get repository README content
   */
  async getReadme(owner: string, repo: string, branch?: string): Promise<string> {
    try {
      const endpoint = branch
        ? `/repos/${owner}/${repo}/readme?ref=${branch}`
        : `/repos/${owner}/${repo}/readme`;
      
      const readme = await this.request<{content: string, encoding: string}>(endpoint);
      
      if (readme.encoding === 'base64') {
        return Buffer.from(readme.content, 'base64').toString('utf-8');
      }
      
      return readme.content;
    } catch (error) {
      this.logger.warn(`Could not fetch README for ${owner}/${repo}`, error);
      return '';
    }
  }

  /**
   * Generate a context object with repository metadata
   */
  async generateRepositoryContext(owner: string, repo: string, branch?: string): Promise<GitHubRepositoryContext> {
    // Get repository information
    const repoInfo = await this.getRepositoryInfo(owner, repo);
    
    // Get README
    const readme = await this.getReadme(owner, repo, branch);
    
    // Get default branch if not specified
    const defaultBranch = branch || await this.getDefaultBranch(owner, repo);
    
    // TODO: Get contributors, languages, directory structure, etc.
    
    return {
      repository: {
        ...repoInfo,
        branch: branch || defaultBranch
      },
      readme,
      // Add more context as needed
    };
  }
}

/**
 * Create a GitHub API client with default configuration
 */
export function createGitHubClient(logger?: Logger): GitHubApiClient {
  return new GitHubApiClient({ logger });
}
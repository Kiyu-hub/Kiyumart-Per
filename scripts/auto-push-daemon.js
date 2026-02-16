#!/usr/bin/env node

/**
 * Auto-commit and push watcher
 * Monitors file changes and automatically commits + pushes to GitHub
 * Runs as a background daemon
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = process.cwd();
const GITIGNORE_FILE = path.join(REPO_ROOT, '.gitignore-watcher');
const PID_FILE = path.join(REPO_ROOT, '.git', 'watcher.pid');
const LOG_FILE = path.join(REPO_ROOT, '.git', 'auto-commit.log');
const DEBOUNCE_TIME = 3000; // Wait 3 seconds after last change before committing

let debounceTimer = null;
let isCommitting = false;

// Parse .gitignore to get patterns to ignore
function getIgnorePatterns() {
  const patterns = [
    'node_modules',
    'dist',
    '.git',
    '.vscode',
    '*.log',
    '.DS_Store',
    'cookiejar',
    'server.pid',
    '.env',
    '.env.local',
    'coverage',
    'build',
  ];

  try {
    const gitignore = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    return patterns.concat(gitignore.split('\n').filter(line => line.trim() && !line.startsWith('#')));
  } catch {
    return patterns;
  }
}

function shouldIgnorePath(filePath) {
  const relativePath = path.relative(REPO_ROOT, filePath);
  const ignorePatterns = getIgnorePatterns();

  return ignorePatterns.some(pattern => {
    if (relativePath.includes(pattern)) return true;
    if (relativePath.startsWith(pattern)) return true;
    if (pattern.includes('*') && new RegExp(pattern.replace(/\*/g, '.*')).test(relativePath)) return true;
    return false;
  });
}

function log(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  console.log(logEntry);
  fs.appendFileSync(LOG_FILE, logEntry, 'utf8');
}

async function commitAndPush() {
  if (isCommitting) return;

  try {
    isCommitting = true;

    // Check if there are changes
    const status = execSync('git status --porcelain', { cwd: REPO_ROOT, encoding: 'utf8' });
    
    if (!status.trim()) {
      log('No changes detected');
      return;
    }

    log(`Detected changes:\n${status}`);

    // Stage all changes
    execSync('git add -A', { cwd: REPO_ROOT });
    log('Staged changes');

    // Create commit with timestamp
    const timestamp = new Date().toISOString();
    const commitMessage = `Auto-commit: ${timestamp}`;
    
    execSync(`git commit -m "${commitMessage}"`, { cwd: REPO_ROOT });
    log(`Committed: ${commitMessage}`);

    // Push to GitHub
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    execSync(`git push origin ${branch}`, { cwd: REPO_ROOT });
    log(`Pushed to origin/${branch}`);

  } catch (error) {
    log(`Error during commit/push: ${error.message}`);
  } finally {
    isCommitting = false;
  }
}

function debouncedCommitAndPush() {
  if (debounceTimer) clearTimeout(debounceTimer);
  
  debounceTimer = setTimeout(() => {
    commitAndPush();
  }, DEBOUNCE_TIME);
}

function watchDirectory(dir) {
  try {
    const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      
      const fullPath = path.join(dir, filename);
      
      // Skip ignored patterns
      if (shouldIgnorePath(fullPath)) return;

      // Skip certain file operations
      if (filename.endsWith('~') || filename.startsWith('.')) return;

      log(`File changed: ${filename}`);
      debouncedCommitAndPush();
    });

    watcher.on('error', (error) => {
      log(`Watcher error: ${error.message}`);
    });

    return watcher;
  } catch (error) {
    log(`Error setting up watcher: ${error.message}`);
    return null;
  }
}

function daemonize() {
  // Write PID file
  fs.writeFileSync(PID_FILE, process.pid.toString(), 'utf8');
  log(`Watcher daemon started (PID: ${process.pid})`);

  // Start watching
  const watcher = watchDirectory(REPO_ROOT);

  if (!watcher) {
    process.exit(1);
  }

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    log('Received SIGTERM, shutting down gracefully');
    watcher.close();
    fs.unlinkSync(PID_FILE);
    process.exit(0);
  });

  process.on('SIGINT', () => {
    log('Received SIGINT, shutting down gracefully');
    watcher.close();
    fs.unlinkSync(PID_FILE);
    process.exit(0);
  });
}

// Start the daemon
daemonize();

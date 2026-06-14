/**
 * IndexedDB File Manager
 * Self-contained virtual file system backed by IndexedDB.
 *
 * @module file-manager
 */

/* ── Constants ──────────────────────────────────────────────────────────── */

const DB_NAME = 'codex-mobile-fs';
const DB_VERSION = 1;
const STORE_NAME = 'files';

/* ── Default project files ──────────────────────────────────────────────── */

const DEFAULT_FILES = {
  '/src/main.swift': {
    path: '/src/main.swift',
    content: [
      '// main.swift - Application entry point',
      'import Foundation',
      '',
      '/// Main application class',
      'class CodexApp {',
      '    let name: String',
      '    let version: String',
      '',
      '    init(name: String = "Codex", version: String = "1.0.0") {',
      '        self.name = name',
      '        self.version = version',
      '    }',
      '',
      '    func run() {',
      '        print("🚀 \\(name) v\\(version) starting...")',
      '        print("Hello, World!")',
      '        print("✅ Application started successfully")',
      '    }',
      '}',
      '',
      '// Entry point',
      'let app = CodexApp()',
      'app.run()',
      '',
    ].join('\n'),
  },

  '/src/utils.swift': {
    path: '/src/utils.swift',
    content: [
      '// utils.swift - Utility functions',
      'import Foundation',
      '',
      '/// String utilities',
      'struct StringUtils {',
      '    /// Check if a string is empty or whitespace',
      '    static func isEmpty(_ str: String) -> Bool {',
      '        return str.trimmingCharacters(in: .whitespaces).isEmpty',
      '    }',
      '',
      '    /// Reverse a string',
      '    static func reverse(_ str: String) -> String {',
      '        return String(str.reversed())',
      '    }',
      '',
      '    /// Capitalize first letter',
      '    static func capitalizeFirst(_ str: String) -> String {',
      '        guard let first = str.first else { return str }',
      '        return String(first).uppercased() + str.dropFirst()',
      '    }',
      '}',
      '',
      '/// Math utilities',
      'struct MathUtils {',
      '    /// Generate a random integer in range',
      '    static func randomInt(min: Int, max: Int) -> Int {',
      '        return Int.random(in: min...max)',
      '    }',
      '',
      '    /// Clamp a value to a range',
      '    static func clamp<T: Comparable>(_ value: T, min: T, max: T) -> T {',
      '        return Swift.min(Swift.max(value, min), max)',
      '    }',
      '',
      '    /// Format bytes to human readable string',
      '    static func formatBytes(_ bytes: Int) -> String {',
      '        let units = ["B", "KB", "MB", "GB"]',
      '        var size = Double(bytes)',
      '        var idx = 0',
      '        while size >= 1024 && idx < units.count - 1 {',
      '            size /= 1024',
      '            idx += 1',
      '        }',
      '        return String(format: "%.1f %@", size, units[idx])',
      '    }',
      '}',
      '',
    ].join('\n'),
  },

  '/src/tests/test_main.swift': {
    path: '/src/tests/test_main.swift',
    content: [
      '// test_main.swift - Unit tests',
      'import XCTest',
      '@testable import CodexApp',
      '',
      'final class StringUtilsTests: XCTestCase {',
      '',
      '    func testIsEmpty() {',
      '        XCTAssertTrue(StringUtils.isEmpty(""))',
      '        XCTAssertTrue(StringUtils.isEmpty("   "))',
      '        XCTAssertFalse(StringUtils.isEmpty("hello"))',
      '    }',
      '',
      '    func testReverse() {',
      '        XCTAssertEqual(StringUtils.reverse("hello"), "olleh")',
      '        XCTAssertEqual(StringUtils.reverse(""), "")',
      '        XCTAssertEqual(StringUtils.reverse("a"), "a")',
      '    }',
      '',
      '    func testCapitalizeFirst() {',
      '        XCTAssertEqual(StringUtils.capitalizeFirst("hello"), "Hello")',
      '        XCTAssertEqual(StringUtils.capitalizeFirst(""), "")',
      '    }',
      '}',
      '',
      'final class MathUtilsTests: XCTestCase {',
      '',
      '    func testClamp() {',
      '        XCTAssertEqual(MathUtils.clamp(5, min: 0, max: 10), 5)',
      '        XCTAssertEqual(MathUtils.clamp(-5, min: 0, max: 10), 0)',
      '        XCTAssertEqual(MathUtils.clamp(15, min: 0, max: 10), 10)',
      '    }',
      '',
      '    func testFormatBytes() {',
      '        XCTAssertEqual(MathUtils.formatBytes(0), "0.0 B")',
      '        XCTAssertEqual(MathUtils.formatBytes(1024), "1.0 KB")',
      '        XCTAssertEqual(MathUtils.formatBytes(1536), "1.5 KB")',
      '    }',
      '}',
      '',
      '// Run all tests',
      'XCTMain([',
      '    StringUtilsTests.self,',
      '    MathUtilsTests.self,',
      '])',
      '',
    ].join('\n'),
  },

  '/README.md': {
    path: '/README.md',
    content: [
      '# Codex Mobile Project',
      '',
      'A sample Swift project for the Android Codex mobile development environment.',
      '',
      '## Features',
      '',
      '- Swift application entry point (`main.swift`)',
      '- Utility functions (`utils.swift`)',
      '- Unit tests (`test_main.swift`)',
      '- Codex AI integration via `AGENTS.md`',
      '',
      '## Getting Started',
      '',
      '```bash',
      '# Run the application',
      'swift run src/main.swift',
      '',
      '# Run tests',
      'swift test',
      '```',
      '',
      '## Project Structure',
      '',
      '```',
      '/',
      '├── src/',
      '│   ├── main.swift          # Entry point',
      '│   ├── utils.swift         # Utilities',
      '│   └── tests/',
      '│       └── test_main.swift # Unit tests',
      '├── docs/',
      '│   └── architecture.md     # Architecture docs',
      '├── AGENTS.md                # Codex AI config',
      '├── package.json             # Project config',
      '└── README.md                # This file',
      '```',
      '',
      '## License',
      '',
      'MIT',
      '',
    ].join('\n'),
  },

  '/package.json': {
    path: '/package.json',
    content: JSON.stringify(
      {
        name: 'codex-mobile-project',
        version: '1.0.0',
        description: 'A sample Swift project for Android Codex',
        main: 'src/main.swift',
        scripts: {
          start: 'swift run src/main.swift',
          test: 'swift test',
          build: 'swift build',
        },
        keywords: ['swift', 'codex', 'mobile'],
        author: 'Codex',
        license: 'MIT',
        codex: {
          language: 'swift',
          framework: 'none',
          minVersion: '5.5',
        },
      },
      null,
      2,
    ),
  },

  '/AGENTS.md': {
    path: '/AGENTS.md',
    content: [
      '# AGENTS.md',
      '',
      '## Project Configuration for Codex AI',
      '',
      '### Build & Test Commands',
      '- `swift run src/main.swift` - Run the application',
      '- `swift test` - Run unit tests',
      '- `swift build` - Build the project',
      '',
      '### Code Style',
      '- Follow Swift API Design Guidelines',
      '- Use 4 spaces for indentation',
      '- Document all public types and functions',
      '- Prefer value types (struct) over reference types (class)',
      '',
      '### Architecture',
      '- Entry point: `src/main.swift`',
      '- Utilities: `src/utils.swift`',
      '- Tests: `src/tests/`',
      '',
      '### File Conventions',
      '- Swift files use `.swift` extension',
      '- Test files prefixed with `test_`',
      '- Documentation in `docs/` directory',
      '',
    ].join('\n'),
  },

  '/docs/architecture.md': {
    path: '/docs/architecture.md',
    content: [
      '# Architecture',
      '',
      '## Overview',
      '',
      'This project follows a simple, modular architecture:',
      '',
      '```',
      '┌──────────────┐     ┌──────────────┐     ┌──────────────┐',
      '│  main.swift  │────▶│  utils.swift  │     │  CodexApp    │',
      '│  (entry)     │     │  (helpers)    │     │  (runtime)   │',
      '└──────────────┘     └──────────────┘     └──────────────┘',
      '```',
      '',
      '## Components',
      '',
      '### 1. CodexApp (main.swift)',
      '- Application entry point',
      '- Initializes and runs the application',
      '- Manages application lifecycle',
      '',
      '### 2. Utilities (utils.swift)',
      '- `StringUtils` - String manipulation helpers',
      '- `MathUtils` - Math operation helpers',
      '- Stateless, pure functions',
      '',
      '### 3. Tests (test_main.swift)',
      '- XCTest-based unit tests',
      '- Tests for StringUtils and MathUtils',
      '- Run via `swift test`',
      '',
      '## Data Flow',
      '',
      '1. Application starts in `main.swift`',
      '2. `CodexApp.run()` is called',
      '3. Utility functions from `utils.swift` are available',
      '4. Tests verify correctness independently',
      '',
      '## Future Considerations',
      '',
      '- Add networking layer',
      '- Add persistence with SQLite or Core Data',
      '- Add UI with SwiftUI or UIKit',
      '',
    ].join('\n'),
  },
};

/* ── Language map ───────────────────────────────────────────────────────── */

const LANGUAGE_MAP = {
  '.swift': 'swift',
  '.js': 'javascript',
  '.ts': 'typescript',
  '.jsx': 'javascript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.json': 'json',
  '.md': 'markdown',
  '.html': 'html',
  '.css': 'css',
  '.java': 'java',
  '.kt': 'kotlin',
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.sh': 'shell',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.xml': 'xml',
  '.sql': 'sql',
  '.rb': 'ruby',
  '.php': 'php',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.txt': 'plaintext',
  '.toml': 'toml',
  '.lua': 'lua',
  '.dart': 'dart',
};

/* ── Icon map ───────────────────────────────────────────────────────────── */

const ICON_MAP = {
  '.swift': '🦅',
  '.js': '📜',
  '.ts': '📘',
  '.jsx': '⚛️',
  '.tsx': '⚛️',
  '.py': '🐍',
  '.json': '⚙️',
  '.md': '📝',
  '.html': '🌐',
  '.css': '🎨',
  '.java': '☕',
  '.kt': '🟣',
  '.go': '🐹',
  '.rs': '🦀',
  '.c': '🔧',
  '.cpp': '🔧',
  '.sh': '🖥️',
  '.yml': '⚙️',
  '.yaml': '⚙️',
  '.xml': '📄',
  '.sql': '🗄️',
  '.txt': '📄',
  '.lua': '🌙',
  '.dart': '🎯',
};

/* ── FileManager ────────────────────────────────────────────────────────── */

export class FileManager {
  constructor() {
    this.db = null;
  }

  /* ── IndexedDB core ────────────────────────────────────────────────── */

  /**
   * Open the IndexedDB database, creating the store if needed.
   */
  _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'path' });
          store.createIndex('language', 'language', { unique: false });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Wrap an IDBRequest in a promise.
   */
  _req(tx, storeName, method, ...args) {
    return new Promise((resolve, reject) => {
      const store = tx.objectStore(storeName);
      const req = store[method](...args);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /* ── Initialization ────────────────────────────────────────────────── */

  /**
   * Initialize the file manager. Opens IndexedDB and seeds default files
   * if the store is empty.
   */
  async init() {
    this.db = await this._openDB();

    // Check if store is empty
    const allKeys = await new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (allKeys.length === 0) {
      await this._seedDefaultFiles();
    }

    return this;
  }

  /**
   * Seed the default project files into IndexedDB.
   */
  async _seedDefaultFiles() {
    const tx = this.db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const now = Date.now();

    for (const [path, file] of Object.entries(DEFAULT_FILES)) {
      const record = {
        path,
        content: file.content,
        language: this.getFileLanguage(path),
        size: file.content.length,
        modified: now,
      };
      store.put(record);
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /* ── File operations ───────────────────────────────────────────────── */

  /**
   * Read a file by path.
   * @returns {Promise<{path, content, language, size, modified} | null>}
   */
  async readFile(path) {
    const normalized = this._normalizePath(path);

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(normalized);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Write (create or update) a file.
   */
  async writeFile(path, content) {
    const normalized = this._normalizePath(path);

    const record = {
      path: normalized,
      content,
      language: this.getFileLanguage(normalized),
      size: content.length,
      modified: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Patch a file by finding and replacing a substring.
   * @returns {Promise<{success: boolean, path: string, message?: string}>}
   */
  async patchFile(path, oldStr, newStr) {
    const file = await this.readFile(path);
    if (!file) {
      return { success: false, path, message: 'File not found' };
    }

    const idx = file.content.indexOf(oldStr);
    if (idx === -1) {
      return { success: false, path, message: 'oldStr not found in file' };
    }

    // Replace first occurrence (or all if oldStr is unique)
    const occurrences = file.content.split(oldStr).length - 1;
    let newContent;
    if (occurrences > 1) {
      // Replace only first occurrence
      newContent = file.content.replace(oldStr, newStr);
    } else {
      newContent = file.content.replace(oldStr, newStr);
    }

    await this.writeFile(path, newContent);

    return {
      success: true,
      path,
      message: `Replaced ${occurrences} occurrence(s)`,
    };
  }

  /**
   * Delete a file by path.
   */
  async deleteFile(path) {
    const normalized = this._normalizePath(path);

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(normalized);
      req.onsuccess = () => resolve({ success: true, path: normalized });
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Create a new file with a type marker.
   */
  async createFile(path, content = '', type = 'file') {
    const normalized = this._normalizePath(path);

    // Check if file already exists
    const existing = await this.readFile(normalized);
    if (existing) {
      throw new Error(`File already exists: ${normalized}`);
    }

    const record = {
      path: normalized,
      content,
      language: this.getFileLanguage(normalized),
      size: content.length,
      modified: Date.now(),
      type,
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  }

  /* ── Directory operations ──────────────────────────────────────────── */

  /**
   * List files in a directory.
   * @param {string} [dirPath='/'] - Directory to list
   * @returns {Promise<Array<{name, path, isFolder, size, modified}>>}
   */
  async listFiles(dirPath = '/') {
    const normalizedDir = this._normalizePath(dirPath);
    const dirPrefix = normalizedDir === '/' ? '/' : normalizedDir + '/';

    // Get all files
    const allFiles = await new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    const entries = new Map();

    for (const file of allFiles) {
      const filePath = file.path;

      // Only consider files under the target directory
      if (dirPath === '/') {
        // Root: check if file is in root or a subfolder
        if (!filePath.startsWith('/')) continue;
      } else {
        if (!filePath.startsWith(dirPrefix)) continue;
      }

      // Get the relative path
      const relativePart = dirPath === '/' ? filePath : filePath.slice(dirPrefix.length);

      // Check if this is a direct child or nested
      const segments = relativePart.split('/').filter(Boolean);

      if (segments.length === 0) continue;

      const name = segments[0];
      const isDirectChild = segments.length === 1;

      if (isDirectChild) {
        // Direct file child
        if (!entries.has(name)) {
          entries.set(name, {
            name,
            path: dirPath === '/' ? '/' + name : dirPrefix + name,
            isFolder: false,
            size: file.size || 0,
            modified: file.modified || 0,
          });
        }
      } else {
        // It's in a subfolder - add the folder entry
        const folderPath = dirPath === '/' ? '/' + name : dirPrefix + name;
        if (!entries.has(name)) {
          entries.set(name, {
            name,
            path: folderPath,
            isFolder: true,
            size: 0,
            modified: file.modified || 0,
          });
        } else {
          // Update folder's modified to latest
          const existing = entries.get(name);
          if ((file.modified || 0) > (existing.modified || 0)) {
            existing.modified = file.modified;
          }
        }
      }
    }

    // Sort: folders first, then alphabetical
    const result = Array.from(entries.values()).sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return result;
  }

  /* ── Search ────────────────────────────────────────────────────────── */

  /**
   * Search file contents (grep-like).
   * @param {string} query - Search string
   * @param {string} [dirPath] - Optional directory to limit search
   * @returns {Promise<Array<{path, line, content}>>}
   */
  async searchFiles(query, dirPath) {
    if (!query) return [];

    const allFiles = await new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    const results = [];
    const queryLower = query.toLowerCase();

    for (const file of allFiles) {
      // Filter by directory if specified
      if (dirPath) {
        const normalizedDir = this._normalizePath(dirPath);
        const prefix = normalizedDir === '/' ? '/' : normalizedDir + '/';
        if (!file.path.startsWith(prefix) && file.path !== normalizedDir) continue;
      }

      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(queryLower)) {
          results.push({
            path: file.path,
            line: i + 1,
            content: lines[i],
          });
        }
      }
    }

    return results;
  }

  /* ── Project tree ──────────────────────────────────────────────────── */

  /**
   * Get the full project tree as a nested structure.
   * @returns {Promise<Object>} Nested tree of { name, path, type, children? }
   */
  async getProjectTree() {
    const allFiles = await new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    const root = { name: '/', path: '/', type: 'folder', children: [] };

    for (const file of allFiles) {
      const segments = file.path.split('/').filter(Boolean);
      let current = root;

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const segPath = '/' + segments.slice(0, i + 1).join('/');
        const isLast = i === segments.length - 1;

        // Find existing child
        let child = current.children.find((c) => c.name === seg);

        if (!child) {
          child = {
            name: seg,
            path: segPath,
            type: isLast ? 'file' : 'folder',
            children: [],
          };
          current.children.push(child);
        }

        if (isLast) {
          child.type = 'file';
          child.size = file.size;
          child.modified = file.modified;
          child.language = file.language;
        }

        current = child;
      }
    }

    // Sort children recursively
    this._sortTree(root);

    return root;
  }

  _sortTree(node) {
    if (!node.children) return;
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const child of node.children) {
      this._sortTree(child);
    }
  }

  /* ── Project stats ─────────────────────────────────────────────────── */

  /**
   * Get aggregate project statistics.
   * @returns {Promise<{totalFiles, totalLines, languages: Object}>}
   */
  async getProjectStats() {
    const allFiles = await new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    const stats = {
      totalFiles: allFiles.length,
      totalLines: 0,
      totalSize: 0,
      languages: {},
    };

    for (const file of allFiles) {
      const lines = file.content ? file.content.split('\n').length : 0;
      stats.totalLines += lines;
      stats.totalSize += file.size || 0;

      const lang = file.language || 'plaintext';
      stats.languages[lang] = (stats.languages[lang] || 0) + 1;
    }

    return stats;
  }

  /* ── Utilities ─────────────────────────────────────────────────────── */

  /**
   * Determine language from file extension.
   */
  getFileLanguage(path) {
    const ext = this._getExtension(path);
    return LANGUAGE_MAP[ext] || 'plaintext';
  }

  /**
   * Get an emoji icon for a file based on its extension.
   */
  getIconForFile(path) {
    const ext = this._getExtension(path);
    return ICON_MAP[ext] || '📄';
  }

  /**
   * Normalize a path (ensure leading slash, no trailing slash).
   */
  _normalizePath(path) {
    if (!path) return '/';
    let p = path.trim();
    if (!p.startsWith('/')) p = '/' + p;
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p;
  }

  /**
   * Get the lowercase file extension including the dot.
   */
  _getExtension(path) {
    const baseName = path.split('/').pop();
    const dotIdx = baseName.lastIndexOf('.');
    if (dotIdx === -1 || dotIdx === 0) return '';
    return baseName.slice(dotIdx).toLowerCase();
  }
}

export default FileManager;

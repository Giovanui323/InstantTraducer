/**
 * Performance optimization utilities for string operations and caching
 */

interface StringCache {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  clear(): void;
  size(): number;
}

/**
 * Simple LRU cache for string operations
 */
export class StringLRUCache implements StringCache {
  private cache = new Map<string, string>();
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  get(key: string): string | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: string): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Efficient string builder to avoid multiple concatenations
 */
export class StringBuilder {
  private parts: string[] = [];

  constructor(initialCapacity: number = 128) {
    this.parts = new Array(initialCapacity);
  }

  append(str: string): StringBuilder {
    if (str != null) {
      this.parts.push(String(str));
    }
    return this;
  }

  appendLine(str: string = ''): StringBuilder {
    return this.append(str).append('\n');
  }

  insert(index: number, str: string): StringBuilder {
    if (str != null && index >= 0 && index <= this.parts.length) {
      this.parts.splice(index, 0, String(str));
    }
    return this;
  }

  clear(): StringBuilder {
    this.parts.length = 0;
    return this;
  }

  toString(): string {
    return this.parts.join('');
  }

  length(): number {
    return this.parts.reduce((sum, part) => sum + part.length, 0);
  }

  isEmpty(): boolean {
    return this.parts.length === 0;
  }
}

/**
 * Memoization utility for expensive string operations
 */
export function memoizeStringOperation<T extends (...args: any[]) => string>(
  fn: T,
  cache: StringCache = new StringLRUCache(100)
): T {
  return ((...args: any[]) => {
    const key = JSON.stringify(args);
    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
}

/**
 * Batch string operations to reduce memory allocations
 */
export class BatchStringProcessor {
  private batch: Array<{ operation: 'append' | 'insert' | 'replace', args: any[] }> = [];
  private cache: StringCache;

  constructor(cacheSize: number = 500) {
    this.cache = new StringLRUCache(cacheSize);
  }

  append(str: string): BatchStringProcessor {
    this.batch.push({ operation: 'append', args: [str] });
    return this;
  }

  insert(index: number, str: string): BatchStringProcessor {
    this.batch.push({ operation: 'insert', args: [index, str] });
    return this;
  }

  replace(start: number, end: number, str: string): BatchStringProcessor {
    this.batch.push({ operation: 'replace', args: [start, end, str] });
    return this;
  }

  execute(initialString: string = ''): string {
    let result = initialString;
    
    for (const op of this.batch) {
      switch (op.operation) {
        case 'append':
          result += op.args[0];
          break;
        case 'insert':
          const [index, str] = op.args;
          result = result.slice(0, index) + str + result.slice(index);
          break;
        case 'replace':
          const [start, end, replaceStr] = op.args;
          result = result.slice(0, start) + replaceStr + result.slice(end);
          break;
      }
    }
    
    this.batch.length = 0;
    return result;
  }

  clear(): BatchStringProcessor {
    this.batch.length = 0;
    return this;
  }

  size(): number {
    return this.batch.length;
  }
}

/**
 * Regex cache to avoid recompiling the same patterns
 */
export class RegexCache {
  private cache = new Map<string, RegExp>();
  private maxSize: number;

  constructor(maxSize: number = 200) {
    this.maxSize = maxSize;
  }

  get(pattern: string, flags?: string): RegExp {
    const key = `${pattern}:${flags || ''}`;
    let regex = this.cache.get(key);
    
    if (!regex) {
      regex = new RegExp(pattern, flags);
      if (this.cache.size >= this.maxSize) {
        // Remove oldest entry
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(key, regex);
    }
    
    return regex;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Debounce function to limit execution rate
 */
export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

/**
 * String utility functions with performance optimizations
 */
export const StringUtils = {
  /**
   * Efficient string concatenation using StringBuilder
   */
  build: (parts: string[]): string => {
    const builder = new StringBuilder(parts.length);
    parts.forEach(part => builder.append(part));
    return builder.toString();
  },

  /**
   * Fast string replacement with caching
   */
  replace: (str: string, search: string, replace: string, cache?: StringCache): string => {
    if (!cache) {
      return str.split(search).join(replace);
    }
    
    const key = `replace:${str}:${search}:${replace}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    
    const result = str.split(search).join(replace);
    cache.set(key, result);
    return result;
  },

  /**
   * Efficient string splitting with caching
   */
  split: (str: string, separator: string | RegExp, cache?: StringCache): string[] => {
    if (!cache) {
      return str.split(separator);
    }
    
    const sepStr = separator instanceof RegExp ? separator.source : separator;
    const key = `split:${str}:${sepStr}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
      return JSON.parse(cached);
    }
    
    const result = str.split(separator);
    cache.set(key, JSON.stringify(result));
    return result;
  },

  /**
   * Fast HTML escaping
   */
  escapeHtml: (str: string): string => {
    const htmlEscapes: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    
    return str.replace(/[&<>"']/g, (match) => htmlEscapes[match]);
  },

  /**
   * Efficient string trimming
   */
  trim: (str: string): string => {
    return str.replace(/^\s+|\s+$/g, '');
  },

  /**
   * Fast string padding
   */
  pad: (str: string, length: number, char: string = ' '): string => {
    if (str.length >= length) return str;
    const padding = char.repeat(length - str.length);
    return str + padding;
  }
};

// Global instances for shared usage
export const globalStringCache = new StringLRUCache(1000);
export const globalRegexCache = new RegexCache(200);
export const globalBatchProcessor = new BatchStringProcessor();
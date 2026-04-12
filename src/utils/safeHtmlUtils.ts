/**
 * Safe HTML rendering utilities to prevent XSS attacks
 * Provides secure methods for rendering HTML with user content
 */

import { UserHighlight, UserNote } from '../types';

// CSS property whitelist for inline styles
const ALLOWED_CSS_PROPERTIES = new Set([
  'background', 'background-color', 'border', 'border-radius', 'color', 
  'font-size', 'font-weight', 'font-style', 'letter-spacing', 'line-height',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'text-align', 'text-indent', 'text-transform', 'vertical-align',
  'display', 'flex', 'flex-direction', 'gap', 'align-items', 'min-width',
  'flex-grow', 'flex-shrink', 'flex-basis', 'box-decoration-break', 
  '-webkit-box-decoration-break', 'cursor', 'width', 'height', 'border-top'
]);

// HTML tag whitelist
const ALLOWED_HTML_TAGS = new Set([
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 
  'sup', 'sub', 'br', 'hr', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre'
]);

/**
 * Validates and sanitizes CSS property values
 */
export const sanitizeCssValue = (property: string, value: string): string => {
  if (!ALLOWED_CSS_PROPERTIES.has(property)) {
    return '';
  }

  // Remove potentially dangerous characters and validate format
  const sanitized = value
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .replace(/expression/gi, '') // Remove CSS expressions
    .replace(/behavior/gi, '') // Remove IE behaviors
    .trim();

  // Additional validation for specific properties
  switch (property) {
    case 'background':
    case 'background-color':
      return sanitizeColor(sanitized);
    case 'color':
      return sanitizeColor(sanitized);
    case 'font-size':
      return sanitizeFontSize(sanitized);
    case 'margin':
    case 'padding':
      return sanitizeSpacing(sanitized);
    case 'border':
    case 'border-radius':
      return sanitizeBorder(sanitized);
    default:
      return sanitized;
  }
};

/**
 * Sanitizes color values
 */
const sanitizeColor = (color: string): string => {
  // Allow hex colors
  if (/^#[0-9a-fA-F]{3,8}$/.test(color)) return color;
  
  // Allow rgb/rgba colors
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0(?:\.\d+)?|1(?:\.0+)?)\s*)?\)$/i.test(color)) return color;
  
  // Allow hsl/hsla colors
  if (/^hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*(?:,\s*(?:0(?:\.\d+)?|1(?:\.0+)?)\s*)?\)$/i.test(color)) return color;
  
  // Allow named colors (basic validation)
  if (/^[a-zA-Z]{3,20}$/.test(color)) return color;
  
  // Allow rgba with decimal opacity
  if (/^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*0?\.\d+\s*\)$/i.test(color)) return color;
  
  return '';
};

/**
 * Sanitizes font size values
 */
const sanitizeFontSize = (size: string): string => {
  // Allow px, em, rem, % values
  if (/^\d+(?:\.\d+)?(?:px|em|rem|%)$/.test(size)) return size;
  
  // Allow predefined sizes
  const predefinedSizes = new Set(['xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large']);
  if (predefinedSizes.has(size.toLowerCase())) return size;
  
  return '';
};

/**
 * Sanitizes spacing values (margin, padding)
 */
const sanitizeSpacing = (spacing: string): string => {
  // Allow single values: 10px, 1em, etc.
  if (/^\d+(?:\.\d+)?(?:px|em|rem|%)$/.test(spacing)) return spacing;
  
  // Allow shorthand values: 10px 20px, 1em 2em 3em, etc.
  if (/^(\d+(?:\.\d+)?(?:px|em|rem|%)(?:\s+\d+(?:\.\d+)?(?:px|em|rem|%)){1,3})$/.test(spacing)) return spacing;
  
  return '';
};

/**
 * Sanitizes border values
 */
const sanitizeBorder = (border: string): string => {
  // Simple border validation - allow basic border syntax
  if (/^\d+(?:\.\d+)?px\s+(?:solid|dashed|dotted)\s+/.test(border)) {
    const parts = border.split(/\s+/);
    if (parts.length >= 3) {
      const sanitizedColor = sanitizeColor(parts.slice(2).join(' '));
      if (sanitizedColor) {
        return `${parts[0]} ${parts[1]} ${sanitizedColor}`;
      }
    }
  }
  
  // Border radius
  if (/^\d+(?:\.\d+)?(?:px|em|rem|%)(?:\s*\/\s*\d+(?:\.\d+)?(?:px|em|rem|%))?$/.test(border)) return border;
  
  return '';
};

/**
 * Builds safe inline style string from an object
 */
export const buildSafeInlineStyle = (styles: Record<string, string>): string => {
  const safeStyles: string[] = [];
  
  for (const [property, value] of Object.entries(styles)) {
    const sanitizedValue = sanitizeCssValue(property, value);
    if (sanitizedValue) {
      safeStyles.push(`${property}: ${sanitizedValue}`);
    }
  }
  
  return safeStyles.join('; ');
};

/**
 * Creates a safe HTML element with sanitized attributes
 */
export const createSafeElement = (
  tag: string, 
  attributes: Record<string, string> = {}, 
  content: string = ''
): string => {
  if (!ALLOWED_HTML_TAGS.has(tag.toLowerCase())) {
    return escapeHtml(content);
  }
  
  const safeAttrs: string[] = [];
  
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'style') {
      const safeStyle = buildSafeInlineStyle(parseStyleString(value));
      if (safeStyle) {
        safeAttrs.push(`style="${safeStyle}"`);
      }
    } else if (key === 'title' || key === 'alt') {
      // Safe attributes that need escaping
      safeAttrs.push(`${key}="${escapeHtml(value)}"`);
    } else if (['class', 'id', 'data-', 'role'].some(allowed => key.startsWith(allowed))) {
      // Allow data attributes and basic accessibility attributes
      safeAttrs.push(`${key}="${escapeHtml(value)}"`);
    }
  }
  
  const attrString = safeAttrs.length > 0 ? ' ' + safeAttrs.join(' ') : '';
  
  // Self-closing tags
  if (['br', 'hr'].includes(tag.toLowerCase())) {
    return `<${tag}${attrString} />`;
  }
  
  return `<${tag}${attrString}>${content}</${tag}>`;
};

/**
 * Parses a style string into an object
 */
const parseStyleString = (styleStr: string): Record<string, string> => {
  const styles: Record<string, string> = {};
  
  styleStr.split(';').forEach(decl => {
    const colonIndex = decl.indexOf(':');
    if (colonIndex > -1) {
      const property = decl.slice(0, colonIndex).trim();
      const value = decl.slice(colonIndex + 1).trim();
      if (property && value) {
        styles[property] = value;
      }
    }
  });
  
  return styles;
};

/**
 * Enhanced HTML escape function
 */
export const escapeHtml = (value: any): string => {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return ch;
    }
  });
};

/**
 * Safe highlight color normalization
 */
export const safeNormalizeHighlightColor = (value?: string): string => {
  const fallback = 'rgba(250, 204, 21, 0.4)';
  const s = String(value ?? '').trim();
  if (!s) return fallback;
  
  return sanitizeColor(s) || fallback;
};

/**
 * Creates safe highlight span
 */
export const createSafeHighlightSpan = (
  content: string, 
  color: string, 
  additionalStyles: Record<string, string> = {}
): string => {
  const safeColor = safeNormalizeHighlightColor(color);
  const defaultStyles = {
    'background': safeColor,
    'border-radius': '2px',
    'box-decoration-break': 'clone',
    '-webkit-box-decoration-break': 'clone'
  };
  
  const finalStyles = { ...defaultStyles, ...additionalStyles };
  return createSafeElement('span', { style: buildSafeInlineStyle(finalStyles) }, escapeHtml(content));
};

/**
 * Validates user-generated content
 */
export const validateUserContent = (content: string): boolean => {
  if (typeof content !== 'string') return false;
  
  // Check for potentially dangerous patterns
  const dangerousPatterns = [
    /<script\b/i,
    /javascript:/i,
    /on\w+\s*=/i, // event handlers
    /data:\s*text\/html/i,
    /vbscript:/i,
    /file:/i,
    /\.exec\s*\(/i,
    /\.eval\s*\(/i
  ];
  
  return !dangerousPatterns.some(pattern => pattern.test(content));
};
import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/ui/escape';

describe('escapeHtml', () => {
  it('escapes HTML metacharacters', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
    expect(escapeHtml(`a & "b" & 'c'`)).toBe(
      'a &amp; &quot;b&quot; &amp; &#39;c&#39;',
    );
  });
});

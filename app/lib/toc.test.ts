import { describe, it, expect } from 'vitest';
import { isMostlyLatin, mergeBilingualHeadings, extractToc } from './toc';

describe('isMostlyLatin', () => {
  it('纯英文副标题判 Latin', () => {
    expect(isMostlyLatin('The Path to AGI')).toBe(true);
  });
  it('纯中文判非 Latin', () => {
    expect(isMostlyLatin('通往通用人工智能之路')).toBe(false);
  });
  it('空串不算 Latin（latin>0 才成立）', () => {
    expect(isMostlyLatin('')).toBe(false);
  });
});

describe('extractToc — H2 + 紧跟英文 H3 副标题不重复', () => {
  it('英文 H3 副标题被并入 H2 的 titleEn，不再单独成条（避免每节出现两次）', () => {
    const md = [
      '## 通往通用人工智能之路',
      '### The Path to AGI',
      '正文段落。',
      '## 规模化的代价',
      '### The Cost of Scale',
      '正文。',
    ].join('\n');
    const toc = extractToc(md);
    expect(toc).toHaveLength(2); // 两节，而非 4 条
    expect(toc[0]).toMatchObject({ level: 2, title: '通往通用人工智能之路', titleEn: 'The Path to AGI' });
    expect(toc[1]).toMatchObject({ level: 2, title: '规模化的代价', titleEn: 'The Cost of Scale' });
    // 确认英文副标题没有作为独立条目混入
    expect(toc.some((e) => e.title === 'The Path to AGI')).toBe(false);
  });

  it('与上一个 H2 之间隔了正文的独立 H3 → 保留为 level-3 条目（不是 H2 的副标题）', () => {
    // extractToc 只把"紧跟 H2 的下一条 H3"当英文副标题吸收；隔了正文的 H3 是独立小节。
    const md = ['## 第一章', '正文段落。', '### 一节小标题', '更多正文。'].join('\n');
    const toc = extractToc(md);
    expect(toc).toHaveLength(2);
    expect(toc[0]).toMatchObject({ level: 2, title: '第一章' });
    expect(toc[0].titleEn).toBeUndefined(); // H2 下一条非空行是正文，没有副标题
    expect(toc[1]).toMatchObject({ level: 3, title: '一节小标题' });
  });

  it('代码块内的 ## 不被当作标题', () => {
    const md = ['## 真标题', '```', '## 这是代码注释不是标题', '```'].join('\n');
    const toc = extractToc(md);
    expect(toc).toHaveLength(1);
    expect(toc[0].title).toBe('真标题');
  });
});

describe('mergeBilingualHeadings — 双语标题折叠（"目录/Contents 错乱"事故）', () => {
  it('相同双语标题（如年份区间）折叠为一条，丢掉重复的那个', () => {
    const md = ['## 2021–2023', '### 2021–2023', '正文。'].join('\n');
    const merged = mergeBilingualHeadings(md);
    const headingCount = merged.split('\n').filter((l) => /^#{2,4}\s/.test(l)).length;
    expect(headingCount).toBe(1); // 重复标题只剩一条
    // 折叠后该节在 TOC 里只出现一次
    expect(extractToc(merged).filter((e) => e.title === '2021–2023')).toHaveLength(1);
  });

  it('不同文本的双语对：保留中文标题，英文降级为斜体行（移出 TOC、不再重复）', () => {
    const md = ['## 通往通用人工智能之路', '### The Path to AGI', '正文。'].join('\n');
    const merged = mergeBilingualHeadings(md);
    const lines = merged.split('\n');
    // 中文 H2 仍是标题
    expect(lines.some((l) => l === '## 通往通用人工智能之路')).toBe(true);
    // 英文不再是 ### 标题
    expect(lines.some((l) => /^###\s+The Path to AGI/.test(l))).toBe(false);
    // 英文被降级为斜体行
    expect(lines.some((l) => l === '*The Path to AGI*')).toBe(true);
  });

  it('连续两个真正的中文子标题（非英文副标题）不被误并', () => {
    const md = ['### 第一节', '### 第二节', '正文。'].join('\n');
    const merged = mergeBilingualHeadings(md);
    const headingCount = merged.split('\n').filter((l) => /^#{2,4}\s/.test(l)).length;
    expect(headingCount).toBe(2); // 两条都在，未被折叠
  });
});

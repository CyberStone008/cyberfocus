'use client';

import { useState, useEffect } from 'react';
import styles from './SourceDrawer.module.css';
import { BOARDS, BoardId } from '../lib/sources-config';

export interface CustomSource {
  id: string;
  name: string;
  abbr: string;
  avatarColor: string;
  label: string;
  description: string;
  url: string;
  type: 'push' | 'pull';
  frequency?: string;         // pull only
  connectionType?: string;    // push only
  pushToken?: string;         // push only, optional
  isCustom: true;
  enabled: boolean;
  boards?: BoardId[];         // 推送到哪些菜单
}

const LABEL_OPTIONS = ['官方博客', '学术论文', '每日精选', '行业博客', '社区论坛', 'AI 媒体', '科技媒体', '技术资讯'];
const FREQUENCY_OPTIONS = ['每天 10:00', '每6小时', '每小时', '每30分钟', '每15分钟'];
const CONNECTION_OPTIONS = ['Webhook', 'RSS 订阅', 'WebSocket', 'Server-Sent Events'];
const AVATAR_COLORS = [
  '#1e293b', '#C9590C', '#000000', '#FF9D00', '#1a73e8',
  '#7c3aed', '#059669', '#dc2626', '#0891b2', '#db2777',
  '#d97706', '#065f46', '#1e40af', '#6d28d9', '#9f1239',
];

function autoAbbr(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  const words = trimmed.split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

export interface BuiltInOverride {
  abbr: string;
  avatarColor: string;
  label: string;
  frequency: string;
  description: string;
  boards?: BoardId[];
}

interface DrawerProps {
  open: boolean;
  mode: 'add' | 'edit';
  /** null when mode === 'add' */
  initial: Partial<Omit<CustomSource, 'isCustom'>> | null;
  isBuiltIn: boolean;
  /** default boards for built-in sources (from sources-config) */
  defaultBoards?: BoardId[];
  /** current board overrides for this source */
  boardOverride?: BoardId[];
  /** default source type when opening in add mode */
  defaultType?: 'push' | 'pull';
  onClose: () => void;
  onSave: (data: CustomSource) => void;
  onSaveOverride?: (id: string, overrides: BuiltInOverride) => void;
  onDelete?: (id: string) => void;
  onToggle?: (id: string, enabled: boolean) => void;
  onSaveBoardOverride?: (id: string, boards: BoardId[] | null) => void;
}

export function SourceDrawer({
  open, mode, initial, isBuiltIn, defaultBoards, boardOverride, defaultType = 'pull',
  onClose, onSave, onSaveOverride, onDelete, onToggle, onSaveBoardOverride,
}: DrawerProps) {
  const [name,           setName]           = useState('');
  const [url,            setUrl]            = useState('');
  const [label,          setLabel]          = useState(LABEL_OPTIONS[0]);
  const [frequency,      setFrequency]      = useState(FREQUENCY_OPTIONS[0]);
  const [connectionType, setConnectionType] = useState(CONNECTION_OPTIONS[0]);
  const [pushToken,      setPushToken]      = useState('');
  const [abbr,           setAbbr]           = useState('');
  const [color,          setColor]          = useState(AVATAR_COLORS[0]);
  const [desc,           setDesc]           = useState('');
  const [enabled,        setEnabled]        = useState(true);
  const [srcType,        setSrcType]        = useState<'push' | 'pull'>(defaultType);
  const [boards,         setBoards]         = useState<BoardId[]>([]);
  const [errors,         setErrors]         = useState<Record<string, string>>({});

  // Populate form when opening
  useEffect(() => {
    if (open && initial) {
      setName(initial.name ?? '');
      setUrl(initial.url ?? '');
      setLabel(initial.label ?? LABEL_OPTIONS[0]);
      setFrequency(initial.frequency ?? FREQUENCY_OPTIONS[0]);
      setConnectionType(initial.connectionType ?? CONNECTION_OPTIONS[0]);
      setPushToken(initial.pushToken ?? '');
      setAbbr(initial.abbr ?? '');
      setColor(initial.avatarColor ?? AVATAR_COLORS[0]);
      setDesc(initial.description ?? '');
      setEnabled(initial.enabled !== false);
      setSrcType(initial.type ?? defaultType);
      // boards: use override if set, else default, else from initial
      setBoards(boardOverride ?? initial.boards ?? defaultBoards ?? []);
      setErrors({});
    } else if (open) {
      setName(''); setUrl(''); setLabel(LABEL_OPTIONS[0]);
      setFrequency(FREQUENCY_OPTIONS[0]);
      setConnectionType(CONNECTION_OPTIONS[0]); setPushToken('');
      setAbbr(''); setColor(AVATAR_COLORS[0]); setDesc('');
      setEnabled(true); setSrcType(defaultType);
      setBoards(defaultBoards ?? ['social']);
      setErrors({});
    }
  }, [open, initial, defaultType, defaultBoards, boardOverride]);

  // Auto-fill abbr when name changes (only if abbr hasn't been manually set)
  function handleNameChange(v: string) {
    setName(v);
    if (!initial?.abbr || abbr === autoAbbr(name)) {
      setAbbr(autoAbbr(v));
    }
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = '请填写信源名称';
    if (!url.trim())  e.url  = '请填写网站地址';
    else if (!/^https?:\/\/.+/.test(url.trim())) e.url = '请输入有效的 URL（以 http/https 开头）';
    if (!abbr.trim()) e.abbr = '请填写头像字母（1-2个字符）';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSaveBuiltIn() {
    if (!abbr.trim()) { setErrors({ abbr: '请填写头像字母（1-2个字符）' }); return; }
    onSaveOverride?.(initial!.id!, {
      abbr: abbr.trim().slice(0, 2).toUpperCase(),
      avatarColor: color,
      label,
      frequency,
      description: desc.trim(),
      boards,
    });
    // Save board override via API
    const isDefault = JSON.stringify(boards.sort()) === JSON.stringify((defaultBoards ?? []).slice().sort());
    onSaveBoardOverride?.(initial!.id!, isDefault ? null : boards);
    onClose();
  }

  function handleSave() {
    if (!validate()) return;
    const id = initial?.id ?? `custom:${Date.now()}`;
    onSave({
      id, name: name.trim(), abbr: abbr.trim().slice(0, 2).toUpperCase(),
      avatarColor: color, label, description: desc.trim(),
      url: url.trim(), type: srcType,
      ...(srcType === 'pull'
        ? { frequency }
        : { connectionType, pushToken: pushToken.trim() || undefined }),
      isCustom: true, enabled, boards,
    });
  }

  function toggleBoard(bid: BoardId) {
    setBoards((prev) =>
      prev.includes(bid) ? prev.filter((b) => b !== bid) : [...prev, bid]
    );
  }

  const typeLabel = srcType === 'push' ? '实时推送' : '定时拉取';
  const title = mode === 'add' ? `添加${typeLabel}信源` : `编辑：${initial?.name ?? ''}`;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`${styles.backdrop} ${open ? styles.backdropVisible : ''}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`}>
        {/* Header */}
        <div className={styles.header}>
          <button className={styles.closeBtn} onClick={onClose}>←</button>
          <h2 className={styles.drawerTitle}>{title}</h2>
          <button className={styles.closeX} onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className={styles.body}>

          {/* Avatar preview + color picker */}
          <div className={styles.avatarSection}>
            <div className={styles.avatarPreview} style={{ background: color }}>
              {abbr || '?'}
            </div>
            <div className={styles.colorSection}>
              <label className={styles.fieldLabel}>头像颜色</label>
              <div className={styles.colorSwatches}>
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`${styles.swatch} ${color === c ? styles.swatchActive : ''}`}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Built-in: toggle enabled */}
          {isBuiltIn && mode === 'edit' && (
            <div className={styles.builtInNotice}>
              <span className={styles.noticeText}>内置信源，核心参数不可修改</span>
              <label className={styles.toggleRow}>
                <span>启用此信源</span>
                <button
                  className={`${styles.toggle} ${enabled ? styles.toggleOn : styles.toggleOff}`}
                  onClick={() => {
                    const next = !enabled;
                    setEnabled(next);
                    onToggle?.(initial!.id!, next);
                  }}
                >
                  <span className={styles.toggleThumb} />
                </button>
              </label>
            </div>
          )}

          {/* Name */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              信源名称 <span className={styles.required}>*</span>
            </label>
            <input
              className={`${styles.input} ${errors.name ? styles.inputError : ''}`}
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="例：MIT Tech Review"
              disabled={isBuiltIn}
            />
            {errors.name && <p className={styles.error}>{errors.name}</p>}
          </div>

          {/* URL */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              网站地址 <span className={styles.required}>*</span>
            </label>
            <input
              className={`${styles.input} ${errors.url ? styles.inputError : ''}`}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              disabled={isBuiltIn}
            />
            {errors.url && <p className={styles.error}>{errors.url}</p>}
          </div>

          {/* Abbr + label row */}
          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                头像字母 <span className={styles.required}>*</span>
              </label>
              <input
                className={`${styles.input} ${errors.abbr ? styles.inputError : ''}`}
                value={abbr}
                onChange={(e) => setAbbr(e.target.value.slice(0, 2).toUpperCase())}
                placeholder="ML"
                maxLength={2}
              />
              {errors.abbr && <p className={styles.error}>{errors.abbr}</p>}
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>来源类型</label>
              <select
                className={styles.select}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              >
                {LABEL_OPTIONS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>
          </div>

          {/* Type selector — only shown in add mode for custom sources */}
          {!isBuiltIn && mode === 'add' && (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>信源类型</label>
              <div className={styles.typeToggle}>
                {(['pull', 'push'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`${styles.typeBtn} ${srcType === t ? styles.typeBtnActive : ''}`}
                    onClick={() => setSrcType(t)}
                  >
                    {t === 'push' ? '⚡ 实时推送' : '↻ 定时拉取'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pull: frequency */}
          {srcType === 'pull' && (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>抓取频率</label>
              <select
                className={styles.select}
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
              >
                {FREQUENCY_OPTIONS.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
          )}

          {/* Push: connection type + token */}
          {srcType === 'push' && (
            <>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>连接方式</label>
                <select
                  className={styles.select}
                  value={connectionType}
                  onChange={(e) => setConnectionType(e.target.value)}
                >
                  {CONNECTION_OPTIONS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>推送令牌（可选）</label>
                <input
                  className={styles.input}
                  value={pushToken}
                  onChange={(e) => setPushToken(e.target.value)}
                  placeholder="用于身份验证的 Token..."
                />
              </div>
            </>
          )}

          {/* Boards — 推送目标 */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>推送到菜单</label>
            <div className={styles.boardsRow}>
              {BOARDS.map((b) => (
                <label key={b.id} className={`${styles.boardChip} ${boards.includes(b.id) ? styles.boardChipOn : ''}`}>
                  <input
                    type="checkbox"
                    checked={boards.includes(b.id)}
                    onChange={() => toggleBoard(b.id)}
                    className={styles.boardCheckbox}
                  />
                  {b.label}
                </label>
              ))}
            </div>
            {boards.length === 0 && (
              <p className={styles.boardHint}>⚠ 未选择任何菜单，该信源内容将不会出现在任何页面</p>
            )}
          </div>

          {/* Description */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>描述（可选）</label>
            <textarea
              className={styles.textarea}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="简短描述该信源的内容方向..."
              rows={3}
            />
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {!isBuiltIn && mode === 'edit' && onDelete && (
            <button
              className={styles.deleteBtn}
              onClick={() => {
                if (confirm(`确定删除「${name}」？`)) onDelete(initial!.id!);
              }}
            >
              删除信源
            </button>
          )}
          <div className={styles.footerRight}>
            <button className={styles.cancelBtn} onClick={onClose}>取消</button>
            {isBuiltIn
              ? <button className={styles.saveBtn} onClick={handleSaveBuiltIn}>保存</button>
              : <button className={styles.saveBtn} onClick={handleSave}>保存</button>
            }
          </div>
        </div>
      </div>
    </>
  );
}

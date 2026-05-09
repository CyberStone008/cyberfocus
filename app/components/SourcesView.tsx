'use client';

import { useState, useMemo, useEffect } from 'react';
import { SourceDef, SourceStatus, SourceType, BoardId, SOURCES, getEffectiveBoards, BOARDS } from '../lib/sources-config';

type ViewMode = 'type' | 'board';
import { SourceDrawer, CustomSource, BuiltInOverride } from './SourceDrawer';
import { SourceTypeModal } from './SourceTypeModal';
import styles from './SourcesView.module.css';

export interface SourceWithStats extends Omit<SourceDef, 'frequency' | 'category'> {
  status: SourceStatus;
  articleCount: number;
  latestAt: string | null;
  isCustom?: boolean;
  enabled?: boolean;
  frequency?: string;
  connectionType?: string;
  pushToken?: string;
  category?: import('../lib/sources-config').SourceCategory;
}

interface Props {
  sources: SourceWithStats[];   // built-in sources with server-side stats
  totalCount: number;
  activeCount: number;
  failingCount: number;
  boardOverrides?: Record<string, BoardId[]>; // from data/sources.json
}

/* ── localStorage helpers ── */
const LS_CUSTOM     = 'cyberfocus:custom-sources';
const LS_OVERRIDES  = 'cyberfocus:source-overrides';

function loadCustom(): CustomSource[] {
  try { return JSON.parse(localStorage.getItem(LS_CUSTOM) ?? '[]'); }
  catch { return []; }
}
function saveCustom(list: CustomSource[]) {
  localStorage.setItem(LS_CUSTOM, JSON.stringify(list));
}

type OverrideMap = Record<string, Partial<BuiltInOverride>>;
function loadOverrides(): OverrideMap {
  try { return JSON.parse(localStorage.getItem(LS_OVERRIDES) ?? '{}'); }
  catch { return {}; }
}
function saveOverrides(m: OverrideMap) {
  localStorage.setItem(LS_OVERRIDES, JSON.stringify(m));
}

/* ── Constants ── */
const STATUS_LABEL: Record<SourceStatus, string> = {
  active: '正常', idle: '空闲', failing: '异常', paused: '已暂停',
};

function formatLatest(iso: string | null): string {
  if (!iso) return '暂无数据';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff < 7)  return `${diff} 天前`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/* ── Avatar ── */
function Avatar({ abbr, color }: { abbr: string; color: string }) {
  return <div className={styles.avatar} style={{ background: color }}>{abbr}</div>;
}

/* ── Source Card ── */
type TriggerState = 'idle' | 'loading' | 'done' | 'error';

function SourceCard({
  src, onEdit, onStatsRefresh,
}: {
  src: SourceWithStats;
  onEdit: (src: SourceWithStats) => void;
  onStatsRefresh: (sourceId: string, count: number, latest: string | null) => void;
}) {
  const isWarn = src.status === 'failing' || src.status === 'paused';
  const isOff  = src.enabled === false;

  const [triggerState, setTriggerState] = useState<TriggerState>('idle');
  const [triggerMsg,   setTriggerMsg]   = useState('');

  async function handleTrigger(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (triggerState === 'loading') return;
    setTriggerState('loading');
    setTriggerMsg('');
    try {
      const res  = await fetch('/api/trigger-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: src.id }),
      });
      const data = await res.json();
      if (data.success) {
        setTriggerState('done');
        setTriggerMsg(data.added > 0 ? `+${data.added} 篇` : '已最新');
        // Refresh card stats from server
        fetch(`/api/source-stats?sourceId=${encodeURIComponent(src.id)}`)
          .then((r) => r.json())
          .then((s) => onStatsRefresh(src.id, s.count, s.latest))
          .catch(() => {/* silently ignore */});
      } else {
        setTriggerState('error');
        setTriggerMsg(data.error ?? '失败');
      }
    } catch {
      setTriggerState('error');
      setTriggerMsg('网络错误');
    }
    // Reset after 4 seconds
    setTimeout(() => { setTriggerState('idle'); setTriggerMsg(''); }, 4000);
  }

  return (
    <div className={`${styles.card} ${isWarn ? styles.cardWarn : ''} ${isOff ? styles.cardOff : ''}`}>
      {/* Edit button — outside <a> so it doesn't trigger navigation */}
      <button
        className={styles.editBtn}
        onClick={(e) => { e.stopPropagation(); onEdit(src); }}
        title="编辑"
      >✎</button>

      {/* Card link area */}
      <a
        href={src.url}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.cardLink}
      >
        <div className={styles.cardTop}>
          <Avatar abbr={src.abbr} color={src.avatarColor} />
          <span className={`${styles.typeBadge} ${styles[`type_${src.type}`]}`}>
            {src.type === 'push' ? '⚡ 推送' : '↻ 拉取'}
          </span>
        </div>

        <div className={styles.cardBody}>
          <div className={styles.cardName}>{src.name}</div>
          <div className={styles.cardLabel}>{src.label}</div>
        </div>

        <div className={styles.cardStatus}>
          <span className={`${styles.statusDot} ${styles[`dot_${src.status}`]}`} />
          <span className={`${styles.statusText} ${styles[`statusText_${src.status}`]}`}>
            {isOff ? '已停用' : STATUS_LABEL[src.status]}
          </span>
          <span className={styles.frequency}>
            {src.type === 'push'
              ? (src.connectionType ?? '实时')
              : (src.frequency ?? '')}
          </span>
        </div>

        <div className={styles.cardFooter}>
          <div className={styles.cardStat}>
            <span className={styles.statNum}>{src.articleCount}</span>
            <span className={styles.statLbl}>已收录</span>
          </div>
          <div className={styles.cardStat}>
            <span className={styles.statNum}>{formatLatest(src.latestAt)}</span>
            <span className={styles.statLbl}>最近更新</span>
          </div>
        </div>
      </a>

      {/* Trigger row — completely below <a>, no overlap, no z-index needed */}
      {src.type === 'pull' && (
        <div className={styles.cardTriggerRow}>
          <button
            className={`${styles.triggerBtn} ${triggerState !== 'idle' ? styles[`trigger_${triggerState}`] : ''}`}
            onClick={handleTrigger}
            disabled={triggerState === 'loading' || isOff}
          >
            {triggerState === 'loading' ? (
              <><span className={styles.triggerSpinner} /> 拉取中…</>
            ) : triggerState === 'done' ? (
              `✓ ${triggerMsg}`
            ) : triggerState === 'error' ? (
              `✕ ${triggerMsg}`
            ) : (
              '⟳ 立即拉取'
            )}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Main Component ── */
export function SourcesView({ sources, totalCount, activeCount, failingCount, boardOverrides: initialBoardOverrides = {} }: Props) {
  const [query,      setQuery]      = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | SourceType>('all');
  const [viewMode,   setViewMode]   = useState<ViewMode>('type');
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [drawerMode,    setDrawerMode]    = useState<'add' | 'edit'>('add');
  const [drawerDefType, setDrawerDefType] = useState<'push' | 'pull'>('pull');
  const [editTarget,    setEditTarget]    = useState<SourceWithStats | null>(null);
  const [customSrcs,    setCustomSrcs]    = useState<CustomSource[]>([]);
  const [overrides,     setOverrides]     = useState<OverrideMap>({});
  const [boardOverrides, setBoardOverrides] = useState<Record<string, BoardId[]>>(initialBoardOverrides);
  // builtInSources mirrors the server-side enabled state but allows optimistic updates
  const [builtInSources, setBuiltInSources] = useState<SourceWithStats[]>(sources);

  // Load from localStorage on mount
  useEffect(() => {
    setCustomSrcs(loadCustom());
    setOverrides(loadOverrides());
  }, []);

  // Sync built-in sources when server props change
  useEffect(() => {
    setBuiltInSources(sources);
  }, [sources]);

  /* Merge built-in + custom into a unified list */
  const allSources = useMemo((): SourceWithStats[] => {
    const builtIn = builtInSources.map((s) => ({
      ...s,
      ...overrides[s.id],          // apply display overrides if any
      isCustom: false,
    }));
    const custom: SourceWithStats[] = customSrcs.map((c) => ({
      ...c,
      status: (c.enabled ? 'idle' : 'paused') as SourceStatus,
      articleCount: 0,
      latestAt: null,
      isCustom: true,
      category: (c.type === 'push' ? 'social' : 'research') as import('../lib/sources-config').SourceCategory,
      boards: c.boards ?? ['social'],
    }));
    return [...builtIn, ...custom];
  }, [builtInSources, customSrcs, overrides]);

  /* Filtered list */
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return allSources.filter((s) => {
      if (typeFilter !== 'all' && s.type !== typeFilter) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.label.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allSources, query, typeFilter]);

  const pushSources = filtered.filter((s) => s.type === 'push');
  const pullSources = filtered.filter((s) => s.type === 'pull');
  const onlinePush  = pushSources.filter((s) => s.status === 'active').length;
  const normalPull  = pullSources.filter((s) => s.status === 'active' && s.enabled !== false).length;

  const displayTotal   = allSources.length;
  const displayActive  = allSources.filter((s) => s.status === 'active' && s.enabled !== false).length;
  const displayFailing = allSources.filter((s) => s.status === 'failing' || s.status === 'paused').length;

  /* Stats refresh — called by SourceCard after a successful trigger */
  function handleStatsRefresh(sourceId: string, count: number, latest: string | null) {
    setBuiltInSources((prev) =>
      prev.map((s) =>
        s.id === sourceId
          ? { ...s, articleCount: count, latestAt: latest, status: count > 0 ? 'active' : s.status }
          : s
      )
    );
  }

  /* Handlers */
  function openTypeModal() {
    setTypeModalOpen(true);
  }

  function openAdd(type: 'push' | 'pull') {
    setTypeModalOpen(false);
    setDrawerMode('add');
    setDrawerDefType(type);
    setEditTarget(null);
    setDrawerOpen(true);
  }

  function openEdit(src: SourceWithStats) {
    setDrawerMode('edit');
    setEditTarget(src);
    setDrawerOpen(true);
  }

  function handleSave(data: CustomSource) {
    setCustomSrcs((prev) => {
      const exists = prev.findIndex((c) => c.id === data.id);
      const next = exists >= 0
        ? prev.map((c) => c.id === data.id ? data : c)
        : [...prev, data];
      saveCustom(next);
      return next;
    });
    setDrawerOpen(false);
  }

  function handleDelete(id: string) {
    setCustomSrcs((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveCustom(next);
      return next;
    });
    setDrawerOpen(false);
  }

  function handleSaveOverride(id: string, data: BuiltInOverride) {
    setOverrides((prev) => {
      const next = { ...prev, [id]: data };
      saveOverrides(next);
      return next;
    });
  }

  async function handleSaveBoardOverride(id: string, boards: BoardId[] | null) {
    // Optimistic update
    setBoardOverrides((prev) => {
      if (boards === null) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: boards };
    });
    await fetch('/api/update-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, boards }),
    });
  }

  async function handleToggle(id: string, enabled: boolean) {
    // Check if this is a custom source (uses localStorage only)
    const isCustom = customSrcs.some((c) => c.id === id);
    if (isCustom) {
      setCustomSrcs((prev) => {
        const next = prev.map((c) => c.id === id ? { ...c, enabled } : c);
        saveCustom(next);
        return next;
      });
      return;
    }

    // Built-in source: optimistic update + persist to server
    setBuiltInSources((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, enabled, status: enabled ? 'idle' : 'paused' }
          : s
      )
    );

    await fetch('/api/update-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled }),
    });
  }

  return (
    <div className={styles.container}>
      {/* ── Topbar ── */}
      <div className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <h1 className={styles.title}>信源管理</h1>
          <span className={styles.totalBadge}>· {displayTotal} 个</span>
        </div>
        <div className={styles.topbarCenter}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>⌕</span>
            <input
              className={styles.searchInput}
              placeholder="搜索信源..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {/* View mode toggle */}
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${viewMode === 'type' ? styles.tabActive : ''}`}
              onClick={() => setViewMode('type')}
            >
              按类型
            </button>
            <button
              className={`${styles.tab} ${viewMode === 'board' ? styles.tabActive : ''}`}
              onClick={() => setViewMode('board')}
            >
              按菜单
            </button>
          </div>
          {/* Type filter — only shown in type view */}
          {viewMode === 'type' && (
            <div className={styles.tabs}>
              {(['all', 'push', 'pull'] as const).map((t) => (
                <button
                  key={t}
                  className={`${styles.tab} ${typeFilter === t ? styles.tabActive : ''}`}
                  onClick={() => setTypeFilter(t)}
                >
                  {t === 'all' ? '全部' : t === 'push' ? '⚡ 推送' : '↻ 拉取'}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={styles.topbarRight}>
          <button className={styles.addBtn} onClick={openTypeModal}>
            ＋ 添加信源
          </button>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className={styles.statsRow}>
        <div className={`${styles.statCard} ${styles.statCardTotal}`}>
          <span className={styles.statCardNum}>{displayTotal}</span>
          <span className={styles.statCardLbl}>信源总数</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardOnline}`}>
          <span className={styles.statCardNum}>{onlinePush}</span>
          <span className={styles.statCardLbl}>实时在线</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardNormal}`}>
          <span className={styles.statCardNum}>{displayActive}</span>
          <span className={styles.statCardLbl}>正常运行</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardFail}`}>
          <span className={styles.statCardNum}>{displayFailing}</span>
          <span className={styles.statCardLbl}>异常信源</span>
        </div>
      </div>

      {/* ── Sections ── */}
      <div className={styles.scroll}>
        {viewMode === 'type' ? (
          <>
            {(typeFilter === 'all' || typeFilter === 'push') && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionIcon}>⚡</span>
                  <span className={styles.sectionTitle}>实时推送</span>
                  <span className={styles.sectionCount}>{pushSources.length} 个信源</span>
                  {onlinePush > 0 && <span className={styles.onlinePill}>· {onlinePush} 在线</span>}
                </div>
                <div className={styles.grid}>
                  {pushSources.map((s) => <SourceCard key={s.id} src={s} onEdit={openEdit} onStatsRefresh={handleStatsRefresh} />)}
                </div>
              </section>
            )}
            {(typeFilter === 'all' || typeFilter === 'pull') && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionIcon}>↻</span>
                  <span className={styles.sectionTitle}>定时拉取</span>
                  <span className={styles.sectionCount}>{pullSources.length} 个信源</span>
                  {normalPull > 0 && <span className={styles.normalPill}>{normalPull} 个正常运行</span>}
                </div>
                <div className={styles.grid}>
                  {pullSources.map((s) => <SourceCard key={s.id} src={s} onEdit={openEdit} onStatsRefresh={handleStatsRefresh} />)}
                </div>
              </section>
            )}
          </>
        ) : (
          /* ── Board view ── */
          BOARDS.map((board) => {
            const boardSources = filtered.filter((s) =>
              getEffectiveBoards(s.id, s.boards ?? [], boardOverrides).includes(board.id)
            );
            const BOARD_ICON: Record<string, string> = {
              social: '⚡', research: '📡', orgs: '🏛',
            };
            return (
              <section key={board.id} className={styles.section}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionIcon}>{BOARD_ICON[board.id]}</span>
                  <span className={styles.sectionTitle}>{board.label}</span>
                  <span className={styles.sectionCount}>{boardSources.length} 个信源</span>
                  <span className={styles.boardHref}>{board.href}</span>
                </div>
                {boardSources.length > 0 ? (
                  <div className={styles.grid}>
                    {boardSources.map((s) => <SourceCard key={s.id} src={s} onEdit={openEdit} onStatsRefresh={handleStatsRefresh} />)}
                  </div>
                ) : (
                  <div className={styles.boardEmpty}>暂无信源推送到此菜单</div>
                )}
              </section>
            );
          })
        )}

        {filtered.length === 0 && (
          <div className={styles.empty}>没有匹配的信源</div>
        )}
      </div>

      {/* ── Type selection modal ── */}
      <SourceTypeModal
        open={typeModalOpen}
        onClose={() => setTypeModalOpen(false)}
        onSelect={openAdd}
      />

      {/* ── Drawer ── */}
      <SourceDrawer
        open={drawerOpen}
        mode={drawerMode}
        initial={editTarget}
        isBuiltIn={!!(editTarget && !editTarget.isCustom)}
        defaultType={drawerDefType}
        defaultBoards={
          editTarget
            ? (SOURCES.find((s) => s.id === editTarget.id)?.boards ?? ['social'])
            : ['social']
        }
        boardOverride={editTarget ? boardOverrides[editTarget.id] : undefined}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSave}
        onSaveOverride={handleSaveOverride}
        onDelete={handleDelete}
        onToggle={handleToggle}
        onSaveBoardOverride={handleSaveBoardOverride}
      />
    </div>
  );
}

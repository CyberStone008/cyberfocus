'use client';

import styles from './SourceTypeModal.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (type: 'push' | 'pull') => void;
}

export function SourceTypeModal({ open, onClose, onSelect }: Props) {
  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>添加信源</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          <p className={styles.sectionLabel}>选择数据接入方式</p>
          <div className={styles.cards}>
            {/* Push */}
            <button className={`${styles.card} ${styles.cardPush}`} onClick={() => onSelect('push')}>
              <div className={`${styles.iconWrap} ${styles.iconWrapPush}`}>⚡</div>
              <div className={styles.cardTitle}>实时推送</div>
              <p className={styles.cardDesc}>
                平台生成 Webhook 端点，信源主动推送，延迟毫秒级
              </p>
              <div className={styles.tags}>
                <span className={`${styles.tag} ${styles.tagPush}`}>零延迟</span>
                <span className={`${styles.tag} ${styles.tagPush}`}>节省资源</span>
                <span className={`${styles.tag} ${styles.tagPush}`}>无需轮询</span>
              </div>
            </button>

            {/* Pull */}
            <button className={`${styles.card} ${styles.cardPull}`} onClick={() => onSelect('pull')}>
              <div className={`${styles.iconWrap} ${styles.iconWrapPull}`}>↻</div>
              <div className={styles.cardTitle}>定时拉取</div>
              <p className={styles.cardDesc}>
                平台按设定频率抓取，无需信源方任何配置
              </p>
              <div className={styles.tags}>
                <span className={`${styles.tag} ${styles.tagPull}`}>无需对方配合</span>
                <span className={`${styles.tag} ${styles.tagPull}`}>适配任意来源</span>
                <span className={`${styles.tag} ${styles.tagPull}`}>灵活频率</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

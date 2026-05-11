import styles from './page.module.css';

export default function PodcastPage() {
  return (
    <div className={styles.root}>
      <div className={styles.topbar}>
        <span className={styles.title}>🎙️ 顶级播客</span>
        <span className={styles.sub}>· AI 领域精选播客集</span>
      </div>

      <div className={styles.body}>
        <div className={styles.placeholder}>
          <div className={styles.placeholderIcon}>🎙️</div>
          <p className={styles.placeholderText}>播客数据源配置中</p>
          <p className={styles.placeholderSub}>请告诉我你想聚合哪些播客，我来接入数据源。</p>
        </div>
      </div>
    </div>
  );
}

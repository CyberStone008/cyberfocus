import sharp from 'sharp';
const src = 'public/hero.png';
// 清晰主图：WebP，保持尺寸
await sharp(src).webp({ quality: 80 }).toFile('public/hero.webp');
// 模糊铺底用的极小占位图（反正 CSS 还要 blur 48px，64px 宽足够，几 KB）
await sharp(src).resize(64).webp({ quality: 60 }).toFile('public/hero-blur.webp');
const fs = await import('fs');
for (const f of ['public/hero.png','public/hero.webp','public/hero-blur.webp']) {
  console.log('  ', (fs.statSync(f).size/1024).toFixed(0).padStart(5)+' KB', f);
}

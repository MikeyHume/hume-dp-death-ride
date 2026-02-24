// Phaser is loaded via CDN <script> tag in index.html to avoid
// Vite pre-bundling crash on iOS Safari (iPhone Xs, A12 chip).
// This shim re-exports the global Phaser so `import Phaser from 'phaser'`
// continues to work throughout the codebase.
const Phaser = (window as any).Phaser as typeof import('phaser');
export default Phaser;

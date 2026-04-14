// @ts-check
const esbuild = require('esbuild')
const path = require('path')

const watch = process.argv.includes('--watch')

/** @type {esbuild.BuildOptions} */
const baseOptions = {
  bundle: true,
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  platform: 'node',
  target: 'node20',
}

// Extension host bundle
const extensionBuild = esbuild.build({
  ...baseOptions,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
})

// Webview bundle
const webviewBuild = esbuild.build({
  ...baseOptions,
  entryPoints: ['webview/main.ts'],
  outfile: 'dist/webview/bundle.js',
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  external: [],
})

Promise.all([extensionBuild, webviewBuild])
  .then(() => {
    console.log('Build complete.')
    if (watch) {
      console.log('Watching for changes...')
      // Re-build on changes via esbuild watch mode
      esbuild.context({
        ...baseOptions,
        entryPoints: ['src/extension.ts'],
        outfile: 'dist/extension.js',
        external: ['vscode'],
        format: 'cjs',
      }).then(ctx => ctx.watch())

      esbuild.context({
        ...baseOptions,
        entryPoints: ['webview/main.ts'],
        outfile: 'dist/webview/bundle.js',
        platform: 'browser',
        target: 'es2020',
        format: 'iife',
      }).then(ctx => ctx.watch())
    }
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })

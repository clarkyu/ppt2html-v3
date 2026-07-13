/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// mammoth ships types only for its Node entry; the browser build is untyped.
declare module 'mammoth/mammoth.browser.min.js' {
  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>
  }
  export default mammoth
}

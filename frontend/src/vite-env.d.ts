/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_PATH: string
  readonly VITE_IS_PREVIEW: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
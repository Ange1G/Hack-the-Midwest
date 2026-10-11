/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_API_URL?: string;
	readonly VITE_USE_MOCKS?: string;
	readonly VITE_DEV_USER_SSO?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

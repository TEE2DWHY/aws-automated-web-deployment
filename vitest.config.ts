import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		// Separate processes let the upload tests use an isolated working directory.
		pool: 'forks',
	},
});

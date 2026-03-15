import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: [
    '**/tests/unit/**/*.test.ts',
    '**/tests/unit/**/*.test.tsx',
    '**/tests/integration/**/*.test.ts',
  ],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json',
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'electron/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.tsx',
    '!src/vite-env.d.ts',
    // React UI components are covered by E2E tests (Playwright), not unit tests
    '!src/app/App.tsx',
    '!src/app/useQaNola.ts',
    '!src/components/**',
    // Platform/API boundary files — covered by integration/E2E tests only
    '!src/services/transcription/NodeWhisperBackend.ts',
    '!src/services/merge/DefaultClaudeClient.ts',
    '!src/services/audio/NativeAudioLoop.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 90,
      branches: 85,
      functions: 90,
      statements: 90,
    },
  },
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageDirectory: 'coverage',
};

export default config;

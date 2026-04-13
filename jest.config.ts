import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__', '<rootDir>/packages'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.test.ts', '**/*.spec.test.tsx'],
  moduleNameMapper: {
    '^@selftax/core/(.*)$': '<rootDir>/packages/tax-core/src/$1',
    '^@selftax/core$': '<rootDir>/packages/tax-core/src',
    '^@selftax/web/(.*)$': '<rootDir>/packages/web/src/$1',
    '^@selftax/web$': '<rootDir>/packages/web/src',
    '^@selftax/mcp/(.*)$': '<rootDir>/packages/mcp/src/$1',
    '^@selftax/mcp$': '<rootDir>/packages/mcp/src',
    '^@selftax/extension/(.*)$': '<rootDir>/packages/extension/src/$1',
    '^@selftax/extension$': '<rootDir>/packages/extension/src',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  setupFiles: ['<rootDir>/jest.setup-jsdom.ts'],
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    '!packages/*/src/**/*.d.ts',
  ],
};

export default config;

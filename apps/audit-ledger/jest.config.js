module.exports = {
  displayName: 'audit-ledger',
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['reflect-metadata'],
  testMatch: [
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/test/**/*.spec.ts',
    '<rootDir>/test/**/*.e2e-spec.ts',
  ],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/../../tsconfig.base.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/audit-ledger',
  moduleNameMapper: {
    '^@aegis/contracts$': '<rootDir>/../../libs/contracts/src/index.ts',
    '^@aegis/crypto-core$': '<rootDir>/../../libs/crypto-core/src/index.ts',
    '^@aegis/database$': '<rootDir>/../../libs/database/src/index.ts',
    '^@aegis/event-bus$': '<rootDir>/../../libs/event-bus/src/index.ts',
  },
  testTimeout: 30000,
};

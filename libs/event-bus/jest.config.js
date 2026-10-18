module.exports = {
  displayName: 'event-bus',
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/../../tsconfig.base.json' }],
  },
  moduleNameMapper: {
    '^@aegis/contracts$': '<rootDir>/../../libs/contracts/src/index.ts',
    '^@aegis/event-bus$': '<rootDir>/src/index.ts',
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/libs/event-bus',
};

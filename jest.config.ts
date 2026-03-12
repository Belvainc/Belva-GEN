import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/__tests__"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
      },
    ],
  },
  // Use jsdom for component tests
  projects: [
    {
      displayName: "server",
      testEnvironment: "node",
      testMatch: [
        "<rootDir>/__tests__/**/*.test.ts",
        "<rootDir>/src/server/**/*.test.ts",
        "<rootDir>/src/lib/**/*.test.ts",
      ],
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
      },
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          { tsconfig: "tsconfig.json" },
        ],
      },
    },
    {
      displayName: "components",
      testEnvironment: "jsdom",
      testMatch: ["<rootDir>/src/components/**/*.test.tsx"],
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
      },
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          { tsconfig: "tsconfig.json" },
        ],
      },
      setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
    },
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "json-summary"],
  coverageThreshold: {
    global: {
      lines: 70,
    },
    "src/server/**": {
      lines: 80,
    },
    "src/app/**": {
      lines: 70,
    },
  },
  // Performance budget: fail if suite takes >3s
  testTimeout: 3000,
};

export default config;

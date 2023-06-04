export default {
  preset: "ts-jest/presets/default-esm",
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    "^.+\\.(js|jsx)$": "babel-jest",
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        useESM: true,
      }
    ]
  },
  transformIgnorePatterns: ["^/node_modules/normalize-url"],
};

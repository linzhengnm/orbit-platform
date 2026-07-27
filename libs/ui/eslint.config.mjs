import nx from "@nx/eslint-plugin";
// Import the root ESLint configuration. The ui library is two levels deep
// under the workspace root, so we need to go up two directories.
import baseConfig from "../../eslint.config.mjs";

export default [
    ...nx.configs["flat/react"],
    ...baseConfig,
    {
        files: [
            "**/*.ts",
            "**/*.tsx",
            "**/*.js",
            "**/*.jsx"
        ],
        // Override or add rules here
        rules: {}
    },
    {
        ignores: [
            "**/out-tsc"
        ]
    }
];

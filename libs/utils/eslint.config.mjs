// Import the root ESLint configuration. The utils library is two levels deep
// under the workspace root, so we need to go up two directories.
import baseConfig from "../../eslint.config.mjs";

export default [
    ...baseConfig,
    {
        files: [
            "**/*.json"
        ],
        rules: {
            "@nx/dependency-checks": [
                "error",
                {
                    "ignoredFiles": [
                        "{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}",
                        "{projectRoot}/vite.config.{js,ts,mjs,mts}"
                    ]
                }
            ]
        },
        languageOptions: {
            parser: await import("jsonc-eslint-parser")
        }
    },
    {
        ignores: [
            "**/out-tsc"
        ]
    }
];

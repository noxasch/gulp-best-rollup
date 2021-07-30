/* eslint-disable */
module.exports = {
  env: {
    es2021: true,
    mocha: true,
  },
  parser: '@babel/eslint-parser',
  plugins: [
    "@babel"
  ],
  extends: [
    'eslint:recommended', 
    'eslint-config-airbnb-base'
  ],
  parserOptions: {
    ecmaVersion: 12,
    requireConfigFile: false,
  },
  ignorePatterns: ['dist/**/*.js'],
  rules: {
    indent: [
      'error',
      2
    ],
    'linebreak-style': [
      'error',
      'unix'
    ],
    quotes: [
      'error',
      'single'
    ],
    semi: [
      'error',
      'always'
    ],
    'no-unused-vars': [
      'error', 
      { vars: 'all', args: 'none', ignoreRestSiblings: false }
    ],
    'no-trailing-spaces': [
      'error', 
      { ignoreComments: true },
    ],
    'max-len': [
      'error', 
      { ignoreComments: true }
    ],
    'object-shorthand': ["error", "never"],
    'prefer-arrow-callback': 'off',
    'no-underscore-dangle': 'off',
    'import/no-extraneous-dependencies': [
      'error', 
      { 'devDependencies': ["gulpfile.js/**/*.js", "tests/**/*.js"] }]
  }
};

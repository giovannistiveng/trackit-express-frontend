// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const sonarjs = require('eslint-plugin-sonarjs');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
      sonarjs.configs.recommended,
    ],
    processor: angular.processInlineTemplates,
    // Con información de tipos, las reglas de Sonar distinguen promesas (p. ej. "void promesa")
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: __dirname } },
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'ti', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'ti', style: 'kebab-case' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'error',
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      // Los guards de Angular devuelven true o una redirección (UrlTree) por diseño del framework
      'sonarjs/function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Igual que SonarQube S6544 (hooks async) y S7773 (Number.parseInt…)
      '@typescript-eslint/no-misused-promises': 'error',
      'no-restricted-globals': ['error', 'parseInt', 'parseFloat', 'isNaN', 'isFinite'],
    },
  },
  {
    // En pruebas se usan contraseñas, IPs y URLs de ejemplo a propósito
    files: ['**/*.spec.ts', 'src/testing/**/*.ts'],
    rules: {
      'sonarjs/no-hardcoded-passwords': 'off',
      'sonarjs/no-hardcoded-ip': 'off',
      'sonarjs/no-clear-text-protocols': 'off',
      'sonarjs/no-nested-functions': 'off',
      'sonarjs/pseudo-random': 'off',
      'sonarjs/no-duplicate-string': 'off',
      // Los callbacks async de las pruebas (p. ej. setTimeout) no necesitan esperar su promesa
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },
  {
    files: ['src/app/core/logging/logger.service.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);

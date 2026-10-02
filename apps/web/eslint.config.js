import { defineConfig } from 'eslint/config';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import tseslint from 'typescript-eslint';
import rootConfig from '../../eslint.config.js';

export default defineConfig(
  ...rootConfig,

  {
    // Vue文件配置
    files: ['**/*.vue'],
    extends: [...vue.configs['flat/recommended']],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        projectService: {
          allowDefaultProject: ['eslint.config.js', 'apps/*/eslint.config.js'],
        },
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
);

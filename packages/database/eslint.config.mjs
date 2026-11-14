import baseConfig from '../../eslint.config.mjs';

export default [
  {
    ignores: ['dist/**', 'src/generated/**'],
  },
  ...baseConfig,
];

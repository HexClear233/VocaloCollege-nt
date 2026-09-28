/* ==========================================================================
   theme.js — Light / Dark / System 三态主题
   方案第 949-1003 行
   - 三态：light / dark / system
   - LocalStorage 保存
   - System 模式下监听系统变化实时跟随
   - 首屏防闪（FOUC）由 <head> 内联脚本负责，本文件只处理交互
   ========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'vc-theme';
  var MODES = ['light', 'dark', 'system'];
  var LABELS = { light: '浅色', dark: '深色', system: '跟随系统' };
  var ICONS = { light: '☀', dark: '☾', system: '⛭' };

  var mql = window.matchMedia('(prefers-color-scheme: dark)');

  function readMode() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return MODES.indexOf(v) >= 0 ? v : 'system';
    } catch (e) {
      return 'system';
    }
  }

  function resolve(mode) {
    return mode === 'system' ? (mql.matches ? 'dark' : 'light') : mode;
  }

  function apply(mode) {
    var theme = resolve(mode);
    var root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-theme-mode', mode);

    // 同步浏览器 UI 色（手机地址栏）
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#0B0C10' : '#F5F5F2');
    }

    // 更新切换器状态
    document.querySelectorAll('[data-theme-set]').forEach(function (btn) {
      var on = btn.getAttribute('data-theme-set') === mode;
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      btn.classList.toggle('is-active', on);
    });

    var trigger = document.querySelector('[data-theme-trigger]');
    if (trigger) {
      trigger.textContent = ICONS[mode] || ICONS.system;
      trigger.setAttribute('aria-label', '主题：' + (LABELS[mode] || '跟随系统'));
      trigger.setAttribute('title', '主题：' + (LABELS[mode] || '跟随系统'));
    }
  }

  function setMode(mode) {
    if (MODES.indexOf(mode) < 0) mode = 'system';
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) {}
    apply(mode);
  }

  // --- 系统主题变化时，仅在 system 模式下跟随 ---
  function onSystemChange() {
    if (readMode() === 'system') apply('system');
  }
  if (mql.addEventListener) mql.addEventListener('change', onSystemChange);
  else if (mql.addListener) mql.addListener(onSystemChange);

  // --- 初始化 ---
  apply(readMode());

  // --- 绑定切换器 ---
  document.addEventListener('DOMContentLoaded', function () {
    var menu = document.querySelector('[data-theme-menu]');
    var trigger = document.querySelector('[data-theme-trigger]');

    if (trigger && menu) {
      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = menu.hasAttribute('hidden');
        if (open) menu.removeAttribute('hidden');
        else menu.setAttribute('hidden', '');
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      });

      // 点击外部关闭
      document.addEventListener('click', function () {
        if (!menu.hasAttribute('hidden')) {
          menu.setAttribute('hidden', '');
          trigger.setAttribute('aria-expanded', 'false');
        }
      });

      // Esc 关闭
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !menu.hasAttribute('hidden')) {
          menu.setAttribute('hidden', '');
          trigger.setAttribute('aria-expanded', 'false');
          trigger.focus();
        }
      });
    }

    document.querySelectorAll('[data-theme-set]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setMode(btn.getAttribute('data-theme-set'));
        if (menu) menu.setAttribute('hidden', '');
        if (trigger) {
          trigger.setAttribute('aria-expanded', 'false');
          trigger.focus();
        }
      });
    });

    // 页面内任意 [data-theme-cycle] 可快速循环三态
    document.querySelectorAll('[data-theme-cycle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = MODES.indexOf(readMode());
        setMode(MODES[(i + 1) % MODES.length]);
      });
    });

    apply(readMode());
  });

  // 暴露给其他脚本
  window.VCTheme = { get: readMode, set: setMode, resolve: resolve };
})();

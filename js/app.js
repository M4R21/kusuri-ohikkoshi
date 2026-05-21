/* ============================================
   app.js — メインアプリケーション（GitHub Pages対応版）
   ============================================ */

const App = (() => {

    // ===== パスワード認証 =====
    const APP_PASSWORD = '111';

    function checkAuth() {
        return sessionStorage.getItem('ohikkoshi_auth') === 'ok';
    }

    function showPasswordScreen() {
        const pwScreen = document.getElementById('password-screen');
        const loadingScreen = document.getElementById('loading-screen');

        // ローディング画面を即座に非表示
        loadingScreen.style.display = 'none';
        // パスワード画面を表示
        pwScreen.classList.remove('hidden');

        const input = document.getElementById('password-input');
        const submitBtn = document.getElementById('password-submit');
        const errorEl = document.getElementById('password-error');

        const doLogin = () => {
            if (input.value === APP_PASSWORD) {
                sessionStorage.setItem('ohikkoshi_auth', 'ok');
                pwScreen.classList.add('fade-out');
                setTimeout(() => {
                    pwScreen.style.display = 'none';
                    startApp();
                }, 500);
            } else {
                errorEl.classList.remove('hidden');
                input.value = '';
                input.focus();
                // 振動アニメーション
                const form = document.querySelector('.password-form');
                form.classList.add('shake');
                setTimeout(() => form.classList.remove('shake'), 500);
            }
        };

        submitBtn.addEventListener('click', doLogin);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doLogin();
        });

        // 自動フォーカス
        setTimeout(() => input.focus(), 100);
    }

    // ===== アプリ起動 =====
    async function startApp() {
        const loadingScreen = document.getElementById('loading-screen');
        loadingScreen.style.display = 'flex';
        loadingScreen.classList.remove('fade-out');

        try {
            // DB初期化
            await DB.open();

            // GitHubから最新の共有データを自動取得（バックグラウンド）
            if (typeof SharedData !== 'undefined') {
                await SharedData.importFromGitHub(true);
            }

            // jsPDFライブラリの読み込み確認
            if (!window.jspdf && !window.jsPDF) {
                console.warn('jsPDFが読み込まれていません。PDF出力機能は使用できません。');
                showToast('⚠️ PDFライブラリの読み込みに失敗しました。ページを再読み込みしてください。', 'warning');
            } else {
                console.log('jsPDF loaded:', window.jspdf ? 'window.jspdf' : 'window.jsPDF');
                // 日本語フォントをバックグラウンドでプリロード
                PDF.preloadFont();
            }

            // 各モジュール初期化
            await Admin.init();
            await Store.init();
            await HQ.init();
            if (typeof Bulk !== 'undefined') await Bulk.init();
            if (typeof Hikitori !== 'undefined') await Hikitori.init();
            if (typeof DrugSearch !== 'undefined') await DrugSearch.init();
            if (typeof SharedData !== 'undefined') await SharedData.init();

            // ロール選択イベント
            document.querySelectorAll('.role-card').forEach(card => {
                card.addEventListener('click', () => {
                    const role = card.dataset.role;
                    navigateTo(role);
                });
            });

            // 戻るボタン
            document.getElementById('admin-back').addEventListener('click', () => navigateTo('home'));
            document.getElementById('store-back').addEventListener('click', () => Store.goBack());
            document.getElementById('hq-back').addEventListener('click', () => navigateTo('home'));
            document.getElementById('search-back').addEventListener('click', () => navigateTo('home'));

            // データステータス更新
            await updateDataStatusFromDB();

            // ローディング画面を非表示
            setTimeout(() => {
                loadingScreen.classList.add('fade-out');
                setTimeout(() => {
                    loadingScreen.style.display = 'none';
                    document.getElementById('app').classList.remove('hidden');
                }, 500);
            }, 800);

        } catch (err) {
            console.error('初期化エラー:', err);
            showToast('初期化に失敗しました: ' + err.message, 'error');
        }
    }

    // ===== 初期化（エントリーポイント） =====
    async function init() {
        if (checkAuth()) {
            // すでに認証済み → アプリを直接起動
            const pwScreen = document.getElementById('password-screen');
            if (pwScreen) pwScreen.style.display = 'none';
            await startApp();
        } else {
            // 未認証 → パスワード画面を表示
            showPasswordScreen();
        }
    }

    // ===== ナビゲーション =====
    function navigateTo(role) {
        // 全セクションを非表示
        document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));

        switch (role) {
            case 'admin':
                document.getElementById('admin-section').classList.remove('hidden');
                if (typeof Bulk !== 'undefined') Bulk.onShow();
                break;
            case 'store':
                document.getElementById('store-section').classList.remove('hidden');
                Store.onShow();
                break;
            case 'hq':
                document.getElementById('hq-section').classList.remove('hidden');
                HQ.onShow();
                break;
            case 'hikitori':
                document.getElementById('hikitori-section').classList.remove('hidden');
                if (typeof Hikitori !== 'undefined') Hikitori.onShow();
                break;
            case 'search':
                document.getElementById('search-section').classList.remove('hidden');
                if (typeof DrugSearch !== 'undefined') DrugSearch.onShow();
                break;
            default:
                document.getElementById('role-select').classList.remove('hidden');
                updateDataStatusFromDB();
                break;
        }

        // スクロールをトップに
        window.scrollTo(0, 0);
    }

    // ===== トースト通知 =====
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };
        toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ===== 確認ダイアログ =====
    function showConfirm(title, message, onConfirm) {
        const modal = document.getElementById('confirm-modal');
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        modal.classList.remove('hidden');

        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');
        const overlay = modal.querySelector('.modal-overlay');

        const close = () => {
            modal.classList.add('hidden');
            okBtn.replaceWith(okBtn.cloneNode(true));
            cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        };

        document.getElementById('confirm-ok').addEventListener('click', () => {
            close();
            onConfirm();
        });

        document.getElementById('confirm-cancel').addEventListener('click', close);
        overlay.addEventListener('click', close);
    }

    // ===== データステータス表示 =====
    function updateDataStatus(invCount, storeCount, lastUpdate) {
        const el = document.getElementById('data-status');
        if (invCount > 0) {
            const dateStr = lastUpdate ? new Date(lastUpdate).toLocaleDateString('ja-JP') : '不明';
            el.innerHTML = `📊 登録済み: <strong>${invCount.toLocaleString()}</strong> 件の在庫レコード / <strong>${storeCount}</strong> 店舗 (最終更新: ${dateStr})`;
        } else {
            el.innerHTML = '⚠️ 在庫データが登録されていません。管理者メニューからデータを登録してください。';
        }
    }

    async function updateDataStatusFromDB() {
        const invCount = await DB.count('inventory');
        const storeCount = (await DB.getStores()).length;
        const lastUpdate = await DB.getSetting('lastInventoryUpdate');
        updateDataStatus(invCount, storeCount, lastUpdate);
    }

    // ===== DOMContentLoaded =====
    document.addEventListener('DOMContentLoaded', init);

    return {
        showToast,
        showConfirm,
        updateDataStatus,
        navigateTo
    };
})();

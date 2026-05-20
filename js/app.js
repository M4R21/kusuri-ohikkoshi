/* ============================================
   app.js — メインアプリケーション
   ============================================ */

const App = (() => {

    // ===== 初期化 =====
    async function init() {
        try {
            // DB初期化
            await DB.open();

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

            // データステータス更新
            await updateDataStatusFromDB();

            // ローディング画面を非表示
            setTimeout(() => {
                const loadingScreen = document.getElementById('loading-screen');
                loadingScreen.classList.add('fade-out');
                setTimeout(() => {
                    loadingScreen.style.display = 'none';
                    document.getElementById('app').classList.remove('hidden');
                }, 500);
            }, 1200);

        } catch (err) {
            console.error('初期化エラー:', err);
            showToast('初期化に失敗しました: ' + err.message, 'error');
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

/* ============================================
   shared-data.js — 共有データ管理モジュール
   GitHub上のJSONデータの取得・エクスポート・自動同期
   ============================================ */

const SharedData = (() => {

    // ===== デフォルト設定 =====
    // ※ここにリポジトリURLを設定しておくと、全PCで自動同期が有効になります
    const DEFAULT_GITHUB_REPO_URL = 'https://github.com/M4R21/kusuri-ohikkoshi';

    // GitHubリポジトリURLからraw content URLを生成
    function getRawUrl(repoUrl) {
        // https://github.com/user/repo → https://raw.githubusercontent.com/user/repo/main/data/shared-data.json
        const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (!match) return null;
        const [, user, repo] = match;
        return `https://raw.githubusercontent.com/${user}/${repo}/main/data/shared-data.json`;
    }

    // ===== リポジトリURLの取得（DB保存値 → デフォルト値の順で使用） =====
    async function getRepoUrl() {
        const savedUrl = await DB.getSetting('githubRepoUrl');
        return savedUrl || DEFAULT_GITHUB_REPO_URL;
    }

    // ===== エクスポート: IndexedDB → JSON ファイル =====
    async function exportSharedData() {
        const statusEl = document.getElementById('status-export-shared');
        try {
            statusEl.textContent = 'エクスポート中...';
            statusEl.className = 'file-status';

            // 全データをIndexedDBから取得
            const stores = await DB.getAll('stores');
            const inventory = await DB.getAll('inventory');
            const excludedDrugs = await DB.getAll('excludedDrugs');
            const bulkInventory = await DB.getAll('bulkInventory');
            const bulkExcluded = await DB.getAll('bulkExcluded');

            // 設定情報を取得
            const lastInventoryUpdate = await DB.getSetting('lastInventoryUpdate');
            const inventoryItemCount = await DB.getSetting('inventoryItemCount');

            const sharedData = {
                version: new Date().toISOString(),
                exportedAt: new Date().toLocaleString('ja-JP'),
                summary: {
                    inventoryCount: inventory.length,
                    storeCount: stores.length,
                    excludedDrugCount: excludedDrugs.length,
                    bulkInventoryCount: bulkInventory.length,
                    bulkExcludedCount: bulkExcluded.length,
                    lastInventoryUpdate,
                    inventoryItemCount
                },
                data: {
                    stores,
                    inventory,
                    excludedDrugs,
                    bulkInventory,
                    bulkExcluded
                }
            };

            // JSONファイルをダウンロード
            const jsonStr = JSON.stringify(sharedData);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'shared-data.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            const sizeMB = (jsonStr.length / 1024 / 1024).toFixed(1);
            statusEl.textContent = `✓ エクスポート完了（${sizeMB}MB）— このファイルをGitHubリポジトリの data/ フォルダにアップロードしてください`;
            statusEl.className = 'file-status success';

            App.showToast('共有データをエクスポートしました。GitHubにアップロードしてください。', 'success');

        } catch (err) {
            statusEl.textContent = `✗ エクスポートエラー: ${err.message}`;
            statusEl.className = 'file-status error';
            App.showToast(`エクスポートエラー: ${err.message}`, 'error');
        }
    }

    // ===== インポート: GitHub上のJSON → IndexedDB =====
    async function importFromGitHub(showToasts = true) {
        const repoUrl = await getRepoUrl();
        if (!repoUrl) {
            if (showToasts) {
                console.log('GitHubリポジトリURLが設定されていません。ローカルデータを使用します。');
            }
            return false;
        }

        const rawUrl = getRawUrl(repoUrl);
        if (!rawUrl) {
            if (showToasts) {
                App.showToast('GitHubリポジトリURLの形式が正しくありません', 'warning');
            }
            return false;
        }

        try {
            // キャッシュ回避のためタイムスタンプを付加
            const fetchUrl = `${rawUrl}?t=${Date.now()}`;
            const response = await fetch(fetchUrl);

            if (!response.ok) {
                if (response.status === 404) {
                    console.log('GitHub上に共有データが見つかりません。ローカルデータを使用します。');
                    return false;
                }
                throw new Error(`HTTP ${response.status}`);
            }

            const sharedData = await response.json();

            // バージョン比較（前回取得時のバージョンと同じならスキップ）
            const lastVersion = await DB.getSetting('sharedDataVersion');
            if (lastVersion === sharedData.version) {
                console.log('共有データは最新です。再読み込みをスキップします。');
                if (showToasts) {
                    App.showToast('📊 共有データは最新です', 'info');
                }
                return true; // データは既にある
            }

            // 新しいデータがある場合、IndexedDBに取り込む
            if (showToasts) {
                App.showToast('📥 最新の共有データを取り込んでいます...', 'info');
            }

            const d = sharedData.data;

            // 店舗データ
            if (d.stores && d.stores.length > 0) {
                await DB.clear('stores');
                await DB.putBatch('stores', d.stores);
            }

            // 在庫データ
            if (d.inventory && d.inventory.length > 0) {
                await DB.clear('inventory');
                await DB.putBatch('inventory', d.inventory, (done, total) => {
                    // 進捗表示（大量データの場合）
                    if (done % 5000 === 0 || done === total) {
                        console.log(`共有データ取り込み中: ${done.toLocaleString()} / ${total.toLocaleString()}`);
                    }
                });
            }

            // 除外薬品
            if (d.excludedDrugs) {
                await DB.clear('excludedDrugs');
                for (const item of d.excludedDrugs) {
                    await DB.put('excludedDrugs', item);
                }
            }

            // バラ錠データ
            if (d.bulkInventory && d.bulkInventory.length > 0) {
                await DB.clear('bulkInventory');
                await DB.putBatch('bulkInventory', d.bulkInventory);
            }

            // バラ錠除外データ
            if (d.bulkExcluded) {
                await DB.clear('bulkExcluded');
                for (const item of d.bulkExcluded) {
                    await DB.put('bulkExcluded', item);
                }
            }

            // 設定を復元
            if (sharedData.summary) {
                if (sharedData.summary.lastInventoryUpdate) {
                    await DB.setSetting('lastInventoryUpdate', sharedData.summary.lastInventoryUpdate);
                }
                if (sharedData.summary.inventoryItemCount) {
                    await DB.setSetting('inventoryItemCount', sharedData.summary.inventoryItemCount);
                }
            }

            // バージョンを記録
            await DB.setSetting('sharedDataVersion', sharedData.version);

            if (showToasts) {
                const count = sharedData.summary?.inventoryCount || 0;
                App.showToast(`✓ 共有データを取り込みました（${count.toLocaleString()}件）`, 'success');
            }

            return true;

        } catch (err) {
            console.error('共有データ取得エラー:', err);
            if (showToasts) {
                // ネットワークエラーの場合は既存データで続行
                App.showToast('共有データの取得に失敗しました。ローカルデータを使用します。', 'warning');
            }
            return false;
        }
    }

    // ===== GitHubリポジトリURL保存 =====
    async function saveGitHubUrl() {
        const input = document.getElementById('github-repo-url');
        const statusEl = document.getElementById('status-github-url');
        const url = input.value.trim();

        if (!url) {
            statusEl.textContent = '✗ URLを入力してください';
            statusEl.className = 'file-status error';
            return;
        }

        if (!url.match(/github\.com\/[^/]+\/[^/]+/)) {
            statusEl.textContent = '✗ GitHubリポジトリURLの形式が正しくありません（例: https://github.com/user/repo）';
            statusEl.className = 'file-status error';
            return;
        }

        await DB.setSetting('githubRepoUrl', url);
        statusEl.textContent = `✓ 保存しました: ${url}`;
        statusEl.className = 'file-status success';
        App.showToast('GitHubリポジトリURLを保存しました', 'success');
    }

    // ===== GitHub上のデータ状態を確認 =====
    async function checkSharedStatus() {
        const statusEl = document.getElementById('status-shared-check');
        const repoUrl = await getRepoUrl();

        if (!repoUrl) {
            statusEl.textContent = '✗ GitHubリポジトリURLが設定されていません。「GitHubリポジトリ設定」でURLを保存してください。';
            statusEl.className = 'file-status error';
            return;
        }

        const rawUrl = getRawUrl(repoUrl);
        statusEl.textContent = '確認中...';
        statusEl.className = 'file-status';

        try {
            const response = await fetch(`${rawUrl}?t=${Date.now()}`);

            if (!response.ok) {
                if (response.status === 404) {
                    statusEl.textContent = '⚠️ GitHub上にデータが見つかりません。共有データをエクスポートし、GitHubの data/ フォルダにアップロードしてください。';
                    statusEl.className = 'file-status error';
                } else {
                    statusEl.textContent = `✗ 取得エラー (HTTP ${response.status})`;
                    statusEl.className = 'file-status error';
                }
                return;
            }

            const sharedData = await response.json();
            const localVersion = await DB.getSetting('sharedDataVersion');
            const isUpToDate = localVersion === sharedData.version;
            const summary = sharedData.summary || {};

            statusEl.innerHTML = `✓ GitHub上にデータがあります<br>`
                + `　📅 エクスポート日時: ${sharedData.exportedAt || '不明'}<br>`
                + `　📊 在庫レコード数: ${(summary.inventoryCount || 0).toLocaleString()}件<br>`
                + `　🏪 店舗数: ${summary.storeCount || 0}<br>`
                + `　📦 バラ錠データ: ${(summary.bulkInventoryCount || 0).toLocaleString()}件<br>`
                + `　${isUpToDate ? '✅ ローカルデータは最新です' : '⚠️ ローカルデータが古いため、次回起動時に自動更新されます'}`;
            statusEl.className = 'file-status success';

        } catch (err) {
            statusEl.textContent = `✗ 確認エラー: ${err.message}`;
            statusEl.className = 'file-status error';
        }
    }

    // ===== 初期化 =====
    async function init() {
        // GitHubリポジトリURL表示（保存値がなければデフォルト値を表示）
        const repoUrl = await getRepoUrl();
        const input = document.getElementById('github-repo-url');
        if (input && repoUrl) {
            input.value = repoUrl;
        }

        // ボタンイベント
        const btnExport = document.getElementById('btn-export-shared');
        if (btnExport) btnExport.addEventListener('click', exportSharedData);

        const btnSaveUrl = document.getElementById('btn-save-github-url');
        if (btnSaveUrl) btnSaveUrl.addEventListener('click', saveGitHubUrl);

        const btnCheckStatus = document.getElementById('btn-check-shared-status');
        if (btnCheckStatus) btnCheckStatus.addEventListener('click', checkSharedStatus);
    }

    return { init, importFromGitHub, exportSharedData };
})();

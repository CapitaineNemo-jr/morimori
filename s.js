// ==========================================
// ★重要: ここにあなたのFirebaseの設定を貼り付けます
// (手順は下の「データベースの準備」を参照)
// ==========================================
const firebaseConfig = {
    apiKey: "ここに書き換える",
    authDomain: "ここに書き換える",
    databaseURL: "ここに書き換える",
    projectId: "ここに書き換える",
    storageBucket: "ここに書き換える",
    messagingSenderId: "ここに書き換える",
    appId: "ここに書き換える"
};

// Firebaseの初期化
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// アプリケーション内の状態変数
let groupName = "";
let currentUserId = "";

// グラフのインスタンス
let budgetChartIdx = null;
let activityChartIdx = null;
let voteChartIdx = null;

// ログインしてグループ（部屋）に接続する
function login() {
    groupName = document.getElementById('groupNameInput').value.trim();
    currentUserId = document.getElementById('userIdInput').value.trim();

    if (!groupName || !currentUserId) {
        alert("グループ名とユーザーIDを入力してください。");
        return;
    }

    // 画面をメインコンテンツに切り替え
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('displayGroupName').innerText = groupName;
    document.getElementById('displayUserId').innerText = currentUserId;

    // ★神機能: データベースの更新を24時間体制で監視（リッスン）する
    // 誰かのスマホがデータを書き換えた瞬間、この中身が全員のスマホで同時に実行されます
    database.ref('groups/' + groupName).on('value', function(snapshot) {
        const groupData = snapshot.val() || {};
        
        const surveyData = groupData.surveys || {};
        const voteData = groupData.votes || {};

        updateMemberList(surveyData);
        updateCharts(surveyData);
        updateProposals(surveyData);
        updateVoteChart(voteData);
    });
}

// 参加メンバーの一覧表示を更新
function updateMemberList(surveyData) {
    const listEl = document.getElementById('memberList');
    listEl.innerHTML = '';
    
    Object.keys(surveyData).forEach(userId => {
        const li = document.createElement('li');
        li.innerText = `👤 ${userId} (回答済)`;
        listEl.appendChild(li);
    });
}

// 自分の希望を送信（データベースに書き込み）
document.getElementById('surveyForm').addEventListener('submit', function(e) {
    e.preventDefault();

    const budget = parseInt(document.getElementById('userBudget').value);
    const activity = document.getElementById('userActivity').value;

    // 自分のIDの場所にデータを保存
    database.ref('groups/' + groupName + '/surveys/' + currentUserId).set({
        budget: budget,
        activity: activity
    });

    alert("あなたの希望を送信しました！全員の画面にリアルタイム反映されます。");
});

// グラフの描画
function updateCharts(surveyData) {
    const idArray = Object.keys(surveyData);
    const dataArray = Object.values(surveyData);
    if (dataArray.length === 0) return;

    // 1. 予算グラフ
    const budgets = dataArray.map(d => d.budget);
    if (budgetChartIdx) budgetChartIdx.destroy();
    const ctxB = document.getElementById('budgetChart').getContext('2d');
    budgetChartIdx = new Chart(ctxB, {
        type: 'bar',
        data: {
            labels: idArray,
            datasets: [{ label: '予算 (円)', data: budgets, backgroundColor: '#3498db' }]
        },
        options: { responsive: true }
    });

    // 2. やりたいことグラフ
    const activityCounts = {};
    dataArray.forEach(d => {
        activityCounts[d.activity] = (activityCounts[d.activity] || 0) + 1;
    });

    if (activityChartIdx) activityChartIdx.destroy();
    const ctxA = document.getElementById('activityChart').getContext('2d');
    activityChartIdx = new Chart(ctxA, {
        type: 'doughnut',
        data: {
            labels: Object.keys(activityCounts),
            datasets: [{ data: Object.values(activityCounts), backgroundColor: ['#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6'] }]
        },
        options: { responsive: true }
    });
}

// プラン提案（リアルタイム平均値ベース）
function updateProposals(surveyData) {
    const dataArray = Object.values(surveyData);
    if (dataArray.length === 0) return;

    const avgBudget = dataArray.reduce((sum, d) => sum + d.budget, 0) / dataArray.length;

    if (avgBudget < 20000) {
        document.getElementById('planADesc').innerText = `予算重視！近場で楽しむローカル日帰り観光ツアー（想定費用: 約${Math.round(avgBudget)}円）`;
        document.getElementById('planBDesc').innerText = `お家やレンタルスペースを借り切ってまったりパーティー（想定費用: 約${Math.round(avgBudget * 0.8)}円）`;
    } else {
        document.getElementById('planADesc').innerText = `ちょっと贅沢！話題のスポットを巡る1泊2日の温泉旅行（想定費用: 約${Math.round(avgBudget)}円）`;
        document.getElementById('planBDesc').innerText = `グランピング施設で大自然とリッチなBBQを堪能するプラン（想定費用: 約${Math.round(avgBudget * 0.9)}円）`;
    }
}

// ★本物の1人1票投票ロック
function castVote(plan) {
    // 投票前に希望を出しているかチェック
    database.ref('groups/' + groupName + '/surveys/' + currentUserId).once('value', function(snapshot) {
        if (!snapshot.exists()) {
            alert("投票する前に、まずは「1. あなたの希望を入力」から条件を送信してください！");
            return;
        }

        // すでにこのIDで投票データがあるかデータベースを見にいく
        database.ref('groups/' + groupName + '/votes/' + currentUserId).once('value', function(voteSnapshot) {
            if (voteSnapshot.exists()) {
                alert(`❌ エラー: ID「${currentUserId}」はすでに投票済みです。本物のアプリなので1人1票しか入れられません！`);
                return;
            }

            // なければ投票をデータベースに記録（これで完全に1人1票になる）
            database.ref('groups/' + groupName + '/votes/' + currentUserId).set(plan);
            alert("投票が完了しました！");
        });
    });
}

// 投票結果円グラフの更新
function updateVoteChart(voteData) {
    let countA = 0;
    let countB = 0;

    Object.values(voteData).forEach(v => {
        if (v === 'A') countA++;
        if (v === 'B') countB++;
    });

    if (voteChartIdx) voteChartIdx.destroy();
    const ctxV = document.getElementById('voteChart').getContext('2d');
    voteChartIdx = new Chart(ctxV, {
        type: 'pie',
        data: {
            labels: ['プランA', 'プランB'],
            datasets: [{ data: [countA, countB], backgroundColor: ['#2ecc71', '#3498db'] }]
        },
        options: { responsive: true }
    });
}
